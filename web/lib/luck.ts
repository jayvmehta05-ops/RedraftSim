/**
 * Luck meter: how much of each team's record is schedule luck.
 *
 *  - All-play: every week, play every other team. Beating 9 of 11 that week = 9-2.
 *  - Expected wins: the all-play win share each week, summed (e.g. 9/11 = 0.82 wins).
 *  - Luck: actual wins minus expected wins. +2 means about two wins more than the scores earned.
 *  - Schedule swap: your scores against each other team's schedule, giving the best and worst
 *    record your points could have produced.
 */
import type { ImportedLeague } from "./types";

export interface LuckRow {
  id: string;
  name: string;
  weeks: number;
  wins: number; losses: number; ties: number;
  allPlay: { wins: number; losses: number; ties: number };
  expectedWins: number;
  luck: number;
  pointsFor: number;
  pointsAgainst: number;
  /** rank of points against, 1 = faced the most points (toughest schedule) */
  paRank: number;
  pfRank: number;
  /** record with each other team's schedule: best and worst, and whose schedule */
  bestSwap: { wins: number; losses: number; with: string } | null;
  worstSwap: { wins: number; losses: number; with: string } | null;
}

type Team = { id: string; name: string; weekly: number[]; opponents: (string | null)[] };

/** Weeks every team has a score for (the luck meter only uses weeks the whole league played). */
function commonWeeks(teams: Team[]): number {
  return Math.min(...teams.map((t) => t.weekly.length));
}

function recordWith(me: Team, schedule: Team, byId: Map<string, Team>, weeks: number) {
  let wins = 0, losses = 0;
  for (let w = 0; w < weeks; w++) {
    let opp = schedule.opponents[w];
    if (opp === me.id) opp = schedule.id; // their opponent was you, so you'd face them instead
    if (!opp) continue;
    const theirs = byId.get(opp)?.weekly[w];
    if (theirs == null) continue;
    if (me.weekly[w] > theirs) wins++;
    else if (me.weekly[w] < theirs) losses++;
  }
  return { wins, losses };
}

export function luckTable(league: ImportedLeague): LuckRow[] {
  const names = new Map(league.managers.map((m) => [m.id, m.name]));
  const teams: Team[] = (league.rosters ?? [])
    .filter((r) => r.weekly && r.weekly.length)
    .map((r) => ({ id: r.managerId, name: names.get(r.managerId) ?? `Team ${r.managerId}`, weekly: r.weekly!, opponents: r.opponents ?? [] }));
  if (teams.length < 2) return [];
  const weeks = commonWeeks(teams);
  if (weeks < 1) return [];
  const byId = new Map(teams.map((t) => [t.id, t]));

  const rows: LuckRow[] = teams.map((t) => {
    let wins = 0, losses = 0, ties = 0, pa = 0, pf = 0, exp = 0;
    const ap = { wins: 0, losses: 0, ties: 0 };
    for (let w = 0; w < weeks; w++) {
      const mine = t.weekly[w];
      pf += mine;
      const others = teams.filter((o) => o.id !== t.id).map((o) => o.weekly[w]);
      const beat = others.filter((x) => mine > x).length;
      const tied = others.filter((x) => mine === x).length;
      ap.wins += beat; ap.ties += tied; ap.losses += others.length - beat - tied;
      exp += (beat + tied / 2) / others.length;
      const opp = t.opponents[w];
      const theirs = opp ? byId.get(opp)?.weekly[w] : undefined;
      if (theirs != null) {
        pa += theirs;
        if (mine > theirs) wins++;
        else if (mine < theirs) losses++;
        else ties++;
      }
    }
    // Schedule swap against every other team's schedule
    let best: LuckRow["bestSwap"] = null, worst: LuckRow["worstSwap"] = null;
    for (const s of teams) {
      if (s.id === t.id) continue;
      const r = recordWith(t, s, byId, weeks);
      if (!best || r.wins > best.wins) best = { ...r, with: s.name };
      if (!worst || r.wins < worst.wins) worst = { ...r, with: s.name };
    }
    return {
      id: t.id, name: t.name, weeks, wins, losses, ties, allPlay: ap, expectedWins: exp,
      luck: wins + ties / 2 - exp, pointsFor: pf, pointsAgainst: pa, paRank: 0, pfRank: 0, bestSwap: best, worstSwap: worst,
    };
  });
  [...rows].sort((a, b) => b.pointsAgainst - a.pointsAgainst).forEach((r, i) => (r.paRank = i + 1));
  [...rows].sort((a, b) => b.pointsFor - a.pointsFor).forEach((r, i) => (r.pfRank = i + 1));
  return rows.sort((a, b) => b.luck - a.luck);
}
