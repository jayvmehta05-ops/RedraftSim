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
import type { LeagueConfig, Pos, RankedPlayer, TradeTuning } from "./types";
import { DEFAULT_MIN_ACCEPT, DEFAULT_MIN_GAIN } from "./tradeTuning";
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
/** `depthBoost` scales how much your first backup at each position is worth (your trade ratings can raise it). */
export function lineupValue(roster: Valued[], cfg: LeagueConfig, depthBoost = 1): { total: number; starters: Valued[]; bench: Valued[]; startersAt: Record<Pos, number> } {
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
    insurance += backup.v * Math.max(benchW(pos), Math.min(0.5, MISS[pos] * startersAt[pos]) * depthBoost);
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
  /** market value you gain (+) or give away (-), in rough "draft rounds"; below -1.5 you're selling cheap */
  marketEdge: number;
  /** your roster before and after, for the side-by-side lineup view (references, not copies) */
  rosterBefore: Valued[];
  rosterAfter: Valued[];
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

/** Points per game a typical waiver-level starter scores, per position: production above this is what managers notice. */
const PROD_BASE: Record<Pos, number> = { QB: 15, RB: 8, WR: 8, TE: 6 };

/**
 * How valuable a player looks to other managers right now (0..220): this season's draft position on ESPN blended
 * with how he's actually scoring this season. ("He's RB2 in fantasy right now" counts, not just where he was drafted.)
 * Next season's ADP is only a fallback for players ESPN didn't rank.
 */
export function marketValue(p: RankedPlayer): number {
  const adp = Math.max(0, 220 - (p.espnAdp ?? p.cur.adp ?? 220));
  if (!(p.g26 >= 3)) return adp;
  const prod = Math.min(219, Math.max(0, (p.cur.ppg26 ?? 0) - PROD_BASE[p.pos]) * 12);
  return 0.5 * adp + 0.5 * prod;
}

/** A package's market value, top-heavy: the best player counts fully, the second 60%, then 35%, then 20%
 *  (two good players rarely equal one star). */
export function packageValue(ps: RankedPlayer[]): number {
  return ps.map(marketValue).sort((a, b) => b - a).reduce((s, v, i) => s + v * [1, 0.6, 0.35, 0.2][Math.min(i, 3)], 0);
}

/** How the other manager sees it: lineup gain, market value (with a star premium), roster spots and their tastes.
 *  `penalty` = how much harder a sell this manager is, from your "they'd never accept" ratings. */
function acceptance(theirGainPct: number, give: RankedPlayer[], get: RankedPlayer[], lean?: LeaguemateProfile, penalty = 0): number {
  // From their side they receive `give` and send `get`.
  const perceived = (packageValue(give) - packageValue(get)) / 40;
  const nameW = lean?.nameValue ?? 1;
  // Star premium: managers rarely give up the best player in a deal unless a comparable one comes back
  const best = (ps: RankedPlayer[]) => ps.reduce((m, p) => Math.max(m, marketValue(p)), 0);
  const star = Math.max(0, best(get) - best(give)) / 40 * (0.6 + 0.4 * nameW);
  // Roster spots: taking on extra players means cutting someone (and some managers only do even trades)
  const extra = give.length - get.length;
  const rosterCost = lean?.evenOnly ? 1.2 * Math.abs(extra) : 0.45 * Math.max(0, extra);
  let taste = 0;
  const early = lean?.posBiasByPhase?.early;
  if (early) {
    for (const p of give) taste += (early[p.pos] ?? 0) / 8;
    for (const p of get) taste -= (early[p.pos] ?? 0) / 8;
  }
  // What you've told us about how they trade: positions they want or want to move
  const wants = lean?.tradeWants ?? {};
  for (const p of give) taste += (wants[p.pos] ?? 0) / 1.5;
  for (const p of get) taste -= (wants[p.pos] ?? 0) / 2.5;
  // Consolidators like getting fewer, better players; depth-seekers like more bodies back
  const pkg = (lean?.packages ?? 0) * Math.sign(get.length - give.length) * 0.5;
  // Someone who "needs to win" wants about +1% to their lineup per point before it feels like a yes
  const need = 0.008 * (lean?.tradeWin ?? 0);
  // Lineup impact dominates; name value (ADP) and positional taste nudge it
  return sigmoid(-0.3 + 45 * (theirGainPct - need) + 0.25 * nameW * Math.max(-3, Math.min(3, perceived)) + 0.5 * taste
    + pkg + 0.6 * (lean?.tradeOpenness ?? 0) - 0.6 * penalty - star - rosterCost);
}

export function evaluateTrade(
  mine: Valued[], theirs: Valued[], give: RankedPlayer[], get: RankedPlayer[], cfg: LeagueConfig,
  partnerId: string, lean?: LeaguemateProfile, before?: { mine: number; theirs: number },
  /** the trade searches skip the depth report while scoring thousands of combinations, then add it to the winners */
  withDepth = true,
  /** your ratings' tuning for this league: backups' worth and how hard a sell each manager is */
  tuning?: TradeTuning,
): TradeEval {
  const boost = tuning?.depthBoost ?? 1;
  const giveIds = new Set(give.map((p) => p.id));
  const getIds = new Set(get.map((p) => p.id));
  const myBefore = before?.mine ?? lineupValue(mine, cfg, boost).total;
  const theirBefore = before?.theirs ?? lineupValue(theirs, cfg).total;
  const myNew = [...mine.filter((x) => !giveIds.has(x.p.id)), ...theirs.filter((x) => getIds.has(x.p.id))];
  const theirNew = [...theirs.filter((x) => !getIds.has(x.p.id)), ...mine.filter((x) => giveIds.has(x.p.id))];
  const myLineupAfter = lineupValue(myNew, cfg, boost);
  const myAfter = myLineupAfter.total;
  const theirAfter = lineupValue(theirNew, cfg).total;
  const myGain = myAfter - myBefore;
  const theirGain = theirAfter - theirBefore;
  const accept = acceptance(theirBefore > 0 ? theirGain / theirBefore : 0, give, get, lean, tuning?.partnerPenalty?.[partnerId] ?? 0);

  const reasons: string[] = [];
  const posList = (ps: RankedPlayer[]) => Array.from(new Set(ps.map((p) => p.pos))).join("/");
  if (give.length > get.length) reasons.push(`Consolidates ${give.length}-for-${get.length} into a better starter`);
  if (get.length > give.length) reasons.push(`Adds depth: ${get.length} players for ${give.length} (you'll need to drop ${get.length - give.length} to make room)`);
  const newStarters = get.filter((p) => myLineupAfter.starters.some((x) => x.p.id === p.id));
  if (myGain > 0 && newStarters.length) reasons.push(`Upgrades your ${posList(newStarters)} starting spot`);
  else if (myGain > 0) reasons.push("Adds bench depth");
  if (theirGain > 0) reasons.push(`Fills their ${posList(give)} need, so it helps them too`);
  const early = lean?.posBiasByPhase?.early;
  const loved = give.filter((p) => (early?.[p.pos] ?? 0) >= 2).map((p) => p.pos);
  if (loved.length) reasons.push(`${lean?.name ?? "They"} loves ${Array.from(new Set(loved)).join("/")}s`);
  const wanted = give.filter((p) => (lean?.tradeWants?.[p.pos] ?? 0) > 0).map((p) => p.pos);
  if (wanted.length) reasons.push(`${lean?.name ?? "They"} is looking for a ${Array.from(new Set(wanted)).join("/")}`);
  if ((lean?.tradeWin ?? 0) >= 1 && theirGain <= 0) reasons.push(`${lean?.name ?? "They"} likes to win trades, so expect a counter`);
  if ((lean?.tradeOpenness ?? 0) >= 1) reasons.push(`${lean?.name ?? "They"} trades often`);
  if ((lean?.tradeOpenness ?? 0) <= -1) reasons.push(`${lean?.name ?? "They"} rarely trades, so expect a harder sell`);
  // Market value from your side: are you selling below what your players would fetch?
  const marketEdge = (packageValue(get) - packageValue(give)) / 40;
  const topGive = [...give].sort((a, b) => marketValue(b) - marketValue(a))[0];
  if (marketEdge < -0.75 && topGive) reasons.push(`You'd give up more trade value than you get; ${topGive.name} could likely fetch more`);
  const starOut = get.reduce((m, p) => Math.max(m, marketValue(p)), 0) - give.reduce((m, p) => Math.max(m, marketValue(p)), 0);
  if (starOut > 25) reasons.push(`They'd give up the best player in the deal, so expect pushback`);
  if (give.length > get.length) reasons.push(`They'd have to drop ${give.length - get.length} to make room`);
  const { depth, warnings } = withDepth ? depthReport(mine, myNew, cfg) : { depth: [], warnings: [] };
  return { partnerId, give, get, myBefore, myAfter, theirBefore, theirAfter, myGain, theirGain, accept, reasons, depth, warnings, rosterBefore: mine, rosterAfter: myNew, marketEdge };
}

/** Fill in the roster-depth report for a trade scored without it. */
function withDepthReport(t: TradeEval, cfg: LeagueConfig): TradeEval {
  return { ...t, ...depthReport(t.rosterBefore, t.rosterAfter, cfg) };
}

function combos<T>(xs: T[], k: number, from = 0): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  for (let i = from; i <= xs.length - k; i++) for (const rest of combos(xs, k - 1, i + 1)) out.push([xs[i], ...rest]);
  return out;
}

/** Biggest package either side may send (4-for-3, 3-for-4 and so on). */
const MAX_SIDE = 4;
/** A bigger trade must beat the smaller one it grew from by this much (score = your gain × chance of a yes). */
const GROW_MARGIN = 1.12;

/**
 * Grow promising trades into bigger ones: add one player on your side, theirs, or both, and keep a version only
 * when it's clearly better than the trade it grew from. Two rounds, so a 2-for-2 can become 3-for-3 and then 4-for-3.
 * Much cheaper than trying every 3- and 4-player combination, and it only surfaces big trades with a real edge.
 */
function growTrades(
  seeds: TradeEval[], myPool: RankedPlayer[], theirPool: RankedPlayer[], grow: (give: RankedPlayer[], get: RankedPlayer[]) => TradeEval,
  rounds = 2, beam = 4,
): TradeEval[] {
  const score = (t: TradeEval) => Math.max(0, t.myGain) * t.accept;
  const seen = new Set<string>();
  const key = (g: RankedPlayer[], r: RankedPlayer[]) => `${g.map((p) => p.id).sort().join(",")}>${r.map((p) => p.id).sort().join(",")}`;
  const out: TradeEval[] = [];
  let frontier = seeds;
  for (let round = 0; round < rounds && frontier.length; round++) {
    const next: TradeEval[] = [];
    for (const seed of frontier.slice(0, beam)) {
      const giveIds = new Set(seed.give.map((p) => p.id));
      const getIds = new Set(seed.get.map((p) => p.id));
      const addMine = seed.give.length < MAX_SIDE ? myPool.filter((p) => !giveIds.has(p.id)).slice(0, 5) : [];
      const addTheirs = seed.get.length < MAX_SIDE ? theirPool.filter((p) => !getIds.has(p.id)).slice(0, 5) : [];
      const variants: [RankedPlayer[], RankedPlayer[]][] = [
        ...addMine.map((p): [RankedPlayer[], RankedPlayer[]] => [[...seed.give, p], seed.get]),
        ...addTheirs.map((p): [RankedPlayer[], RankedPlayer[]] => [seed.give, [...seed.get, p]]),
        ...addMine.flatMap((a) => addTheirs.map((b): [RankedPlayer[], RankedPlayer[]] => [[...seed.give, a], [...seed.get, b]])),
      ];
      for (const [give, get] of variants) {
        const k = key(give, get);
        if (seen.has(k)) continue;
        seen.add(k);
        const t = grow(give, get);
        if (score(t) >= score(seed) * GROW_MARGIN && t.myGain > seed.myGain * 0.9) next.push(t);
      }
    }
    next.sort((a, b) => score(b) - score(a));
    out.push(...next);
    frontier = next;
  }
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
export function findTrades(mine: Valued[], partners: Partner[], cfg: LeagueConfig, opts = { perPartner: 2, total: 12 }, locked: Set<string> = new Set(), tuning?: TradeTuning): TradeEval[] {
  const minGain = tuning?.minGainPct ?? DEFAULT_MIN_GAIN;
  const minAccept = tuning?.minAccept ?? DEFAULT_MIN_ACCEPT;
  // Locked players (e.g. on a 1-week trade) still count in lineups but are never offered or asked for
  const top = (r: Valued[], n: number) => [...r].filter((x) => !locked.has(x.p.id)).sort((a, b) => b.v - a.v).slice(0, n).map((x) => x.p);
  const myCands = top(mine, 8);
  const myBefore = lineupValue(mine, cfg, tuning?.depthBoost ?? 1).total;
  const out: TradeEval[] = [];
  for (const partner of partners) {
    const theirCands = top(partner.roster, 8);
    const theirBefore = lineupValue(partner.roster, cfg).total;
    const before = { mine: myBefore, theirs: theirBefore };
    const found: TradeEval[] = [];
    const seeds: TradeEval[] = [];
    const ok = (t: TradeEval) =>
      // Must clearly help you, must not meaningfully hurt them, must be plausible, and mustn't sell your players cheap
      t.myGain / Math.max(myBefore, 1) >= minGain && t.theirGain / Math.max(theirBefore, 1) >= -0.005 && t.accept >= minAccept
      && t.marketEdge >= -1.5;
    const evalT = (give: RankedPlayer[], get: RankedPlayer[]) =>
      evaluateTrade(mine, partner.roster, give, get, cfg, partner.id, partner.lean, before, false, tuning);
    for (const [gk, rk] of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) {
      for (const give of combos(myCands, gk)) {
        for (const get of combos(theirCands, rk)) {
          const t = evalT(give, get);
          if (t.myGain > 0) seeds.push(t); // promising even if they'd say no yet: a sweetener can fix that
          if (ok(t)) found.push(t);
        }
      }
    }
    // Bigger deals (3-for-2, 3-for-3, up to 4 a side) when adding players makes a trade clearly better
    seeds.sort((a, b) => b.myGain * b.accept - a.myGain * a.accept);
    for (const t of growTrades(seeds, top(mine, 10), top(partner.roster, 10), evalT)) if (ok(t)) found.push(t);
    // Lineup gain x chance of a yes, nudged by market value (getting more than you give is better)
    const rank = (t: TradeEval) => t.myGain * t.accept * (1 + 0.12 * Math.max(-2, Math.min(2, t.marketEdge)));
    found.sort((a, b) => rank(b) - rank(a));
    // Keep distinct ideas: don't repeat the same players going out or coming back
    const seenGive = new Set<string>();
    const seenGet = new Set<string>();
    let kept = 0;
    for (const t of found) {
      const gKey = t.give.map((p) => p.id).sort().join(",");
      const rKey = t.get.map((p) => p.id).sort().join(",");
      if (seenGive.has(gKey) || seenGet.has(rKey)) continue;
      // Skip near-copies: a second idea with this team that shares most of its players with one already kept
      const overlap = (a: RankedPlayer[], b: RankedPlayer[]) => a.filter((p) => b.some((q) => q.id === p.id)).length;
      if (out.slice(out.length - kept).some((k) => overlap(k.give, t.give) + overlap(k.get, t.get) >= Math.max(2, t.give.length + t.get.length - 2))) continue;
      // You asked not to see trades that leave you short at a position
      if (tuning?.hideThin && depthReport(t.rosterBefore, t.rosterAfter, cfg).warnings.length) continue;
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
    .slice(0, opts.total)
    .map((t) => withDepthReport(t, cfg));
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
export function findTradesFor(target: RankedPlayer, mine: Valued[], partner: Partner, cfg: LeagueConfig, limit = 4, locked: Set<string> = new Set(), tuning?: TradeTuning): TradeEval[] {
  if (locked.has(target.id)) return [];
  const top = (r: Valued[], n: number) => [...r].filter((x) => !locked.has(x.p.id)).sort((a, b) => b.v - a.v).slice(0, n).map((x) => x.p);
  const myCands = top(mine, 10);
  const extras = top(partner.roster.filter((x) => x.p.id !== target.id), 6);
  const gets: RankedPlayer[][] = [[target], ...extras.map((p) => [target, p])];
  const gives = [...combos(myCands, 1), ...combos(myCands, 2), ...combos(myCands.slice(0, 8), 3)];
  const before = { mine: lineupValue(mine, cfg, tuning?.depthBoost ?? 1).total, theirs: lineupValue(partner.roster, cfg).total };
  const all: TradeEval[] = [];
  for (const get of gets) for (const give of gives) {
    // Don't ask for an extra player of theirs unless you're sending two back
    if (get.length > give.length) continue;
    all.push(evaluateTrade(mine, partner.roster, give, get, cfg, partner.id, partner.lean, before, false, tuning));
  }
  const score = (t: TradeEval) => t.accept + 6 * (t.myGain / Math.max(before.mine, 1));
  const realistic = all.filter((t) => t.accept >= 0.4).sort((a, b) => score(b) - score(a));
  if (realistic.length) return distinctBy(realistic, (t) => ids(t.give), limit).map((t) => withDepthReport(t, cfg));
  return distinctBy([...all].sort((a, b) => b.accept - a.accept), (t) => ids(t.give), Math.min(2, limit)).map((t) => withDepthReport(t, cfg));
}

/** "Shop my player": the best realistic return for `player` from every other team. */
export function shopPlayer(player: RankedPlayer, mine: Valued[], partners: Partner[], cfg: LeagueConfig, limit = 4, locked: Set<string> = new Set(), tuning?: TradeTuning): TradeEval[] {
  if (locked.has(player.id)) return [];
  const myBefore = lineupValue(mine, cfg, tuning?.depthBoost ?? 1).total;
  const out: TradeEval[] = [];
  for (const partner of partners) {
    const theirs = [...partner.roster].filter((x) => !locked.has(x.p.id)).sort((a, b) => b.v - a.v).slice(0, 8).map((x) => x.p);
    const before = { mine: myBefore, theirs: lineupValue(partner.roster, cfg).total };
    let best: TradeEval | null = null;
    for (const get of [...combos(theirs, 1), ...combos(theirs, 2)]) {
      const t = evaluateTrade(mine, partner.roster, [player], get, cfg, partner.id, partner.lean, before, false, tuning);
      if (t.myGain <= 0 || t.accept < 0.4) continue;
      if (!best || t.myGain * t.accept > best.myGain * best.accept) best = t;
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.myGain * b.accept - a.myGain * a.accept).slice(0, limit).map((t) => withDepthReport(t, cfg));
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
