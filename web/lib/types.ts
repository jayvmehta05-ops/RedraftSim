export type Pos = "QB" | "RB" | "WR" | "TE";
export const POSITIONS: Pos[] = ["QB", "RB", "WR", "TE"];

export const STAT_KEYS = [
  "pass_att", "pass_cmp", "pass_yds", "pass_td", "pass_int", "pass_2pt",
  "rush_att", "rush_yds", "rush_td", "rush_2pt",
  "targets", "rec", "rec_yds", "rec_td", "rec_2pt",
  "fum_lost",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type StatLine = Record<StatKey, number>;

/** One player as exported by scripts/project_2027.py (web/data/board.json). */
export interface RawPlayer {
  id: string;
  name: string;
  pos: Pos;
  team: string;
  age: number | null;
  yearsExp: number | null;
  college: string | null;
  headshot: string | null;
  rookie: boolean;
  draftTier: number | null;
  injury: string | null;
  injuryPart: string | null;
  flags: string[];
  notes: string[];
  g26: number;
  g25: number;
  tgtShare: number | null;
  touchShare: number | null;
  s26: StatLine;
  projGames: number;
  proj: StatLine;
  marketRank: number | null;
  adpOverride: number | null;
  /** ESPN player id (maps ESPN league rosters onto the board) */
  espnId?: string | null;
  /** ESPN average draft position (PPR), roster %, and per-game rest-of-season projection */
  espnAdp: number | null;
  espnOwned: number | null;
  espnRos: StatLine | null;
  // outputs under the default league settings
  rank: number;
  posRank: number;
  adp: number;
  tier: number;
  ppg: number;
  ppg26: number;
  points: number;
  vorp: number;
  rankDelta: number | null;
  adpDelta: number | null;
}

export interface Replacement {
  points: Record<Pos, number>;
  starters: Record<Pos, number>;
}

export interface BoardMeta {
  generatedAt: string;
  sourceSeason: number;
  throughWeek: number;
  previousWeek: number | null;
  targetSeason: number;
  lastIngest: string | null;
  ingestNotes: string | null;
  replacement: Replacement;
  poolSize: number;
  configHash: string;
  /** which market feeds the ADP blend: ESPN ADP, or Sleeper search rank as fallback */
  marketSource: "espn" | "sleeper";
  /** publication switches from league_settings.json */
  publication?: { show_headshots: boolean; show_espn_fields: boolean };
}

export interface BoardData {
  meta: BoardMeta;
  players: RawPlayer[];
}

export interface TrendData {
  weeks: number[];
  players: Record<string, { adp: (number | null)[]; rank: (number | null)[]; ppg: (number | null)[] }>;
}

export interface Scoring {
  pass_yd: number;
  pass_td: number;
  pass_int: number;
  pass_2pt: number;
  rush_yd: number;
  rush_td: number;
  rush_2pt: number;
  rec: number;
  rec_yd: number;
  rec_td: number;
  rec_2pt: number;
  fum_lost: number;
  te_premium: number;
}

export interface LeagueConfig {
  league_name: string;
  imported_from?: string;
  target_season: number;
  source_season: number;
  teams: number;
  draft_rounds: number;
  /** K and DST are drafted but not projected; the mock draft reserves its final rounds for them. */
  roster: { QB: number; RB: number; WR: number; TE: number; FLEX: number; SUPERFLEX?: number; K?: number; DST?: number; BENCH: number };
  flex_eligible: Pos[];
  scoring: Scoring;
  projection: {
    board_size: number;
    export_pool_size: number;
    prior_season_weight: number;
    td_regression: number;
    market_adp_weight: number;
    base_games: number;
  };
}

/** Quick toggles in the Settings drawer. Values outside the preset options come from an imported league. */
export interface Toggles {
  flexCount: number;
  superflex: number;
  ppr: number;
  passTd: number;
  tePremium: number;
}

export interface RankedPlayer extends RawPlayer {
  /** Values recomputed for the active settings. */
  cur: {
    rank: number;
    posRank: number;
    adp: number;
    tier: number;
    ppg: number;
    ppg26: number;
    points: number;
    vorp: number;
    /** default-settings rank minus active-settings rank (positive = higher under active settings) */
    settingsDelta: number;
    /** ESPN rest-of-season projection scored with the active settings */
    espnRosPpg: number | null;
  };
}

// ------------------------------------------------------------------ league import
export interface LeagueDraftPick {
  round: number;
  pick: number;
  managerId: string;
  pos: string;
  name: string;
}
export interface LeagueDraft {
  season: string;
  type: string;
  picks: LeagueDraftPick[];
}
/** A league imported from Sleeper or ESPN by /api/league. */
export interface ImportedLeague {
  /** "manual" = set up by hand in the leaguemate editor (no platform import) */
  provider: "sleeper" | "espn" | "manual";
  leagueId: string;
  season: string;
  name: string;
  teams: number;
  roster: LeagueConfig["roster"];
  scoring: Scoring;
  draftRounds: number;
  /** approximations and rules the model can't represent */
  notes: string[];
  managers: { id: string; name: string }[];
  drafts: LeagueDraft[];
  /** current rosters; player ids are Sleeper ids or ESPN ids depending on idType */
  rosters?: {
    managerId: string;
    playerIds: string[];
    idType: "sleeper" | "espn";
    /** board player ids added by hand / imported players removed by hand (kept across refreshes) */
    manualIds?: string[];
    removedIds?: string[];
    /** current season record when the platform provides it */
    record?: { wins: number; losses: number; ties: number; pointsFor: number };
    /** FAAB budget remaining (Sleeper) */
    faabLeft?: number;
    /** Points scored in each completed regular-season week (index 0 = week 1), and that week's opponent's
     *  managerId (null for a bye / median week). Used by the luck meter. */
    weekly?: number[];
    opponents?: (string | null)[];
  }[];
  fetchedAt?: string;
  /** League rules the user sets by hand (kept across refreshes) */
  rules?: {
    /** the league allows 1-week (loan) trades: players swap for one week, then go back */
    weekTrades?: boolean;
    /** keeper features on/off for this league (overrides what the platform reported in `kind`) */
    keeper?: boolean;
    /** board player ids that can't be traded right now (e.g. on a 1-week trade); kept across refreshes */
    locked?: string[];
  };
  /** league format as the platform reports it */
  kind?: "redraft" | "keeper" | "dynasty";
}
