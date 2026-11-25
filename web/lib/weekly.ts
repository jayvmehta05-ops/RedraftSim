/**
 * Weekly start/sit: ESPN's projection for this week (scored with the league's own rules), this week's
 * matchup, bye and injury status, then the best legal lineup compared with the one the manager has set.
 */
import { pointsPerGame } from "./engine";
import { type Valued, lineupSlots } from "./trade";
import type { LeagueConfig, RankedPlayer, StatLine } from "./types";
import { STAT_KEYS } from "./types";

/** Response of GET /api/week */
export interface WeekData {
  season: number;
  week: number;
  offseason: boolean;
  generatedAt?: string;
  /** keyed by team abbreviation (board style, e.g. "WAS") */
  teams: Record<string, { opp: string | null; home: boolean; kickoff: number | null; bye: boolean }>;
  /** keyed by ESPN player id; proj is a stat line in STAT_KEYS order */
  players: Record<string, { team: string; inj: string | null; proj: number[] | null }>;
}

export interface WeeklyPlayer {
  p: RankedPlayer;
  pts: number;
  /** espn = ESPN weekly projection; estimate = rest-of-season average (no weekly projection); out = bye / ruled out */
  source: "espn" | "estimate" | "out";
  opp: string | null;
  home: boolean;
  kickoff: number | null;
  bye: boolean;
  status: string | null;
}

const OUT = new Set(["OUT", "INJURY_RESERVE", "IR", "SUSPENSION", "PUP", "Out", "Suspended"]);

/** Human label for an injury status from ESPN or Sleeper. */
export function statusLabel(s: string | null): string | null {
  if (!s) return null;
  const map: Record<string, string> = { QUESTIONABLE: "Q", DOUBTFUL: "D", OUT: "OUT", INJURY_RESERVE: "IR", SUSPENSION: "SUSP", Questionable: "Q", Doubtful: "D", Out: "OUT" };
  return map[s] ?? s;
}

export function weeklyValue(p: RankedPlayer, week: WeekData, cfg: LeagueConfig): WeeklyPlayer {
  const e = p.espnId ? week.players[String(p.espnId)] : undefined;
  const team = e?.team || p.team;
  const m = week.teams[team];
  const status = e ? e.inj : p.injury && p.injury !== "Active" ? p.injury : null;
  const base = { p, opp: m?.opp ?? null, home: !!m?.home, kickoff: m?.kickoff ?? null, bye: !!m?.bye, status };
  if (!m || m.bye || !m.opp) return { ...base, pts: 0, source: "out" };
  if (status && OUT.has(status)) return { ...base, pts: 0, source: "out" };
  if (e?.proj) {
    const line = Object.fromEntries(STAT_KEYS.map((k, i) => [k, e.proj![i] ?? 0])) as StatLine;
    return { ...base, pts: Math.max(0, pointsPerGame(line, p.pos, cfg.scoring)), source: "espn" };
  }
  const ros = p.cur.espnRosPpg ?? (p.g26 > 0 ? p.cur.ppg26 : 0);
  return { ...base, pts: Math.max(0, ros) * (status === "DOUBTFUL" || status === "Doubtful" ? 0.3 : 1), source: "estimate" };
}

export interface StartSitPlan {
  slots: { slot: string; x: WeeklyPlayer | null; started: boolean; locked: boolean; tossUp: WeeklyPlayer | null }[];
  bench: WeeklyPlayer[];
  bestTotal: number;
  /** total of the QB/RB/WR/TE starters currently set on the platform (null if unknown) */
  currentTotal: number | null;
  start: WeeklyPlayer[];
  sit: WeeklyPlayer[];
}

/**
 * Best lineup for the week. Players whose game has kicked off can't move: if they're starting they stay in,
 * if they're on the bench they stay out.
 */
export function planWeek(roster: WeeklyPlayer[], currentStarters: Set<string> | null, cfg: LeagueConfig, now: number): StartSitPlan {
  const kicked = (w: WeeklyPlayer) => w.kickoff != null && w.kickoff <= now;
  const LOCK_BONUS = 10_000;
  const candidates: Valued[] = roster
    .filter((w) => !(kicked(w) && currentStarters && !currentStarters.has(w.p.id)))
    .map((w) => ({ p: w.p, v: w.pts + (kicked(w) && currentStarters?.has(w.p.id) ? LOCK_BONUS : 0) }));
  const byId = new Map(roster.map((w) => [w.p.id, w]));
  const slots = lineupSlots(candidates, cfg).map(({ slot, x }) => {
    const w = x ? byId.get(x.p.id)! : null;
    return { slot, x: w, started: !!w && !!currentStarters?.has(w.p.id), locked: !!w && kicked(w), tossUp: null as WeeklyPlayer | null };
  });
  const inLineup = new Set(slots.flatMap((s) => (s.x ? [s.x.p.id] : [])));
  const bench = roster.filter((w) => !inLineup.has(w.p.id)).sort((a, b) => b.pts - a.pts);

  // Close calls: the best eligible bench player within 1.5 points of a starter
  const eligible = (slot: string, w: WeeklyPlayer) =>
    slot === "SFLEX" || (slot === "FLEX" ? cfg.flex_eligible.includes(w.p.pos) : w.p.pos === slot);
  for (const s of slots) {
    if (!s.x || s.locked) continue;
    const alt = bench.find((b) => !kicked(b) && b.source !== "out" && eligible(s.slot, b));
    if (alt && s.x.pts - alt.pts < 1.5) s.tossUp = alt;
  }

  const bestTotal = slots.reduce((t, s) => t + (s.x?.pts ?? 0), 0);
  let currentTotal: number | null = null;
  let start: WeeklyPlayer[] = [];
  let sit: WeeklyPlayer[] = [];
  if (currentStarters && currentStarters.size) {
    const current = roster.filter((w) => currentStarters.has(w.p.id));
    currentTotal = current.reduce((t, w) => t + w.pts, 0);
    start = slots.flatMap((s) => (s.x && !s.started ? [s.x] : [])).sort((a, b) => b.pts - a.pts);
    sit = current.filter((w) => !inLineup.has(w.p.id)).sort((a, b) => a.pts - b.pts);
  }
  return { slots, bench, bestTotal, currentTotal, start, sit };
}
