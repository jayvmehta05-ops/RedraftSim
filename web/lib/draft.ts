/**
 * Snake mock-draft engine + AI bot logic.
 *
 * Bots score the top of the available pool (by active-settings ADP) with:
 *   ADP value (how far a player has fallen past his ADP)
 * + VORP edge vs. the other candidates
 * + roster-need logic derived from the active roster config (starters, FLEX, 1QB, TE caps, endgame fill)
 * + positional-run contagion (recent picks of the same position push bots to follow)
 * + per-bot personality (positional lean, rookie appetite, randomness)
 */
import type { LeagueConfig, Pos, RankedPlayer } from "./types";
import { POSITIONS } from "./types";

export interface BotProfile {
  name: string;
  style: string;
  noise: number;           // stdev of random jitter, in "picks"
  posBias: Partial<Record<Pos, number>>; // early-round lean, in "picks"
  /** per-phase lean learned from a real manager's past drafts (overrides posBias when present) */
  posBiasByPhase?: Record<"early" | "mid" | "late", Partial<Record<Pos, number>>>;
  runSensitivity: number;  // 0 = ignores runs, 1 = normal, 2 = herd animal
  rookieBias: number;      // + likes rookies, - avoids them
  vorpWeight: number;
}

export const BOT_PROFILES: BotProfile[] = [
  { name: "ADP Andy", style: "Sticks to consensus", noise: 1.2, posBias: {}, runSensitivity: 0.6, rookieBias: 0, vorpWeight: 0.8 },
  { name: "Zero-RB Zoe", style: "Loads WR/TE early", noise: 2.5, posBias: { WR: 4, TE: 2, RB: -5 }, runSensitivity: 1, rookieBias: 0, vorpWeight: 1 },
  { name: "Hero-RB Hank", style: "Anchor RB, then WR", noise: 2.5, posBias: { RB: 4, WR: 1 }, runSensitivity: 1, rookieBias: 0, vorpWeight: 1 },
  { name: "Early-QB Quinn", style: "Takes an elite QB early", noise: 2.5, posBias: { QB: 9 }, runSensitivity: 1, rookieBias: 0, vorpWeight: 1 },
  { name: "TE Truther", style: "Pays up for an elite TE", noise: 2.5, posBias: { TE: 7 }, runSensitivity: 1, rookieBias: 0, vorpWeight: 1 },
  { name: "Rookie Fever Rita", style: "Chases 2027 rookie upside", noise: 3, posBias: {}, runSensitivity: 1, rookieBias: 6, vorpWeight: 0.8 },
  { name: "Vet Vince", style: "Proven producers only", noise: 2, posBias: {}, runSensitivity: 0.8, rookieBias: -8, vorpWeight: 1.2 },
  { name: "Run-Chaser Ray", style: "Follows every positional run", noise: 2.5, posBias: {}, runSensitivity: 2.2, rookieBias: 0, vorpWeight: 0.9 },
  { name: "VORP Valerie", style: "Pure value-over-replacement", noise: 1.5, posBias: {}, runSensitivity: 0.3, rookieBias: 0, vorpWeight: 2.2 },
  { name: "Chaos Carl", style: "Unpredictable reaches", noise: 7, posBias: {}, runSensitivity: 1.3, rookieBias: 2, vorpWeight: 0.6 },
  { name: "Balanced Bea", style: "Best player, balanced roster", noise: 2, posBias: {}, runSensitivity: 1, rookieBias: 0, vorpWeight: 1.1 },
];

// ------------------------------------------------------------------ rng
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number) {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ------------------------------------------------------------------ snake order
/** 0-based team index on the clock for 0-based overall pick index. */
export function teamOnClock(pickIdx: number, teams: number): number {
  const round = Math.floor(pickIdx / teams);
  const inRound = pickIdx % teams;
  return round % 2 === 0 ? inRound : teams - 1 - inRound;
}

export function teamPickIndices(team: number, teams: number, rounds: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < teams * rounds; i++) if (teamOnClock(i, teams) === team) out.push(i);
  return out;
}

// ------------------------------------------------------------------ rosters / needs
export type Counts = Record<Pos, number>;

export function countPositions(roster: RankedPlayer[]): Counts {
  const c: Counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
  roster.forEach((p) => (c[p.pos] += 1));
  return c;
}

/** Starting slots (incl. FLEX) still empty given the roster's position counts. */
export function openStarterSlots(c: Counts, cfg: LeagueConfig) {
  const r = cfg.roster;
  const open: Record<Pos | "FLEX" | "SUPERFLEX", number> = {
    QB: Math.max(0, r.QB - c.QB),
    RB: Math.max(0, r.RB - c.RB),
    WR: Math.max(0, r.WR - c.WR),
    TE: Math.max(0, r.TE - c.TE),
    FLEX: 0,
    SUPERFLEX: 0,
  };
  const flexExcess = cfg.flex_eligible.reduce((s, p) => s + Math.max(0, c[p] - r[p]), 0);
  open.FLEX = Math.max(0, r.FLEX - flexExcess);
  // Superflex takes whatever FLEX didn't absorb, plus any extra QBs.
  const sfFill = Math.max(0, flexExcess - r.FLEX) + Math.max(0, c.QB - r.QB);
  open.SUPERFLEX = Math.max(0, (r.SUPERFLEX ?? 0) - sfFill);
  return open;
}

function needScore(pos: Pos, c: Counts, round: number, picksLeft: number, cfg: LeagueConfig): number {
  const open = openStarterSlots(c, cfg);
  const required = open.QB + open.RB + open.WR + open.TE + open.FLEX + open.SUPERFLEX;
  const fillsRequired = open[pos] > 0 || (cfg.flex_eligible.includes(pos) && open.FLEX > 0) || open.SUPERFLEX > 0;
  // Endgame: must fill the starting lineup with the picks remaining.
  if (picksLeft <= required) return fillsRequired ? 100 : -100;

  const slots = cfg.roster[pos];
  if (pos === "QB" || pos === "TE") {
    if (c[pos] < slots) {
      let s = pos === "QB" && round <= 2 ? -8 : pos === "QB" ? 2 : 1;
      if (round >= 7) s += 4;
      if (round >= 10) s += 10;
      return s;
    }
    if (pos === "QB" && open.SUPERFLEX > 0) return 4 + (round >= 4 ? 3 : 0); // superflex: a 2nd QB starts
    if (c[pos] === slots) return round < 11 ? -40 : -6; // backup only very late
    return -100;
  }
  // RB / WR
  if (open[pos] > 0) return 3 + (round >= 6 ? 3 : 0);
  if (cfg.flex_eligible.includes(pos) && open.FLEX > 0) return 1.5;
  if (open.SUPERFLEX > 0) return 1;
  if (c[pos] >= 7) return -50;
  if (c[pos] >= 6) return -10;
  // Balance bench: lean toward the thinner of RB/WR
  const other = pos === "RB" ? c.WR : c.RB;
  return c[pos] > other + 1 ? -2 : 0.5;
}

function runScore(pos: Pos, recent: RankedPlayer[], sensitivity: number, c: Counts, cfg: LeagueConfig): number {
  const n = recent.filter((p) => p.pos === pos).length;
  if (pos === "QB" || pos === "TE") {
    if (c[pos] >= cfg.roster[pos] + (pos === "QB" ? cfg.roster.SUPERFLEX ?? 0 : 0)) return 0;
    return n >= 2 ? sensitivity * (n - 1) * 3 : 0;
  }
  return n >= 3 ? sensitivity * (n - 2) * 2 : 0;
}

export interface PickContext {
  available: RankedPlayer[]; // sorted by cur.adp
  roster: RankedPlayer[];
  recent: RankedPlayer[];    // last ~6 picks league-wide
  pickIdx: number;
  picksLeft: number;         // including this pick
  cfg: LeagueConfig;
}

export interface Scored {
  player: RankedPlayer;
  score: number;
  parts: { value: number; vorp: number; need: number; run: number };
}

/** Deterministic part of the pick score (no personality / noise). Also used for "Suggested" picks. */
export function scoreCandidates(ctx: PickContext, window = 24): Scored[] {
  const { available, roster, recent, pickIdx, picksLeft, cfg } = ctx;
  const pickNo = pickIdx + 1;
  const round = Math.ceil(pickNo / cfg.teams);
  const c = countPositions(roster);
  const cands = available.slice(0, window);
  const vorps = cands.map((p) => p.cur.vorp).sort((a, b) => a - b);
  const med = vorps[Math.floor(vorps.length / 2)] ?? 0;
  return cands.map((p) => {
    const value = Math.min(pickNo - p.cur.adp, 15);
    const vorp = (p.cur.vorp - med) / 15;
    const need = needScore(p.pos, c, round, picksLeft, cfg);
    const run = runScore(p.pos, recent, 1, c, cfg);
    return { player: p, score: value + vorp + need + run, parts: { value, vorp, need, run } };
  });
}

export function botPick(ctx: PickContext, bot: BotProfile, rng: () => number): RankedPlayer {
  const round = Math.ceil((ctx.pickIdx + 1) / ctx.cfg.teams);
  const early = round <= 6 ? 1 : round <= 10 ? 0.5 : 0.2;
  const scored = scoreCandidates(ctx).map((s) => {
    const p = s.player;
    const run = s.parts.run * bot.runSensitivity;
    const phase = round <= 5 ? "early" : round <= 10 ? "mid" : "late";
    const bias = bot.posBiasByPhase ? (bot.posBiasByPhase[phase][p.pos] ?? 0) : (bot.posBias[p.pos] ?? 0) * early;
    const rookie = p.rookie ? bot.rookieBias : 0;
    const score = s.parts.value + s.parts.vorp * bot.vorpWeight + s.parts.need + run + bias + rookie + gaussian(rng) * bot.noise;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.p ?? ctx.available[0];
}

// ------------------------------------------------------------------ lineups / grades
export function optimalLineup(roster: RankedPlayer[], cfg: LeagueConfig) {
  const byPts = [...roster].sort((a, b) => b.cur.points - a.cur.points);
  const used = new Set<string>();
  const slots: { slot: string; player: RankedPlayer | null }[] = [];
  for (const pos of POSITIONS) {
    for (let i = 0; i < cfg.roster[pos]; i++) {
      const p = byPts.find((x) => x.pos === pos && !used.has(x.id)) ?? null;
      if (p) used.add(p.id);
      slots.push({ slot: pos, player: p });
    }
  }
  for (let i = 0; i < cfg.roster.FLEX; i++) {
    const p = byPts.find((x) => cfg.flex_eligible.includes(x.pos) && !used.has(x.id)) ?? null;
    if (p) used.add(p.id);
    slots.push({ slot: "FLEX", player: p });
  }
  for (let i = 0; i < (cfg.roster.SUPERFLEX ?? 0); i++) {
    const p = byPts.find((x) => !used.has(x.id)) ?? null;
    if (p) used.add(p.id);
    slots.push({ slot: "SFLEX", player: p });
  }
  const bench = byPts.filter((p) => !used.has(p.id));
  const starterPoints = slots.reduce((s, x) => s + (x.player?.cur.points ?? 0), 0);
  const starterVorp = slots.reduce((s, x) => s + (x.player?.cur.vorp ?? 0), 0);
  const benchPoints = bench.slice(0, 4).reduce((s, p) => s + p.cur.points, 0);
  return { slots, bench, starterPoints, starterVorp, benchPoints };
}

export function letterGrade(z: number): string {
  if (z >= 1.4) return "A+";
  if (z >= 0.9) return "A";
  if (z >= 0.5) return "A-";
  if (z >= 0.2) return "B+";
  if (z >= -0.1) return "B";
  if (z >= -0.4) return "B-";
  if (z >= -0.8) return "C+";
  if (z >= -1.2) return "C";
  return "D";
}
