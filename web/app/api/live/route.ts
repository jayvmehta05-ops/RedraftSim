/**
 * GET /api/live: this NFL week's actual box-score stats so far for every fantasy-relevant QB/RB/WR/TE, plus
 * each game's status (not started / live with the clock / final). The browser scores the stats with each
 * league's own rules, so the points match what your platform shows. Public data only, no user input.
 *
 * Cached at the CDN for 45 seconds while games are on (an hour when nothing is happening), so ESPN sees about
 * one request a minute during games no matter how many people are watching.
 */
import { connection } from "next/server";
import { STAT_KEYS, type StatKey } from "@/lib/types";
import type { LiveData } from "@/lib/live";

const ESPN = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";
const UA = { "User-Agent": "future-fantasy/1.0 (live scores)" };
// ESPN stat id -> our stat key (same mapping as /api/week and scripts/update_data.py)
const STAT_IDS: Record<string, StatKey> = {
  "0": "pass_att", "1": "pass_cmp", "3": "pass_yds", "4": "pass_td", "20": "pass_int", "19": "pass_2pt",
  "23": "rush_att", "24": "rush_yds", "25": "rush_td", "26": "rush_2pt",
  "58": "targets", "53": "rec", "42": "rec_yds", "43": "rec_td", "44": "rec_2pt", "72": "fum_lost",
};
const ABBR: Record<string, string> = { WSH: "WAS" }; // ESPN -> board abbreviations

async function json<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(url, { headers: { ...UA, ...headers }, cache: "no-store" });
  if (!r.ok) throw new Error(`${url.split("?")[0]} returned ${r.status}`);
  return r.json() as Promise<T>;
}

interface Scoreboard {
  events?: {
    date: string;
    competitions: { status: { type: { state: "pre" | "in" | "post"; shortDetail: string } }; competitors: { team: { abbreviation: string } }[] }[];
  }[];
}
interface Pool {
  players?: { player: { id: number; stats?: { scoringPeriodId: number; statSourceId: number; statSplitTypeId: number; stats?: Record<string, number> }[] } }[];
}

export async function GET() {
  await connection(); // run per request (never at build time); the CDN header below does the caching
  try {
    const state = await json<{ week: number; season: string; season_type: string }>("https://api.sleeper.app/v1/state/nfl");
    const season = Number(state.season);
    const week = Number(state.week);
    if ((state.season_type !== "regular" && state.season_type !== "post") || !week) {
      return Response.json({ season, week, games: {}, players: {} } satisfies LiveData, { headers: cache(3600) });
    }

    const [board, pool] = await Promise.all([
      json<Scoreboard>("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"),
      json<Pool>(`${ESPN}/${season}/segments/0/leaguedefaults/3?view=kona_player_info`, {
        "X-Fantasy-Filter": JSON.stringify({
          players: {
            limit: 600, filterSlotIds: { value: [0, 2, 4, 6] }, sortPercOwned: { sortPriority: 1, sortAsc: false },
            // actual stats (source 0) for this single week (split 1): "0" + "1" + season + week
            filterStatsForTopScoringPeriodIds: { value: 1, additionalValue: [`01${season}${week}`] },
          },
        }),
      }),
    ]);

    const games: LiveData["games"] = {};
    for (const e of board.events ?? []) {
      const c = e.competitions[0];
      if (!c) continue;
      const g = { state: c.status.type.state, detail: c.status.type.shortDetail, kickoff: Date.parse(e.date) };
      for (const t of c.competitors) games[ABBR[t.team.abbreviation] ?? t.team.abbreviation] = g;
    }

    const players: LiveData["players"] = {};
    for (const { player: p } of pool.players ?? []) {
      const s = p.stats?.find((x) => x.statSourceId === 0 && x.statSplitTypeId === 1 && x.scoringPeriodId === week);
      if (!s?.stats) continue;
      const line = STAT_KEYS.map(() => 0);
      for (const [id, key] of Object.entries(STAT_IDS)) line[STAT_KEYS.indexOf(key)] = s.stats[id] ?? 0;
      players[String(p.id)] = line;
    }

    const live = Object.values(games).some((g) => g.state === "in");
    const soon = Object.values(games).some((g) => g.state === "pre" && g.kickoff - Date.now() < 30 * 60_000);
    const body: LiveData = { season, week, generatedAt: new Date().toISOString(), games, players };
    return Response.json(body, { headers: cache(live ? 45 : soon ? 120 : 1800) });
  } catch (e) {
    console.warn("[live]", e instanceof Error ? e.message : e);
    return Response.json({ error: "Live scores are unavailable right now." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

function cache(seconds: number) {
  return { "Cache-Control": `public, max-age=${Math.min(seconds, 30)}, s-maxage=${seconds}, stale-while-revalidate=${seconds}` };
}
