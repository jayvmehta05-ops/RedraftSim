/**
 * GET /api/week: this NFL week's matchups, byes, kickoff times, injury status and ESPN's weekly
 * projection for every fantasy-relevant QB/RB/WR/TE. Public data only, no user input.
 *
 * Cached at the CDN for 30 minutes (projections and injury tags change through the week), so ESPN
 * sees at most a couple of requests an hour no matter how many people use Start/Sit.
 */
import { connection } from "next/server";
import { STAT_KEYS, type StatKey } from "@/lib/types";
import type { WeekData } from "@/lib/weekly";

const ESPN = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";
const UA = { "User-Agent": "future-fantasy/1.0 (weekly projections)" };
// ESPN stat id -> our stat key (same mapping as scripts/update_data.py)
const STAT_IDS: Record<string, StatKey> = {
  "0": "pass_att", "1": "pass_cmp", "3": "pass_yds", "4": "pass_td", "20": "pass_int", "19": "pass_2pt",
  "23": "rush_att", "24": "rush_yds", "25": "rush_td", "26": "rush_2pt",
  "58": "targets", "53": "rec", "42": "rec_yds", "43": "rec_td", "44": "rec_2pt", "72": "fum_lost",
};
// ESPN abbreviations that differ from the ones used on the board (Sleeper / nflverse)
const ABBR: Record<string, string> = { WSH: "WAS" };

async function json<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(url, { headers: { ...UA, ...headers }, cache: "no-store" });
  if (!r.ok) throw new Error(`${url.split("?")[0]} returned ${r.status}`);
  return r.json() as Promise<T>;
}

interface Game { homeProTeamId: number; awayProTeamId: number; date: number }
interface ProTeam { id: number; abbrev: string; byeWeek: number; proGamesByScoringPeriod?: Record<string, Game[]> }

export async function GET() {
  await connection(); // always run on request (never at build time); the CDN header below does the caching
  try {
    const state = await json<{ week: number; season: string; season_type: string }>("https://api.sleeper.app/v1/state/nfl");
    const season = Number(state.season);
    const week = Number(state.week);
    if (state.season_type !== "regular" || !week) {
      return Response.json({ season, week, offseason: true } satisfies Partial<WeekData>, { headers: cache(3600) });
    }

    const sched = await json<{ settings: { proTeams: ProTeam[] } }>(`${ESPN}/${season}?view=proTeamSchedules_wl`);
    const byId = new Map(sched.settings.proTeams.map((t) => [t.id, t]));
    const abbr = (id: number) => { const a = (byId.get(id)?.abbrev ?? "").toUpperCase(); return ABBR[a] ?? a; };
    const teams: WeekData["teams"] = {};
    for (const t of sched.settings.proTeams) {
      if (!t.id) continue; // id 0 = free agents
      const game = t.proGamesByScoringPeriod?.[String(week)]?.[0];
      const home = game ? game.homeProTeamId === t.id : false;
      teams[abbr(t.id)] = game
        ? { opp: abbr(home ? game.awayProTeamId : game.homeProTeamId), home, kickoff: game.date, bye: false }
        : { opp: null, home: false, kickoff: null, bye: t.byeWeek === week };
    }

    const filter = {
      players: {
        limit: 450, filterSlotIds: { value: [0, 2, 4, 6] }, sortPercOwned: { sortPriority: 1, sortAsc: false },
        // projections (source 1) for this single week (split 1): "1" + "1" + season + week
        filterStatsForTopScoringPeriodIds: { value: 1, additionalValue: [`11${season}${week}`] },
      },
    };
    const pool = await json<{ players: { player: { id: number; proTeamId: number; injuryStatus?: string; stats?: { scoringPeriodId: number; statSourceId: number; statSplitTypeId: number; stats?: Record<string, number> }[] } }[] }>(
      `${ESPN}/${season}/segments/0/leaguedefaults/3?view=kona_player_info`, { "X-Fantasy-Filter": JSON.stringify(filter) });

    const players: WeekData["players"] = {};
    for (const { player: p } of pool.players ?? []) {
      const proj = p.stats?.find((s) => s.statSourceId === 1 && s.statSplitTypeId === 1 && s.scoringPeriodId === week);
      const line = STAT_KEYS.map(() => 0);
      if (proj?.stats) for (const [id, key] of Object.entries(STAT_IDS)) line[STAT_KEYS.indexOf(key)] = Math.round((proj.stats[id] ?? 0) * 100) / 100;
      players[String(p.id)] = { team: abbr(p.proTeamId), inj: p.injuryStatus && p.injuryStatus !== "ACTIVE" ? p.injuryStatus : null, proj: proj ? line : null };
    }
    const body: WeekData = { season, week, offseason: false, generatedAt: new Date().toISOString(), teams, players };
    return Response.json(body, { headers: cache(1800) });
  } catch (e) {
    console.warn("[week]", e instanceof Error ? e.message : e);
    return Response.json({ error: "Weekly projections are unavailable right now. Try again in a few minutes." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

function cache(seconds: number) {
  return { "Cache-Control": `public, max-age=300, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}` };
}
