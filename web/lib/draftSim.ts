/**
 * Draft-room intelligence: Monte Carlo availability odds, pick reactions, tier countdown and the
 * post-draft replay. Everything reuses the same bot logic the mock draft runs (lib/draft.ts).
 */
import { BOT_PROFILES, type BotProfile, botPick, mulberry32, teamOnClock, teamPickIndices } from "./draft";
import type { LeagueConfig, Pos, RankedPlayer } from "./types";
import { POSITIONS } from "./types";

export interface SimState {
  byAdp: RankedPlayer[];       // whole board sorted by ADP
  picks: string[];             // player ids picked so far, in order
  byId: Map<string, RankedPlayer>;
  bots: (BotProfile | null)[];
  cfg: LeagueConfig;
  teams: number;
  rounds: number;
}

/**
 * Probability each player is still on the board at overall pick index `untilIdx`, simulating bot picks
 * from `fromIdx` (inclusive). Picks made by `skipTeam` in that window are skipped (that's you).
 */
export function simulateAvailability(s: SimState, fromIdx: number, untilIdx: number, skipTeam: number,
  watch: RankedPlayer[], sims = 150, seed = 7): Map<string, number> {
  const survived = new Map(watch.map((p) => [p.id, 0]));
  if (untilIdx <= fromIdx) {
    watch.forEach((p) => survived.set(p.id, 1));
    return survived;
  }
  const taken0 = new Set(s.picks);
  const avail0 = s.byAdp.filter((p) => !taken0.has(p.id));
  const rosters0: RankedPlayer[][] = Array.from({ length: s.teams }, () => []);
  s.picks.forEach((id, i) => rosters0[teamOnClock(i, s.teams)].push(s.byId.get(id)!));
  const pickIdxs = Array.from({ length: s.teams }, (_, t) => teamPickIndices(t, s.teams, s.rounds));
  const rng = mulberry32(seed);

  for (let n = 0; n < sims; n++) {
    let avail = avail0;
    const rosters = rosters0.map((r) => r.slice());
    const recent = s.picks.slice(-6).map((id) => s.byId.get(id)!);
    for (let idx = fromIdx; idx < untilIdx; idx++) {
      const team = teamOnClock(idx, s.teams);
      if (team === skipTeam) continue;
      const choice = botPick({
        available: avail, roster: rosters[team], recent: recent.slice(-6), pickIdx: idx,
        picksLeft: pickIdxs[team].filter((i) => i >= idx).length, cfg: s.cfg,
      }, s.bots[team] ?? BOT_PROFILES[0], rng);
      avail = avail.filter((p) => p.id !== choice.id);
      rosters[team].push(choice);
      recent.push(choice);
    }
    const left = new Set(avail.map((p) => p.id));
    for (const p of watch) if (left.has(p.id)) survived.set(p.id, (survived.get(p.id) ?? 0) + 1);
  }
  for (const [id, c] of survived) survived.set(id, c / sims);
  return survived;
}

export type Reaction = { kind: "steal" | "value" | "reach" | "fair"; delta: number };

/** How a pick compares with the player's ADP (positive delta = he fell past his ADP). */
export function pickReaction(pickNo: number, p: RankedPlayer): Reaction {
  const delta = Math.round(pickNo - p.cur.adp);
  const scale = Math.max(6, pickNo * 0.12); // later in drafts ADP is noisier
  if (delta >= scale * 1.6) return { kind: "steal", delta };
  if (delta >= scale * 0.8) return { kind: "value", delta };
  if (delta <= -scale * 1.4) return { kind: "reach", delta };
  return { kind: "fair", delta };
}

/** For each position: the best tier still on the board and how many players are left in it. */
export function tierCountdown(available: RankedPlayer[]): Record<Pos, { tier: number; left: number; names: string[] } | null> {
  const out = {} as Record<Pos, { tier: number; left: number; names: string[] } | null>;
  for (const pos of POSITIONS) {
    const ps = available.filter((p) => p.pos === pos);
    if (!ps.length) { out[pos] = null; continue; }
    const tier = Math.min(...ps.map((p) => p.cur.tier));
    const inTier = ps.filter((p) => p.cur.tier === tier).sort((a, b) => a.cur.adp - b.cur.adp);
    out[pos] = { tier, left: inTier.length, names: inTier.slice(0, 3).map((p) => p.name) };
  }
  return out;
}

export interface ReplayItem {
  pickNo: number;
  took: RankedPlayer;
  alt: RankedPlayer | null;   // best player still available at that pick (by projected value)
  gap: number;                // projected season points left on the table (alt - took)
}

/** Your picks vs. the best player still on the board at each one, plus your best-value pick. */
export function draftReplay(picks: string[], byId: Map<string, RankedPlayer>, byAdp: RankedPlayer[], myPickIdxs: number[]) {
  const items: ReplayItem[] = [];
  for (const i of myPickIdxs) {
    if (i >= picks.length) break;
    const took = byId.get(picks[i])!;
    const gone = new Set(picks.slice(0, i));
    const pool = byAdp.filter((p) => !gone.has(p.id) && p.id !== took.id && p.pos === took.pos);
    const alt = pool.sort((a, b) => b.cur.points - a.cur.points)[0] ?? null;
    items.push({ pickNo: i + 1, took, alt, gap: alt ? alt.cur.points - took.cur.points : 0 });
  }
  const misses = items.filter((x) => x.gap > 8).sort((a, b) => b.gap - a.gap).slice(0, 3);
  const steals = items.map((x) => ({ ...x, r: pickReaction(x.pickNo, x.took) })).sort((a, b) => b.r.delta - a.r.delta);
  return { items, misses, bestValue: steals[0] ?? null };
}
