/**
 * Trade assistant engine.
 *
 * A trade is worth what it does to each team's best possible starting lineup (plus a little bench depth),
 * not the raw sum of player values, so 2-for-1 consolidation and positional need are handled naturally.
 *
 * Horizons:
 *   ros  — rest of the current season (ESPN rest-of-season projection when available, else a blend of this
 *          season's PPG and the next-season projection) × weeks left × availability
 *   next — next season's projected points (the big board)
 *   both — sum of the two (keeper / dynasty leagues)
 */
import type { LeaguemateProfile } from "./leaguemates";
import type { LeagueConfig, Pos, RankedPlayer } from "./types";
import { POSITIONS } from "./types";

export type Horizon = "ros" | "next" | "both";
const BENCH_WEIGHT = 0.15;
const BENCH_DEPTH = 4;

export function playerValue(p: RankedPlayer, horizon: Horizon, weeksLeft: number): number {
  const next = Math.max(0, p.cur.points);
  if (horizon === "next") return next;
  const rosPpg = p.cur.espnRosPpg ?? (p.g26 > 0 ? 0.6 * p.cur.ppg26 + 0.4 * p.cur.ppg : 0);
  let avail = Math.min(1, p.projGames / 17 + 0.08);
  if (p.injury === "IR" || p.injury === "PUP") avail *= 0.35;
  else if (p.injury === "Out") avail *= 0.8;
  const ros = Math.max(0, rosPpg) * weeksLeft * avail;
  return horizon === "ros" ? ros : ros + next;
}

export interface Valued {
  p: RankedPlayer;
  v: number;
}

/** Best starting lineup value for a roster under the league's slots (greedy is optimal for nested flex slots). */
export function lineupValue(roster: Valued[], cfg: LeagueConfig): { total: number; starters: Valued[]; bench: Valued[] } {
  const byPos: Record<Pos, Valued[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const x of roster) byPos[x.p.pos]?.push(x);
  for (const pos of POSITIONS) byPos[pos].sort((a, b) => b.v - a.v);
  const used = new Set<string>();
  const starters: Valued[] = [];
  for (const pos of POSITIONS) {
    for (const x of byPos[pos].slice(0, cfg.roster[pos] ?? 0)) {
      starters.push(x);
      used.add(x.p.id);
    }
  }
  const rest = (eligible: Pos[]) =>
    roster.filter((x) => !used.has(x.p.id) && eligible.includes(x.p.pos)).sort((a, b) => b.v - a.v);
  for (let i = 0; i < (cfg.roster.FLEX ?? 0); i++) {
    const x = rest(cfg.flex_eligible)[0];
    if (x) { starters.push(x); used.add(x.p.id); }
  }
  for (let i = 0; i < (cfg.roster.SUPERFLEX ?? 0); i++) {
    const x = rest(POSITIONS)[0];
    if (x) { starters.push(x); used.add(x.p.id); }
  }
  const bench = roster.filter((x) => !used.has(x.p.id)).sort((a, b) => b.v - a.v);
  // Bench depth only matters for positions that can actually step into the lineup. In a 1-QB league a backup QB
  // starts only on bye or injury, so he counts for very little; RB/WR/TE backups also cover the FLEX.
  const benchW = (pos: Pos) => (pos === "QB" && !(cfg.roster.SUPERFLEX ?? 0) ? 0.2 : 1) * BENCH_WEIGHT;
  const depth = bench.map((x) => x.v * benchW(x.p.pos)).sort((a, b) => b - a).slice(0, BENCH_DEPTH);
  const total = starters.reduce((s, x) => s + x.v, 0) + depth.reduce((s, v) => s + v, 0);
  return { total, starters, bench };
}

export interface TradeEval {
  partnerId: string;
  give: RankedPlayer[];
  get: RankedPlayer[];
  myBefore: number;
  myAfter: number;
  theirBefore: number;
  theirAfter: number;
  myGain: number;
  theirGain: number;
  accept: number; // 0..1 estimated chance the other manager says yes
  reasons: string[];
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** How the other manager sees it: lineup gain, how the names look by ADP, and their positional tastes. */
function acceptance(theirGainPct: number, give: RankedPlayer[], get: RankedPlayer[], lean?: LeaguemateProfile): number {
  // From their side they receive `give` and send `get`.
  const adpScore = (ps: RankedPlayer[]) => ps.reduce((s, p) => s + Math.max(0, 220 - p.cur.adp), 0);
  const perceived = (adpScore(give) - adpScore(get)) / 40;
  let taste = 0;
  const early = lean?.posBiasByPhase?.early;
  if (early) {
    for (const p of give) taste += (early[p.pos] ?? 0) / 8;
    for (const p of get) taste -= (early[p.pos] ?? 0) / 8;
  }
  // Lineup impact dominates; name value (ADP) and positional taste nudge it
  return sigmoid(-0.3 + 45 * theirGainPct + 0.25 * Math.max(-3, Math.min(3, perceived)) + 0.5 * taste
    + 0.6 * (lean?.tradeOpenness ?? 0));
}

export function evaluateTrade(
  mine: Valued[], theirs: Valued[], give: RankedPlayer[], get: RankedPlayer[], cfg: LeagueConfig,
  partnerId: string, lean?: LeaguemateProfile, before?: { mine: number; theirs: number },
): TradeEval {
  const giveIds = new Set(give.map((p) => p.id));
  const getIds = new Set(get.map((p) => p.id));
  const myBefore = before?.mine ?? lineupValue(mine, cfg).total;
  const theirBefore = before?.theirs ?? lineupValue(theirs, cfg).total;
  const myNew = [...mine.filter((x) => !giveIds.has(x.p.id)), ...theirs.filter((x) => getIds.has(x.p.id))];
  const theirNew = [...theirs.filter((x) => !getIds.has(x.p.id)), ...mine.filter((x) => giveIds.has(x.p.id))];
  const myLineupAfter = lineupValue(myNew, cfg);
  const myAfter = myLineupAfter.total;
  const theirAfter = lineupValue(theirNew, cfg).total;
  const myGain = myAfter - myBefore;
  const theirGain = theirAfter - theirBefore;
  const accept = acceptance(theirBefore > 0 ? theirGain / theirBefore : 0, give, get, lean);

  const reasons: string[] = [];
  const posList = (ps: RankedPlayer[]) => Array.from(new Set(ps.map((p) => p.pos))).join("/");
  if (give.length > get.length) reasons.push(`Consolidates ${give.length}-for-${get.length} into a better starter`);
  if (get.length > give.length) reasons.push(`Adds depth: ${get.length} players for ${give.length}`);
  const newStarters = get.filter((p) => myLineupAfter.starters.some((x) => x.p.id === p.id));
  if (myGain > 0 && newStarters.length) reasons.push(`Upgrades your ${posList(newStarters)} starting spot`);
  else if (myGain > 0) reasons.push("Adds bench depth");
  if (theirGain > 0) reasons.push(`Fills their ${posList(give)} need, so it helps them too`);
  const early = lean?.posBiasByPhase?.early;
  const loved = give.filter((p) => (early?.[p.pos] ?? 0) >= 2).map((p) => p.pos);
  if (loved.length) reasons.push(`${lean?.name ?? "They"} loves ${Array.from(new Set(loved)).join("/")}s`);
  if ((lean?.tradeOpenness ?? 0) >= 1) reasons.push(`${lean?.name ?? "They"} trades often`);
  if ((lean?.tradeOpenness ?? 0) <= -1) reasons.push(`${lean?.name ?? "They"} rarely trades, so expect a harder sell`);
  return { partnerId, give, get, myBefore, myAfter, theirBefore, theirAfter, myGain, theirGain, accept, reasons };
}

function combos<T>(xs: T[], k: number): T[][] {
  if (k === 1) return xs.map((x) => [x]);
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) out.push([xs[i], xs[j]]);
  return out;
}

export interface Partner {
  id: string;
  name: string;
  roster: Valued[];
  lean?: LeaguemateProfile;
}

/** Search 1-for-1, 2-for-1, 1-for-2 and 2-for-2 trades with every partner; keep ones that help you and that
 *  they'd plausibly accept. */
export function findTrades(mine: Valued[], partners: Partner[], cfg: LeagueConfig, opts = { perPartner: 2, total: 12 }): TradeEval[] {
  const top = (r: Valued[], n: number) => [...r].sort((a, b) => b.v - a.v).slice(0, n).map((x) => x.p);
  const myCands = top(mine, 8);
  const myBefore = lineupValue(mine, cfg).total;
  const out: TradeEval[] = [];
  for (const partner of partners) {
    const theirCands = top(partner.roster, 8);
    const theirBefore = lineupValue(partner.roster, cfg).total;
    const before = { mine: myBefore, theirs: theirBefore };
    const found: TradeEval[] = [];
    for (const [gk, rk] of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) {
      for (const give of combos(myCands, gk)) {
        for (const get of combos(theirCands, rk)) {
          const t = evaluateTrade(mine, partner.roster, give, get, cfg, partner.id, partner.lean, before);
          // Must clearly help you, must not meaningfully hurt them, and must be plausible
          if (t.myGain / Math.max(myBefore, 1) < 0.004) continue;
          if (t.theirGain / Math.max(theirBefore, 1) < -0.005 || t.accept < 0.35) continue;
          found.push(t);
        }
      }
    }
    found.sort((a, b) => b.myGain * b.accept - a.myGain * a.accept);
    // Keep distinct ideas: don't repeat the same players going out or coming back
    const seenGive = new Set<string>();
    const seenGet = new Set<string>();
    let kept = 0;
    for (const t of found) {
      const gKey = t.give.map((p) => p.id).sort().join(",");
      const rKey = t.get.map((p) => p.id).sort().join(",");
      if (seenGive.has(gKey) || seenGet.has(rKey)) continue;
      seenGive.add(gKey);
      seenGet.add(rKey);
      out.push(t);
      if (++kept >= opts.perPartner) break;
    }
  }
  // Across partners, avoid suggesting the exact same package more than twice
  const counts = new Map<string, number>();
  return out
    .sort((a, b) => b.myGain * b.accept - a.myGain * a.accept)
    .filter((t) => {
      const k = t.give.map((p) => p.id).sort().join(",");
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return (counts.get(k) ?? 0) <= 2;
    })
    .slice(0, opts.total);
}

/** The best lineup laid out slot by slot (QB, RB, RB, …, FLEX, SUPERFLEX); empty slots come back as null. */
export function lineupSlots(roster: Valued[], cfg: LeagueConfig): { slot: string; x: Valued | null }[] {
  const { starters } = lineupValue(roster, cfg);
  const left = [...starters];
  const take = (ok: (x: Valued) => boolean) => {
    const i = left.findIndex(ok);
    return i >= 0 ? left.splice(i, 1)[0] : null;
  };
  const out: { slot: string; x: Valued | null }[] = [];
  // Fixed slots first, filled by that position's best players (same order lineupValue used)
  for (const pos of POSITIONS) for (let i = 0; i < (cfg.roster[pos] ?? 0); i++) out.push({ slot: pos, x: take((x) => x.p.pos === pos) });
  // Whatever starters remain went to FLEX, then SUPERFLEX
  for (let i = 0; i < (cfg.roster.FLEX ?? 0); i++) out.push({ slot: "FLEX", x: take((x) => cfg.flex_eligible.includes(x.p.pos)) });
  for (let i = 0; i < (cfg.roster.SUPERFLEX ?? 0); i++) out.push({ slot: "SFLEX", x: take(() => true) });
  return out;
}

/** Each team's starting-lineup strength by position group, for "what do they need" context. */
export function positionStrength(roster: Valued[], cfg: LeagueConfig): Record<Pos, number> {
  const { starters } = lineupValue(roster, cfg);
  const out = { QB: 0, RB: 0, WR: 0, TE: 0 } as Record<Pos, number>;
  for (const x of starters) out[x.p.pos] += x.v;
  return out;
}
