/**
 * Where we are in the fantasy season, for the active league. The app changes its emphasis with it:
 * draft prep before Week 1, caution in the first weeks, trades until the deadline, then lineups and
 * waivers, then only the playoff weeks that are left, then next season.
 */
import type { ImportedLeague } from "./types";

export type Phase = "preseason" | "early" | "midseason" | "stretch" | "playoffs" | "offseason";

export interface SeasonPhase {
  phase: Phase;
  /** the NFL week being played now (1-18), or 0 before the season */
  week: number;
  playoffStart: number;
  lastWeek: number;
  /** fantasy weeks still to play, including this one */
  weeksLeft: number;
  tradesOpen: boolean;
  /** weeks until the trade deadline (0 = this is the last week), null if none or passed */
  deadlineIn: number | null;
  /** short status line, e.g. "Week 12 · 2 weeks to the trade deadline" */
  headline: string;
  /** what to focus on right now */
  tip: string;
}

const DEFAULT = { playoffStart: 15, lastWeek: 17 };

/**
 * @param throughWeek last NFL week with complete stats in the data (0 before the season)
 * @param now ms timestamp (for ESPN's date-based trade deadline); pass 0 when unknown
 */
export function seasonPhase(throughWeek: number, league: ImportedLeague | null, now: number): SeasonPhase {
  const sched = league?.schedule;
  const playoffStart = sched?.playoffStart ?? DEFAULT.playoffStart;
  const lastWeek = sched?.lastWeek ?? DEFAULT.lastWeek;
  const week = throughWeek <= 0 ? 0 : Math.min(19, throughWeek + 1);
  const weeksLeft = week === 0 ? lastWeek : Math.max(0, lastWeek - week + 1);

  // Trade deadline: a week number (Sleeper) or a date (ESPN). Trades always close at the playoffs here.
  let deadlineWeek: number | null = sched?.tradeDeadlineWeek ?? null;
  let tradesOpen = week < playoffStart;
  if (deadlineWeek != null) tradesOpen = tradesOpen && week <= deadlineWeek;
  if (sched?.tradeDeadlineAt && now) {
    tradesOpen = tradesOpen && now < sched.tradeDeadlineAt;
    // rough week count to the date, for the countdown
    deadlineWeek = week + Math.max(0, Math.floor((sched.tradeDeadlineAt - now) / (7 * 864e5)));
  }
  const deadlineIn = tradesOpen && deadlineWeek != null ? Math.max(0, deadlineWeek - week) : null;

  let phase: Phase;
  if (week === 0) phase = "preseason";
  else if (week > lastWeek) phase = "offseason";
  else if (week >= playoffStart) phase = "playoffs";
  else if (!tradesOpen || week >= playoffStart - 2) phase = "stretch";
  else if (week <= 4) phase = "early";
  else phase = "midseason";

  const deadlineText = deadlineIn == null ? "" : deadlineIn === 0 ? " · trade deadline is this week" : ` · ${deadlineIn} week${deadlineIn === 1 ? "" : "s"} to the trade deadline`;
  const toPlayoffs = playoffStart - week;
  const headlines: Record<Phase, string> = {
    preseason: "Draft season",
    early: `Week ${week}${deadlineText}`,
    midseason: `Week ${week}${deadlineText}`,
    stretch: `Week ${week} · ${toPlayoffs > 0 ? `playoffs in ${toPlayoffs} week${toPlayoffs === 1 ? "" : "s"}` : "final stretch"}${tradesOpen ? deadlineText : " · trades are closed"}`,
    playoffs: `Week ${week} · fantasy playoffs${week === lastWeek ? " · championship week" : ""}`,
    offseason: "Season over",
  };
  const tips: Record<Phase, string> = {
    preseason: "Mock your draft against your leaguemates and keep the Live Draft assistant open on draft day.",
    early: "It's early: a big game or two can mislead, so values lean on projections more than this season's small sample. Grab breakouts on waivers before they're obvious.",
    midseason: "Prime trading time. Find deals on Rosters and Trades, and check Start/Sit before kickoff each week.",
    stretch: tradesOpen
      ? "Last chance to trade for a playoff push. Look at what each move does for the weeks you have left."
      : "Trades are closed, so it's all lineups and waivers now. Check Start/Sit every week and stash players with good playoff matchups.",
    playoffs: `Only the next ${weeksLeft} week${weeksLeft === 1 ? "" : "s"} matter${weeksLeft === 1 ? "s" : ""}, so values count just those weeks. Set the best lineup in Start/Sit and grab hot free agents for this week.`,
    offseason: "Rosters reset in redraft. The next season's board and mock drafts are ready.",
  };
  return { phase, week, playoffStart, lastWeek, weeksLeft: phase === "offseason" ? 0 : weeksLeft, tradesOpen, deadlineIn, headline: headlines[phase], tip: tips[phase] };
}
