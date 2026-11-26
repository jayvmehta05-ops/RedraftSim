/**
 * Trade assistant engine.
 *
 * A trade is worth what it does to each team's best possible starting lineup plus bench depth, not the raw
 * sum of player values, so 2-for-1 consolidation and positional need are handled naturally. The first healthy
 * backup at each position you start counts for more than the rest of the bench: he plays whenever a starter
 * is on bye or hurt, so trading away your only backup RB costs you something real.
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

export type Horizon = "ros" | "next" | "both" | "week";
const BENCH_WEIGHT = 0.15;
const BENCH_DEPTH = 4;
/** Rough share of games a starter misses (bye week + injuries), i.e. how often his backup has to play. */
const MISS: Record<Pos, number> = { QB: 0.08, RB: 0.17, WR: 0.13, TE: 0.12 };
const UNAVAILABLE = new Set(["IR", "PUP", "Out", "Suspended", "NA"]);
/** Can this player actually fill in right now (not on IR, out or suspended)? */
export const isHealthy = (p: RankedPlayer) => !UNAVAILABLE.has(p.injury ?? "");

export function playerValue(p: RankedPlayer, horizon: Horizon, weeksLeft: number): number {
  const next = Math.max(0, p.cur.points);
  if (horizon === "next") return next;
  // Without ESPN's rest-of-season projection, blend this season's average with our projection, trusting the
  // season more as games pile up (early in the year a hot or cold start is mostly noise)
  const seasonWeight = p.g26 > 0 ? Math.min(0.75, p.g26 / (p.g26 + 4)) : 0;
  const rosPpg = p.cur.espnRosPpg ?? (p.g26 > 0 ? seasonWeight * p.cur.ppg26 + (1 - seasonWeight) * p.cur.ppg : 0);
  if (horizon === "week") {
    // One week (1-week / loan trades): only this week's health matters
    const status = p.injury ?? "";
    const health = ["IR", "PUP", "Out", "Suspended", "NA"].includes(status) ? 0 : status === "Doubtful" ? 0.25 : status === "Questionable" ? 0.85 : 1;
    return Math.max(0, rosPpg) * health;
  }
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
export function lineupValue(roster: Valued[], cfg: LeagueConfig): { total: number; starters: Valued[]; bench: Valued[]; startersAt: Record<Pos, number> } {
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
  const startersAt = { QB: 0, RB: 0, WR: 0, TE: 0 } as Record<Pos, number>;
  for (const x of starters) startersAt[x.p.pos] += 1;
  // Insurance: your best healthy backup at each position you start plays whenever a starter is on bye or hurt,
  // so he's worth about (share of games a starter misses) x (how many you start there)
  const insured = new Set<string>();
  let insurance = 0;
  for (const pos of POSITIONS) {
    if (!startersAt[pos]) continue;
    const backup = bench.find((x) => x.p.pos === pos && isHealthy(x.p));
    if (!backup) continue;
    insurance += backup.v * Math.max(benchW(pos), Math.min(0.5, MISS[pos] * startersAt[pos]));
    insured.add(backup.p.id);
  }
  const depth = bench.filter((x) => !insured.has(x.p.id)).map((x) => x.v * benchW(x.p.pos))
    .sort((a, b) => b - a).slice(0, Math.max(0, BENCH_DEPTH - insured.size));
  const total = starters.reduce((s, x) => s + x.v, 0) + insurance + depth.reduce((s, v) => s + v, 0);
  return { total, starters, bench, startersAt };
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
  /** your healthy players at each position whose count changes, before -> after */
  depth: DepthChange[];
  /** plain-English warnings about what the trade leaves you short of */
  warnings: string[];
}

export interface DepthChange { pos: Pos; before: number; after: number }

/**
 * What a trade does to your roster's shape: healthy players per position before and after, and a warning
 * when it leaves a starting spot you can't fill or takes away your last backup at a position.
 */
export function depthReport(before: Valued[], after: Valued[], cfg: LeagueConfig): { depth: DepthChange[]; warnings: string[] } {
  const count = (r: Valued[]) => {
    const c = { QB: 0, RB: 0, WR: 0, TE: 0 } as Record<Pos, number>;
    for (const x of r) if (isHealthy(x.p)) c[x.p.pos] += 1;
    return c;
  };
  const b = count(before), a = count(after);
  const lb = lineupValue(before, cfg), la = lineupValue(after, cfg);
  // Can someone step in when one of your starters at `pos` misses a week? Either a spare at that position, or,
  // when one of them plays FLEX, he slides into the position's spot and a healthy bench RB/WR/TE takes the FLEX.
  const covered = (c: Record<Pos, number>, l: ReturnType<typeof lineupValue>, pos: Pos) => {
    const slots = cfg.roster[pos] ?? 0;
    if (c[pos] <= slots) return false;
    if (c[pos] > l.startersAt[pos]) return true;
    return cfg.flex_eligible.includes(pos) && l.bench.some((x) => cfg.flex_eligible.includes(x.p.pos) && isHealthy(x.p));
  };
  const depth: DepthChange[] = [];
  const warnings: string[] = [];
  const plural = (n: number, pos: Pos) => `${n} healthy ${pos}${n === 1 ? "" : "s"}`;
  for (const pos of POSITIONS) {
    if (a[pos] === b[pos]) continue;
    depth.push({ pos, before: b[pos], after: a[pos] });
    if (a[pos] >= b[pos]) continue;
    const slots = cfg.roster[pos] ?? 0;
    if (a[pos] < slots) {
      warnings.push(`Leaves an empty ${pos} spot: ${plural(a[pos], pos)} for ${slots} starting ${slots === 1 ? "spot" : "spots"}`);
    } else if (slots > 0 && covered(b, lb, pos) && !covered(a, la, pos)) {
      warnings.push(`No backup ${pos} left (${plural(a[pos], pos)}): a bye or injury means grabbing someone off waivers`);
    }
  }
  return { depth, warnings };
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
  const { depth, warnings } = depthReport(mine, myNew, cfg);
  return { partnerId, give, get, myBefore, myAfter, theirBefore, theirAfter, myGain, theirGain, accept, reasons, depth, warnings };
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
export function findTrades(mine: Valued[], partners: Partner[], cfg: LeagueConfig, opts = { perPartner: 2, total: 12 }, locked: Set<string> = new Set()): TradeEval[] {
  // Locked players (e.g. on a 1-week trade) still count in lineups but are never offered or asked for
  const top = (r: Valued[], n: number) => [...r].filter((x) => !locked.has(x.p.id)).sort((a, b) => b.v - a.v).slice(0, n).map((x) => x.p);
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

/** Distinct packages, best first: no two results send the same players. */
function distinctBy(ts: TradeEval[], key: (t: TradeEval) => string, limit: number): TradeEval[] {
  const seen = new Set<string>();
  const out: TradeEval[] = [];
  for (const t of ts) {
    const k = key(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}
const ids = (ps: RankedPlayer[]) => ps.map((p) => p.id).sort().join(",");

/**
 * "I want this player": offers to `partner` that land `target`, best first. Tries giving one or two of your
 * top players for the target alone or the target plus one of theirs. Ranked by the chance they say yes and how
 * little it costs your lineup. If nothing is realistic, the closest long shots come back so you see the gap.
 */
export function findTradesFor(target: RankedPlayer, mine: Valued[], partner: Partner, cfg: LeagueConfig, limit = 4, locked: Set<string> = new Set()): TradeEval[] {
  if (locked.has(target.id)) return [];
  const top = (r: Valued[], n: number) => [...r].filter((x) => !locked.has(x.p.id)).sort((a, b) => b.v - a.v).slice(0, n).map((x) => x.p);
  const myCands = top(mine, 10);
  const extras = top(partner.roster.filter((x) => x.p.id !== target.id), 6);
  const gets: RankedPlayer[][] = [[target], ...extras.map((p) => [target, p])];
  const gives = [...combos(myCands, 1), ...combos(myCands, 2)];
  const before = { mine: lineupValue(mine, cfg).total, theirs: lineupValue(partner.roster, cfg).total };
  const all: TradeEval[] = [];
  for (const get of gets) for (const give of gives) {
    // Don't ask for an extra player of theirs unless you're sending two back
    if (get.length > give.length) continue;
    all.push(evaluateTrade(mine, partner.roster, give, get, cfg, partner.id, partner.lean, before));
  }
  const score = (t: TradeEval) => t.accept + 6 * (t.myGain / Math.max(before.mine, 1));
  const realistic = all.filter((t) => t.accept >= 0.4).sort((a, b) => score(b) - score(a));
  if (realistic.length) return distinctBy(realistic, (t) => ids(t.give), limit);
  return distinctBy([...all].sort((a, b) => b.accept - a.accept), (t) => ids(t.give), Math.min(2, limit));
}

/** "Shop my player": the best realistic return for `player` from every other team. */
export function shopPlayer(player: RankedPlayer, mine: Valued[], partners: Partner[], cfg: LeagueConfig, limit = 4, locked: Set<string> = new Set()): TradeEval[] {
  if (locked.has(player.id)) return [];
  const myBefore = lineupValue(mine, cfg).total;
  const out: TradeEval[] = [];
  for (const partner of partners) {
    const theirs = [...partner.roster].filter((x) => !locked.has(x.p.id)).sort((a, b) => b.v - a.v).slice(0, 8).map((x) => x.p);
    const before = { mine: myBefore, theirs: lineupValue(partner.roster, cfg).total };
    let best: TradeEval | null = null;
    for (const get of [...combos(theirs, 1), ...combos(theirs, 2)]) {
      const t = evaluateTrade(mine, partner.roster, [player], get, cfg, partner.id, partner.lean, before);
      if (t.myGain <= 0 || t.accept < 0.4) continue;
      if (!best || t.myGain * t.accept > best.myGain * best.accept) best = t;
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.myGain * b.accept - a.myGain * a.accept).slice(0, limit);
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
