/**
 * Draft strategy lab: simulate full drafts from your slot with your team following a strategy, against the
 * same bots the mock draft uses, and compare the projected starting lineups each strategy produces.
 *
 * Fairness: simulation i uses the same seed (same bot lineup, same random draws) for every strategy, so
 * differences come from the strategy rather than luck ("common random numbers").
 */
import { type BotTuning, tuneBot } from "./botTuning";
import {
  BOT_PROFILES, type BotProfile, botPick, countPositions, mulberry32, optimalLineup, scoreCandidates, teamOnClock,
  teamPickIndices, type Counts,
} from "./draft";
import type { LeagueConfig, Pos, RankedPlayer } from "./types";

export interface Strategy {
  id: string;
  label: string;
  desc: string;
  /** adjustment (in "picks") added to the normal pick score for a player at `pos` */
  adjust: (pos: Pos, round: number, c: Counts) => number;
}

export const STRATEGIES: Strategy[] = [
  { id: "bpa", label: "Best available", desc: "Take the site's top suggestion every pick", adjust: () => 0 },
  { id: "zero_rb", label: "Zero RB", desc: "No RBs in rounds 1–5; load up on WR/TE", adjust: (p, r) => (p === "RB" && r <= 5 ? -30 : (p === "WR" || p === "TE") && r <= 5 ? 2 : 0) },
  { id: "hero_rb", label: "Hero RB", desc: "One RB early, then no RB until round 6", adjust: (p, r, c) => (p === "RB" ? (c.RB === 0 && r <= 2 ? 6 : c.RB >= 1 && r <= 6 ? -25 : 0) : 0) },
  { id: "robust_rb", label: "Robust RB", desc: "RB-RB start, RBs favored through round 4", adjust: (p, r) => (p === "RB" ? (r <= 2 ? 12 : r <= 4 ? 3 : 0) : 0) },
  { id: "wr_heavy", label: "WR-heavy", desc: "Favor WRs through round 4", adjust: (p, r) => (p === "WR" && r <= 4 ? 7 : 0) },
  { id: "early_qb", label: "Early elite QB", desc: "Take a QB by round 3", adjust: (p, r, c) => (p === "QB" && c.QB === 0 && r <= 3 ? 16 : 0) },
  { id: "late_qb", label: "Late QB", desc: "No QB before round 9", adjust: (p, r) => (p === "QB" && r <= 8 ? -60 : 0) },
  { id: "early_te", label: "Early elite TE", desc: "Take a TE by round 3", adjust: (p, r, c) => (p === "TE" && c.TE === 0 && r <= 3 ? 14 : 0) },
];

export interface LabSetup {
  byAdp: RankedPlayer[];
  cfg: LeagueConfig;
  teams: number;
  rounds: number;
  userTeam: number;
  /** your real leaguemates (seated first); stock personalities fill any empty seats, like the mock draft */
  opponents: BotProfile[];
  /** your end-of-mock feedback tuning, applied to every bot like in the mock draft */
  tuning?: BotTuning | null;
}

export interface DraftOutcome {
  points: number;
  rank: number;
  opening: Pos[];          // your first four picks' positions
  firstPick: string;       // your first-round player
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One full simulated draft with your team following `strategy`. */
export function simulateDraft(setup: LabSetup, strategy: Strategy, seed: number): DraftOutcome {
  const { byAdp, cfg, teams, rounds, userTeam } = setup;
  const rng = mulberry32(seed);
  const seatOrder = [...shuffle(setup.opponents, rng), ...shuffle(BOT_PROFILES, rng)].map((b) => tuneBot(b, setup.tuning ?? null));
  const seats = shuffle(Array.from({ length: teams }, (_, t) => t).filter((t) => t !== userTeam), rng);
  const bots: (BotProfile | null)[] = Array.from({ length: teams }, () => null);
  seats.forEach((t, i) => (bots[t] = seatOrder[i % seatOrder.length]));
  const pickIdxs = Array.from({ length: teams }, (_, t) => teamPickIndices(t, teams, rounds));
  let avail = byAdp;
  const rosters: RankedPlayer[][] = Array.from({ length: teams }, () => []);
  const recent: RankedPlayer[] = [];
  const total = teams * rounds;
  for (let idx = 0; idx < total; idx++) {
    const team = teamOnClock(idx, teams);
    const ctx = {
      available: avail, roster: rosters[team], recent: recent.slice(-6), pickIdx: idx,
      picksLeft: pickIdxs[team].filter((i) => i >= idx).length, cfg,
    };
    let choice: RankedPlayer;
    if (team === userTeam) {
      const round = Math.floor(idx / teams) + 1;
      const c = countPositions(rosters[team]);
      const scored = scoreCandidates(ctx, 30).map((s) => ({ p: s.player, score: s.score + strategy.adjust(s.player.pos, round, c) }));
      scored.sort((a, b) => b.score - a.score);
      choice = scored[0]?.p ?? avail[0];
    } else {
      choice = botPick(ctx, bots[team] ?? BOT_PROFILES[0], rng);
    }
    avail = avail.filter((p) => p.id !== choice.id);
    rosters[team].push(choice);
    recent.push(choice);
  }
  const pts = rosters.map((r) => optimalLineup(r, cfg).starterPoints);
  const mine = pts[userTeam];
  return {
    points: mine,
    rank: 1 + pts.filter((x) => x > mine).length,
    opening: rosters[userTeam].slice(0, 4).map((p) => p.pos),
    firstPick: rosters[userTeam][0]?.name ?? "",
  };
}

export interface StrategyResult {
  strategy: Strategy;
  sims: number;
  avgPoints: number;
  avgRank: number;
  top3: number;
  commonOpening: string;
  commonFirst: string;
}

export function summarize(strategy: Strategy, outcomes: DraftOutcome[]): StrategyResult {
  const n = Math.max(outcomes.length, 1);
  const mode = (xs: string[]) => {
    const m = new Map<string, number>();
    xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  };
  return {
    strategy, sims: outcomes.length,
    avgPoints: outcomes.reduce((s, o) => s + o.points, 0) / n,
    avgRank: outcomes.reduce((s, o) => s + o.rank, 0) / n,
    top3: outcomes.filter((o) => o.rank <= 3).length / n,
    commonOpening: mode(outcomes.map((o) => o.opening.join("-"))),
    commonFirst: mode(outcomes.map((o) => o.firstPick)),
  };
}
