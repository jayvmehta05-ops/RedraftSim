"""Shared paths, config loading, SQLite schema and scoring helpers."""
from __future__ import annotations

import hashlib
import json
from datetime import date, timedelta
import re
import sqlite3
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config" / "league_settings.json"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "fantasy_2027.db"
def rookies_csv(target_season: int) -> Path:
    """Prospect list for the draft class entering `target_season` (e.g. data/rookies_2028.csv)."""
    return DATA_DIR / f"rookies_{target_season}.csv"
WEB_DATA_DIR = ROOT / "web" / "data"

FANTASY_POSITIONS = ("QB", "RB", "WR", "TE")

# Per-game stat components the projection engine produces. The web app re-scores
# these same components in the browser whenever a Settings toggle changes.
STAT_COMPONENTS = (
    "pass_att", "pass_cmp", "pass_yds", "pass_td", "pass_int", "pass_2pt",
    "rush_att", "rush_yds", "rush_td", "rush_2pt",
    "targets", "rec", "rec_yds", "rec_td", "rec_2pt",
    "fum_lost",
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS players (
    player_id            TEXT PRIMARY KEY,   -- Sleeper id, or 'rk:<slug>' for 2027 rookies
    gsis_id              TEXT,
    name                 TEXT NOT NULL,
    merge_name           TEXT NOT NULL,
    position             TEXT NOT NULL,
    team                 TEXT,
    age                  REAL,
    birth_date           TEXT,
    years_exp            INTEGER,
    college              TEXT,
    status               TEXT,
    injury_status        TEXT,
    injury_body_part     TEXT,
    injury_notes         TEXT,
    depth_chart_position TEXT,
    depth_chart_order    INTEGER,
    search_rank          INTEGER,
    headshot_url         TEXT,
    is_rookie_2027       INTEGER NOT NULL DEFAULT 0,
    updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_gsis ON players(gsis_id);

CREATE TABLE IF NOT EXISTS weekly_stats (
    gsis_id      TEXT NOT NULL,
    player_id    TEXT,                       -- Sleeper id when mapped
    season       INTEGER NOT NULL,
    week         INTEGER NOT NULL,
    source       TEXT NOT NULL,              -- 'nflverse' | 'sleeper'
    name         TEXT,
    position     TEXT,
    team         TEXT,
    opponent     TEXT,
    pass_att REAL, pass_cmp REAL, pass_yds REAL, pass_td REAL, pass_int REAL, pass_2pt REAL,
    rush_att REAL, rush_yds REAL, rush_td REAL, rush_2pt REAL,
    targets  REAL, rec REAL, rec_yds REAL, rec_td REAL, rec_2pt REAL,
    fum_lost REAL,
    target_share REAL,
    fantasy_points_ppr REAL,
    PRIMARY KEY (gsis_id, season, week)
);
CREATE INDEX IF NOT EXISTS idx_weekly_player ON weekly_stats(player_id, season);

CREATE TABLE IF NOT EXISTS rookies (
    player_id          TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    position           TEXT NOT NULL,
    college            TEXT,
    draft_capital_tier INTEGER NOT NULL,
    projected_pick     INTEGER,
    talent_grade       REAL,
    age_2027           REAL,
    landing_team       TEXT,
    adp_override       REAL,
    notes              TEXT
);

-- ESPN public fantasy data (lm-api-reads.fantasy.espn.com, no key). Latest pull per player.
CREATE TABLE IF NOT EXISTS espn_players (
    espn_id        TEXT PRIMARY KEY,
    player_id      TEXT,                     -- Sleeper id when mapped
    name           TEXT NOT NULL,
    position       TEXT NOT NULL,
    adp            REAL,                     -- ESPN average draft position (PPR)
    pct_owned      REAL,
    pct_started    REAL,
    auction_value  REAL,
    injury_status  TEXT,
    fetched_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_espn_player ON espn_players(player_id);

-- ESPN weekly projections (statSourceId=1) as stat components, all weeks of the season.
CREATE TABLE IF NOT EXISTS espn_weekly_proj (
    season    INTEGER NOT NULL,
    week      INTEGER NOT NULL,
    espn_id   TEXT NOT NULL,
    player_id TEXT,
    pass_att REAL, pass_cmp REAL, pass_yds REAL, pass_td REAL, pass_int REAL, pass_2pt REAL,
    rush_att REAL, rush_yds REAL, rush_td REAL, rush_2pt REAL,
    targets  REAL, rec REAL, rec_yds REAL, rec_td REAL, rec_2pt REAL,
    fum_lost REAL,
    espn_points REAL,
    PRIMARY KEY (season, week, espn_id)
);

-- ESPN ADP / roster% history, one row per player per pull date.
CREATE TABLE IF NOT EXISTS espn_market_history (
    fetch_date TEXT NOT NULL,
    espn_id    TEXT NOT NULL,
    player_id  TEXT,
    adp        REAL,
    pct_owned  REAL,
    pct_started REAL,
    PRIMARY KEY (fetch_date, espn_id)
);

-- Key/value facts the pipeline resolves at ingest time (e.g. which seasons are source / target).
CREATE TABLE IF NOT EXISTS pipeline_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_runs (
    run_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at        TEXT NOT NULL,
    season        INTEGER NOT NULL,
    sleeper_week  INTEGER,
    stats_through INTEGER,
    players_count INTEGER,
    stats_rows    INTEGER,
    notes         TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    season        INTEGER NOT NULL,
    through_week  INTEGER NOT NULL,
    snapshot_date TEXT NOT NULL,
    config_hash   TEXT NOT NULL,
    is_backfill   INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    UNIQUE (season, through_week, config_hash)
);

CREATE TABLE IF NOT EXISTS projections (
    snapshot_id  INTEGER NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,
    player_id    TEXT NOT NULL,
    overall_rank INTEGER NOT NULL,
    pos_rank     INTEGER NOT NULL,
    adp          REAL NOT NULL,
    tier         INTEGER NOT NULL,
    proj_ppg     REAL NOT NULL,
    proj_games   REAL NOT NULL,
    proj_points  REAL NOT NULL,
    vorp         REAL NOT NULL,
    PRIMARY KEY (snapshot_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_proj_player ON projections(player_id);
"""


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def season_start(year: int) -> date:
    """NFL kickoff ≈ the Thursday after Labor Day (first Monday of September)."""
    d = date(year, 9, 1)
    labor_day = d + timedelta(days=(7 - d.weekday()) % 7)
    return labor_day + timedelta(days=3)


def set_meta(con, key: str, value) -> None:
    con.execute("INSERT OR REPLACE INTO pipeline_meta VALUES (?, ?)", (key, str(value)))


def get_meta(con, key: str, default=None):
    row = con.execute("SELECT value FROM pipeline_meta WHERE key = ?", (key,)).fetchone()
    return row[0] if row else default


def resolve_seasons(con, cfg: dict) -> tuple[int, int, int]:
    """(source season, target season, Sleeper's current season).

    With "source_season": "auto" (the default) the source is the newest season with completed NFL games,
    as recorded by update_data.py, and the target is the year after. So the board projects 2027 during
    the 2026 season and its offseason, and rolls to 2028 once 2027 games start.
    """
    if str(cfg.get("source_season", "auto")) != "auto":
        source = int(cfg["source_season"])
        target = int(cfg["target_season"]) if str(cfg.get("target_season", "auto")) != "auto" else source + 1
        return source, target, int(get_meta(con, "sleeper_season", source))
    source = get_meta(con, "source_season")
    if source is None:
        raise SystemExit("Seasons not resolved yet; run scripts/update_data.py first.")
    return int(source), int(get_meta(con, "target_season")), int(get_meta(con, "sleeper_season", source))


def config_hash(cfg: dict) -> str:
    """Hash of the settings that change rankings: teams, skill-position starters + FLEX, scoring.

    Bench size and K / D/ST slots don't affect VORP, so changing them keeps the trend history.
    """
    roster = {k: cfg["roster"].get(k, 0) for k in ("QB", "RB", "WR", "TE", "FLEX")}
    key = json.dumps({"teams": cfg["teams"], "roster": roster, "scoring": cfg["scoring"]}, sort_keys=True)
    return hashlib.sha1(key.encode()).hexdigest()[:10]


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(SCHEMA)
    return con


_SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b")


def merge_name(name: str) -> str:
    """Normalise a player name for cross-source matching."""
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[.'`\-]", "", s)
    s = _SUFFIX.sub("", s)
    return re.sub(r"\s+", " ", s).strip()


def slugify(name: str) -> str:
    return merge_name(name).replace(" ", "-")


def points_per_game(stats: dict, position: str, scoring: dict) -> float:
    """Fantasy points for one game's (or one per-game average) stat line."""
    g = lambda k: float(stats.get(k) or 0.0)  # noqa: E731
    rec_pts = scoring["rec"] + (scoring.get("te_premium", 0.0) if position == "TE" else 0.0)
    return (
        g("pass_yds") * scoring["pass_yd"]
        + g("pass_td") * scoring["pass_td"]
        + g("pass_int") * scoring["pass_int"]
        + g("pass_2pt") * scoring["pass_2pt"]
        + g("rush_yds") * scoring["rush_yd"]
        + g("rush_td") * scoring["rush_td"]
        + g("rush_2pt") * scoring["rush_2pt"]
        + g("rec") * rec_pts
        + g("rec_yds") * scoring["rec_yd"]
        + g("rec_td") * scoring["rec_td"]
        + g("rec_2pt") * scoring["rec_2pt"]
        + g("fum_lost") * scoring["fum_lost"]
    )
