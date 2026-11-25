/**
 * Server-side league import (used by app/api/league/route.ts).
 *
 * Reads a league's roster slots, scoring and draft history from Sleeper (any league, by id) or ESPN
 * (public leagues only; private ESPN leagues need the owner's login cookies, which we never ask for)
 * and normalizes it to this app's LeagueConfig shape.
 */
import type { ImportedLeague, LeagueDraft, Scoring } from "./types";

/** ESPN login cookies for private leagues. Passed straight through to ESPN; never stored or logged here. */
export interface EspnAuth {
  espnS2: string;
  swid: string;
}

function cookieHeader(auth?: EspnAuth): Record<string, string> {
  if (!auth?.espnS2 || !auth?.swid) return {};
  const clean = (v: string) => v.trim().replace(/^"|"$/g, "");
  const s2 = clean(auth.espnS2);
  let swid = clean(auth.swid);
  if (!swid.startsWith("{")) swid = `{${swid}}`;
  // Reject anything that could inject extra headers or cookies
  if (!/^[A-Za-z0-9%+/=_.-]{20,2000}$/.test(s2) || !/^\{[0-9A-Fa-f-]{36}\}$/.test(swid)) {
    throw new ImportError("Those ESPN cookie values don't look right. Copy espn_s2 and SWID exactly as shown.");
  }
  return { Cookie: `espn_s2=${s2}; SWID=${swid}` };
}

const UA = { "User-Agent": "redraft-sim/1.0 (+https://redraftsim.vercel.app)" };
const BASE_SCORING: Scoring = {
  pass_yd: 0.04, pass_td: 4, pass_int: -2, pass_2pt: 2, rush_yd: 0.1, rush_td: 6, rush_2pt: 2,
  rec: 1, rec_yd: 0.1, rec_td: 6, rec_2pt: 2, fum_lost: -2, te_premium: 0,
};

export class ImportError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, cache: "no-store" });
  if (r.status === 401 || r.status === 403) throw new ImportError("PRIVATE", r.status);
  if (r.status === 404) throw new ImportError("League not found. Check the league ID.", 404);
  if (!r.ok) throw new ImportError(`Upstream error ${r.status}`, 502);
  return (await r.json()) as T;
}

const emptyRoster = () => ({ QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPERFLEX: 0, K: 0, DST: 0, BENCH: 0 });

// ------------------------------------------------------------------ Sleeper
interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: Record<string, number>;
  previous_league_id: string | null;
}
interface SleeperDraft { draft_id: string; season: string; type: string; status: string }
interface SleeperPick {
  round: number; pick_no: number; picked_by: string; player_id: string;
  metadata: { position?: string; first_name?: string; last_name?: string };
}

const SLEEPER_SCORING: Record<string, keyof Scoring> = {
  pass_yd: "pass_yd", pass_td: "pass_td", pass_int: "pass_int", pass_2pt: "pass_2pt",
  rush_yd: "rush_yd", rush_td: "rush_td", rush_2pt: "rush_2pt", rec: "rec", rec_yd: "rec_yd",
  rec_td: "rec_td", rec_2pt: "rec_2pt", fum_lost: "fum_lost", bonus_rec_te: "te_premium",
};
// Offensive rules we know about but don't model (only reported when non-zero).
const SLEEPER_UNMODELED: Record<string, string> = {
  pass_fd: "passing first downs", rush_fd: "rushing first downs", rec_fd: "receiving first downs",
  pass_cmp: "completions", pass_inc: "incompletions", pass_att: "pass attempts", rush_att: "rush attempts",
  fum: "fumbles (not lost)", bonus_rec_rb: "RB reception bonus", bonus_rec_wr: "WR reception bonus",
  bonus_pass_yd_300: "300+ passing yard bonus", bonus_pass_yd_400: "400+ passing yard bonus",
  bonus_rush_yd_100: "100+ rushing yard bonus", bonus_rush_yd_200: "200+ rushing yard bonus",
  bonus_rec_yd_100: "100+ receiving yard bonus", bonus_rec_yd_200: "200+ receiving yard bonus",
  pass_td_40p: "40+ yd passing TD bonus", rush_td_40p: "40+ yd rushing TD bonus", rec_td_40p: "40+ yd receiving TD bonus",
};

async function importSleeper(id: string): Promise<ImportedLeague> {
  const lg = await getJson<SleeperLeague>(`https://api.sleeper.app/v1/league/${encodeURIComponent(id)}`);
  if (!lg || !lg.league_id) throw new ImportError("League not found. Check the league ID.", 404);
  const notes: string[] = [];
  const roster = emptyRoster();
  for (const slot of lg.roster_positions ?? []) {
    switch (slot) {
      case "QB": case "RB": case "WR": case "TE": case "K": roster[slot] += 1; break;
      case "DEF": roster.DST += 1; break;
      case "FLEX": roster.FLEX += 1; break;
      case "SUPER_FLEX": roster.SUPERFLEX += 1; break;
      case "WRRB_FLEX": case "REC_FLEX": case "WRRB_WRT":
        roster.FLEX += 1; notes.push(`${slot} slot treated as a regular RB/WR/TE FLEX`); break;
      case "BN": roster.BENCH += 1; break;
      case "IR": case "TAXI": break;
      default: notes.push(`${slot} slots (IDP or other) aren't supported and were skipped`);
    }
  }
  const scoring: Scoring = { ...BASE_SCORING, te_premium: 0 };
  const ss = lg.scoring_settings ?? {};
  for (const [k, field] of Object.entries(SLEEPER_SCORING)) if (k in ss) scoring[field] = Number(ss[k]) || 0;
  for (const [k, label] of Object.entries(SLEEPER_UNMODELED)) if (ss[k]) notes.push(`Not modeled: ${label} (${ss[k]} pts)`);

  // Managers (current season) + drafts for this season and up to two previous seasons
  const users = await getJson<{ user_id: string; display_name: string }[]>(
    `https://api.sleeper.app/v1/league/${lg.league_id}/users`).catch(() => []);
  const managers = users.map((u) => ({ id: u.user_id, name: u.display_name }));
  const drafts: LeagueDraft[] = [];
  let leagueId: string | null = lg.league_id;
  for (let hop = 0; hop < 3 && leagueId; hop++) {
    const cur: SleeperLeague | null = hop === 0 ? lg :
      await getJson<SleeperLeague>(`https://api.sleeper.app/v1/league/${leagueId}`).catch(() => null);
    if (!cur) break;
    const ds = await getJson<SleeperDraft[]>(`https://api.sleeper.app/v1/league/${cur.league_id}/drafts`).catch(() => []);
    for (const d of ds) {
      if (d.status !== "complete" || d.type === "auction") continue;
      const picks = await getJson<SleeperPick[]>(`https://api.sleeper.app/v1/draft/${d.draft_id}/picks`).catch(() => []);
      drafts.push({
        season: d.season, type: d.type,
        picks: picks.filter((p) => p.picked_by).map((p) => ({
          round: p.round, pick: p.pick_no, managerId: p.picked_by, pos: p.metadata?.position ?? "",
          name: `${p.metadata?.first_name ?? ""} ${p.metadata?.last_name ?? ""}`.trim(),
        })),
      });
    }
    leagueId = cur.previous_league_id && cur.previous_league_id !== "0" ? cur.previous_league_id : null;
  }
  // A redraft draft fills every roster spot. Dynasty / keeper leagues run short rookie drafts, so mock the
  // full startup-style draft and learn tendencies only from drafts long enough to look like one.
  const slotsTotal = (lg.roster_positions ?? []).filter((s) => s !== "IR" && s !== "TAXI").length;
  const leagueType = Number(lg.settings?.type ?? 0); // 0 redraft, 1 keeper, 2 dynasty
  if (leagueType === 2) notes.push("Dynasty league: the mock runs a full startup-length redraft, and short rookie drafts are ignored");
  if (leagueType === 1) notes.push("Keeper league: keepers aren't removed from the mock draft pool yet");
  const fullDrafts = drafts.filter((d) => Math.max(0, ...d.picks.map((p) => p.round)) >= Math.min(8, slotsTotal / 2));
  return {
    provider: "sleeper", leagueId: lg.league_id, season: lg.season, name: lg.name,
    teams: lg.total_rosters, roster, scoring, draftRounds: slotsTotal,
    notes: Array.from(new Set(notes)), managers, drafts: fullDrafts,
  };
}

// ------------------------------------------------------------------ ESPN
interface EspnLeague {
  settings?: {
    name: string; size: number;
    rosterSettings: { lineupSlotCounts: Record<string, number> };
    scoringSettings: { scoringItems: { statId: number; points: number; pointsOverrides?: Record<string, number> }[] };
    draftSettings?: { type?: string };
  };
  teams?: { id: number; name?: string; location?: string; nickname?: string; owners?: string[] }[];
  members?: { id: string; displayName: string }[];
  draftDetail?: { drafted?: boolean; picks?: { overallPickNumber: number; roundId: number; teamId: number; playerId: number }[] };
}

// ESPN lineup slot ids
const ESPN_SLOTS: Record<string, keyof ReturnType<typeof emptyRoster> | null> = {
  "0": "QB", "2": "RB", "4": "WR", "6": "TE", "23": "FLEX", "7": "SUPERFLEX", "16": "DST", "17": "K",
  "20": "BENCH", "21": null, "3": "FLEX", "5": "FLEX",
};
const ESPN_SCORING: Record<number, keyof Scoring> = {
  3: "pass_yd", 4: "pass_td", 20: "pass_int", 19: "pass_2pt", 24: "rush_yd", 25: "rush_td", 26: "rush_2pt",
  53: "rec", 42: "rec_yd", 43: "rec_td", 44: "rec_2pt", 72: "fum_lost",
};
const ESPN_POS: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };

async function importEspn(id: string, season: number, auth?: EspnAuth): Promise<ImportedLeague> {
  const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${encodeURIComponent(id)}`;
  let lg: EspnLeague;
  try {
    lg = await getJson<EspnLeague>(`${base}?view=mSettings&view=mTeam&view=mDraftDetail`, { headers: cookieHeader(auth) });
  } catch (e) {
    if (e instanceof ImportError && e.message === "PRIVATE") {
      throw new ImportError(auth?.espnS2
        ? "ESPN rejected those cookies. They expire when you log out of ESPN; log in again and copy fresh values."
        : "This ESPN league is private. Open \"Private league?\" below and paste your ESPN login cookies, or ask your " +
          "commissioner to turn on \"Make league viewable to public\".", 403);
    }
    throw e;
  }
  const s = lg.settings;
  if (!s) throw new ImportError("ESPN returned no settings for this league.", 502);
  const notes: string[] = [];
  const roster = emptyRoster();
  for (const [slot, n] of Object.entries(s.rosterSettings?.lineupSlotCounts ?? {})) {
    if (!n) continue;
    if (!(slot in ESPN_SLOTS)) { notes.push(`ESPN slot ${slot} (IDP or other) isn't supported and was skipped`); continue; }
    const key = ESPN_SLOTS[slot];
    if (key) roster[key] += n;
    if (slot === "3" || slot === "5") notes.push("RB/WR or WR/TE flex treated as a regular RB/WR/TE FLEX");
  }
  const scoring: Scoring = { ...BASE_SCORING, te_premium: 0 };
  let unmodeled = 0;
  for (const item of s.scoringSettings?.scoringItems ?? []) {
    const field = ESPN_SCORING[item.statId];
    if (field) {
      scoring[field] = item.points;
      if (item.statId === 53 && item.pointsOverrides?.["6"] != null) {
        scoring.te_premium = item.pointsOverrides["6"] - item.points;
      }
    } else if (item.points && !(item.pointsOverrides && "16" in item.pointsOverrides)) {
      unmodeled += 1;
    }
  }
  if (unmodeled) notes.push(`${unmodeled} other scoring rules (bonuses, kicking, return TDs) aren't modeled`);

  const members = new Map((lg.members ?? []).map((m) => [m.id, m.displayName]));
  const managers = (lg.teams ?? []).map((t) => ({
    id: String(t.id),
    name: t.name || `${t.location ?? ""} ${t.nickname ?? ""}`.trim() || members.get(t.owners?.[0] ?? "") || `Team ${t.id}`,
  }));

  const drafts: LeagueDraft[] = [];
  const picks = lg.draftDetail?.drafted ? lg.draftDetail.picks ?? [] : [];
  if (picks.length) {
    // Look up drafted players' positions in one small filtered request
    const ids = picks.map((p) => p.playerId);
    const filt = { players: { filterIds: { value: ids }, limit: ids.length } };
    const pool = await getJson<{ players: { player: { id: number; fullName: string; defaultPositionId: number } }[] }>(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info`,
      { headers: { "X-Fantasy-Filter": JSON.stringify(filt) } }).catch(() => ({ players: [] }));
    const info = new Map(pool.players.map((p) => [p.player.id, p.player]));
    drafts.push({
      season: String(season), type: s.draftSettings?.type ?? "snake",
      picks: picks.map((p) => ({
        round: p.roundId, pick: p.overallPickNumber, managerId: String(p.teamId),
        pos: ESPN_POS[info.get(p.playerId)?.defaultPositionId ?? 0] ?? "", name: info.get(p.playerId)?.fullName ?? "",
      })),
    });
  }
  const starters = roster.QB + roster.RB + roster.WR + roster.TE + roster.FLEX + roster.SUPERFLEX + roster.K + roster.DST;
  return {
    provider: "espn", leagueId: id, season: String(season), name: s.name, teams: s.size,
    roster, scoring, draftRounds: starters + roster.BENCH, notes: Array.from(new Set(notes)), managers, drafts,
  };
}

export async function importLeague(provider: string, id: string, season: number, auth?: EspnAuth): Promise<ImportedLeague> {
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(id)) throw new ImportError("That doesn't look like a league ID.");
  if (provider === "sleeper") return importSleeper(id);
  if (provider === "espn") return importEspn(id, season, auth);
  throw new ImportError("Supported platforms: Sleeper and ESPN.");
}
