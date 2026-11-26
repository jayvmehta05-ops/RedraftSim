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
    /** player ids (same id type as playerIds) the manager has in their starting lineup on the platform right now */
    starters?: string[];
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
    /** how your trade ratings have tuned the trade assistant for this league (lib/tradeTuning.ts) */
    tradeTuning?: TradeTuning;
    /** 1-week trades in effect (lib/loans.ts) */
    loans?: Loan[];
    /** swaps noticed on a roster refresh, waiting for you to say whether they were 1-week trades */
    pendingTrades?: PendingTrade[];
  };
  /** league format as the platform reports it */
  kind?: "redraft" | "keeper" | "dynasty";
  /** the league's calendar: first playoff week, championship (last) week, and trade deadline */
  schedule?: {
    playoffStart: number;
    lastWeek: number;
    /** last NFL week trades are allowed (Sleeper), or null when there's no deadline */
    tradeDeadlineWeek?: number | null;
    /** trade deadline as a timestamp in ms (ESPN) */
    tradeDeadlineAt?: number | null;
    /** how many teams make the playoffs */
    playoffTeams?: number;
  };
}

/** Trade assistant settings tuned by your trade ratings (see lib/tradeTuning.ts). Missing = default. */
export interface TradeTuning {
  /** smallest lineup gain (share of your lineup) a suggested trade must add */
  minGainPct?: number;
  /** multiplier on how much your first backup at each position is worth */
  depthBoost?: number;
  thinVotes?: number;
  /** hide trades that leave an empty spot or no backup */
  hideThin?: boolean;
  /** lowest acceptance chance a suggestion may have */
  minAccept?: number;
  /** managerId -> how much harder a sell they are than their profile says */
  partnerPenalty?: Record<string, number>;
  votes?: { up: number; down: number };
}

/** A player on a 1-week trade: he belongs to `owner` but is on `holder`'s roster until the loan ends. */
export interface Loan {
  /** board player id */
  playerId: string;
  /** the platform's id for him (Sleeper or ESPN), when known, so the loan clears once he's back */
  pid?: string;
  owner: string;
  holder: string;
  /** NFL week the loan was for */
  week: number;
}

/** A swap between you and `partner` seen on a refresh; ids are your league platform's player ids. */
export interface PendingTrade {
  partner: string;
  sent: string[];
  got: string[];
  week: number;
}
