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
  target_season: number;
  source_season: number;
  teams: number;
  draft_rounds: number;
  roster: { QB: number; RB: number; WR: number; TE: number; FLEX: number; BENCH: number };
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

/** The four quick toggles exposed in the Settings drawer. */
export interface Toggles {
  flexCount: 1 | 2;
  ppr: 1 | 0.5;
  passTd: 4 | 6;
  tePremium: 0 | 0.5;
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
  };
}
