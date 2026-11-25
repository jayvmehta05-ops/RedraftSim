"""Weekly data ingestion: Sleeper metadata + nflverse weekly stats + 2027 rookie class.

Usage:
    python scripts/update_data.py                 # normal weekly run
    python scripts/update_data.py --refresh-prior # also re-download the prior season

Sources (all free / public, no keys):
  * Sleeper players + injuries + depth charts  https://api.sleeper.app/v1/players/nfl
  * Sleeper league state (current week)          https://api.sleeper.app/v1/state/nfl
  * Sleeper weekly stats (fallback for weeks nflverse has not published yet)
  * nflverse weekly player stats                 github.com/nflverse/nflverse-data (stats_player)
  * DynastyProcess ID crosswalk (sleeper_id <-> gsis_id <-> espn_id)
  * ESPN fantasy player pool: ADP, roster %, injury status, weekly projections (public, unofficial)
  * data/rookies_2027.csv (+ optional ROOKIE_SOURCE_URL hook)
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
from datetime import datetime, timezone

import pandas as pd
import requests

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    FANTASY_POSITIONS, STAT_COMPONENTS, connect, load_config, merge_name, rookies_csv, set_meta, slugify,
)

SLEEPER = "https://api.sleeper.app/v1"
NFLVERSE_WEEKLY = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv"
ID_MAP_URL = "https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv"
HEADERS = {"User-Agent": "future-fantasy/1.0 (open-source fantasy projection pipeline)"}

NFLVERSE_COLS = {
    "attempts": "pass_att", "completions": "pass_cmp", "passing_yards": "pass_yds",
    "passing_tds": "pass_td", "passing_interceptions": "pass_int", "passing_2pt_conversions": "pass_2pt",
    "carries": "rush_att", "rushing_yards": "rush_yds", "rushing_tds": "rush_td",
    "rushing_2pt_conversions": "rush_2pt", "targets": "targets", "receptions": "rec",
    "receiving_yards": "rec_yds", "receiving_tds": "rec_td", "receiving_2pt_conversions": "rec_2pt",
}
SLEEPER_STAT_COLS = {
    "pass_att": "pass_att", "pass_cmp": "pass_cmp", "pass_yd": "pass_yds", "pass_td": "pass_td",
    "pass_int": "pass_int", "pass_2pt": "pass_2pt", "rush_att": "rush_att", "rush_yd": "rush_yds",
    "rush_td": "rush_td", "rush_2pt": "rush_2pt", "rec_tgt": "targets", "rec": "rec",
    "rec_yd": "rec_yds", "rec_td": "rec_td", "rec_2pt": "rec_2pt", "fum_lost": "fum_lost",
}
WEEKLY_COLS = ["gsis_id", "player_id", "season", "week", "source", "name", "position", "team", "opponent",
               *STAT_COMPONENTS, "target_share", "fantasy_points_ppr"]
# A Sleeper fallback week only counts once most games are final (filters out Thursday-only weeks).
MIN_PLAYERS_FOR_COMPLETE_WEEK = 250


def log(msg: str) -> None:
    print(f"[update_data] {msg}", flush=True)


def get_json(url: str):
    r = requests.get(url, headers=HEADERS, timeout=90)
    r.raise_for_status()
    return r.json()


def get_csv(url: str) -> pd.DataFrame:
    r = requests.get(url, headers=HEADERS, timeout=180)
    r.raise_for_status()
    return pd.read_csv(io.StringIO(r.text), low_memory=False)


# --------------------------------------------------------------------------- players
def fetch_players(now: str) -> pd.DataFrame:
    raw = get_json(f"{SLEEPER}/players/nfl")
    rows = []
    for pid, p in raw.items():
        pos = p.get("position")
        if pos not in FANTASY_POSITIONS:
            continue
        if not (p.get("active") or p.get("team")):
            continue
        name = p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
        rows.append({
            "player_id": str(pid), "gsis_id": (p.get("gsis_id") or "").strip() or None,
            "name": name, "merge_name": merge_name(name), "position": pos, "team": p.get("team"),
            "age": p.get("age"), "birth_date": p.get("birth_date"), "years_exp": p.get("years_exp"),
            "college": p.get("college"), "status": p.get("status"),
            "injury_status": p.get("injury_status"), "injury_body_part": p.get("injury_body_part"),
            "injury_notes": p.get("injury_notes"), "depth_chart_position": p.get("depth_chart_position"),
            "depth_chart_order": p.get("depth_chart_order"), "search_rank": p.get("search_rank"),
            "headshot_url": None, "is_rookie_2027": 0, "updated_at": now,
        })
    df = pd.DataFrame(rows)

    # Fill missing gsis ids from the DynastyProcess crosswalk; also return its ESPN -> Sleeper map.
    espn_to_sleeper: dict[str, str] = {}
    try:
        ids = get_csv(ID_MAP_URL)
        norm = lambda s: s.astype(str).str.replace(r"\.0$", "", regex=True)  # noqa: E731
        g = ids[["sleeper_id", "gsis_id"]].dropna()
        xwalk = dict(zip(norm(g["sleeper_id"]), g["gsis_id"]))
        before = df["gsis_id"].notna().sum()
        df["gsis_id"] = df["gsis_id"].fillna(df["player_id"].map(xwalk))
        log(f"gsis ids: {before} from Sleeper, {df['gsis_id'].notna().sum()} after crosswalk")
        e = ids[["espn_id", "sleeper_id"]].dropna()
        espn_to_sleeper = dict(zip(norm(e["espn_id"]), norm(e["sleeper_id"])))
    except Exception as e:  # crosswalk is optional; name matching covers the rest
        log(f"WARN id crosswalk unavailable ({e}); falling back to name matching")
    return df, espn_to_sleeper


# --------------------------------------------------------------------------- stats
def fetch_nflverse_weekly(season: int) -> pd.DataFrame:
    df = get_csv(NFLVERSE_WEEKLY.format(season=season))
    df = df[(df["season_type"] == "REG") & (df["position"].isin(FANTASY_POSITIONS))].copy()
    out = df.rename(columns=NFLVERSE_COLS)
    out["fum_lost"] = (df["rushing_fumbles_lost"].fillna(0) + df["receiving_fumbles_lost"].fillna(0)
                       + df["sack_fumbles_lost"].fillna(0))
    out["gsis_id"] = df["player_id"]
    out["name"] = df["player_display_name"]
    out["opponent"] = df["opponent_team"]
    out["source"] = "nflverse"
    out["player_id"] = None
    return out[WEEKLY_COLS + ["headshot_url"]]


def fetch_sleeper_week(season: int, week: int, players: pd.DataFrame) -> pd.DataFrame:
    raw = get_json(f"{SLEEPER}/stats/nfl/regular/{season}/{week}")
    meta = players.set_index("player_id")
    rows = []
    for pid, s in raw.items():
        if pid not in meta.index or not s.get("gp"):
            continue
        m = meta.loc[pid]
        row = {dst: float(s.get(src, 0) or 0) for src, dst in SLEEPER_STAT_COLS.items()}
        row.update({
            "gsis_id": m["gsis_id"] or f"sl:{pid}", "player_id": pid, "season": season, "week": week,
            "source": "sleeper", "name": m["name"], "position": m["position"], "team": m["team"],
            "opponent": None, "target_share": None, "fantasy_points_ppr": s.get("pts_ppr"),
        })
        rows.append(row)
    return pd.DataFrame(rows, columns=WEEKLY_COLS)


def attach_player_ids(stats: pd.DataFrame, players: pd.DataFrame) -> pd.DataFrame:
    """Map nflverse gsis ids to Sleeper ids (gsis first, then name+position)."""
    by_gsis = players.dropna(subset=["gsis_id"]).drop_duplicates("gsis_id").set_index("gsis_id")["player_id"]
    stats["player_id"] = stats["player_id"].fillna(stats["gsis_id"].map(by_gsis))
    pl = players.copy()
    pl["key"] = pl["merge_name"] + "|" + pl["position"]
    by_name = pl.drop_duplicates("key", keep=False).set_index("key")["player_id"]
    key = stats["name"].map(merge_name) + "|" + stats["position"]
    stats["player_id"] = stats["player_id"].fillna(key.map(by_name))
    return stats


def upsert_weekly(con, df: pd.DataFrame) -> int:
    if df.empty:
        return 0
    df = df[WEEKLY_COLS].astype(object).where(df[WEEKLY_COLS].notna(), None)
    placeholders = ",".join("?" * len(WEEKLY_COLS))
    con.executemany(f"INSERT OR REPLACE INTO weekly_stats ({','.join(WEEKLY_COLS)}) VALUES ({placeholders})",
                    df.itertuples(index=False, name=None))
    return len(df)


# --------------------------------------------------------------------------- ESPN
ESPN_PLAYERS = ("https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}"
                "/segments/0/leaguedefaults/3?view=kona_player_info")
ESPN_POS = {1: "QB", 2: "RB", 3: "WR", 4: "TE"}
# ESPN stat id -> our component (verified against nflverse box scores)
ESPN_STAT_IDS = {
    "0": "pass_att", "1": "pass_cmp", "3": "pass_yds", "4": "pass_td", "20": "pass_int", "19": "pass_2pt",
    "23": "rush_att", "24": "rush_yds", "25": "rush_td", "26": "rush_2pt",
    "58": "targets", "53": "rec", "42": "rec_yds", "43": "rec_td", "44": "rec_2pt", "72": "fum_lost",
}


def fetch_espn(con, season: int, players: pd.DataFrame, espn_to_sleeper: dict, now: str) -> str:
    """ESPN ADP, roster %, injury status and weekly projections. Never fails the run.

    ESPN's fantasy API is public but unofficial; if it errors, the previous ESPN tables are kept
    and project_2027.py falls back to Sleeper's market rank.
    """
    filt = {"players": {"limit": 1500, "filterSlotIds": {"value": [0, 2, 4, 6]},
                        "sortPercOwned": {"sortPriority": 1, "sortAsc": False}}}
    try:
        r = requests.get(ESPN_PLAYERS.format(season=season), timeout=120,
                         headers={**HEADERS, "X-Fantasy-Filter": json.dumps(filt)})
        r.raise_for_status()
        raw = r.json().get("players", [])
    except Exception as e:
        log(f"WARN ESPN fetch failed ({e}); keeping previous ESPN data")
        return f"espn=failed({type(e).__name__})"
    if len(raw) < 200:
        log(f"WARN ESPN returned only {len(raw)} players; keeping previous ESPN data")
        return f"espn=short({len(raw)})"

    name_key = players.assign(k=players["merge_name"] + "|" + players["position"]) \
        .drop_duplicates("k", keep=False).set_index("k")["player_id"]
    known = set(players["player_id"])
    prow, wrows, hrows = [], [], []
    today = now[:10]
    for e in raw:
        p = e.get("player") or {}
        pos = ESPN_POS.get(p.get("defaultPositionId"))
        if not pos:
            continue
        eid = str(p["id"])
        sid = espn_to_sleeper.get(eid)
        if sid not in known:
            sid = name_key.get(merge_name(p.get("fullName", "")) + "|" + pos)
        own = p.get("ownership") or {}
        adp = own.get("averageDraftPosition")
        adp = float(adp) if adp and adp > 0 else None
        prow.append((eid, sid, p.get("fullName"), pos, adp, own.get("percentOwned"), own.get("percentStarted"),
                     own.get("auctionValueAverage"), p.get("injuryStatus"), now))
        hrows.append((today, eid, sid, adp, own.get("percentOwned"), own.get("percentStarted")))
        for s in p.get("stats") or []:
            if s.get("statSourceId") != 1 or s.get("statSplitTypeId") != 1 or s.get("seasonId") != season:
                continue
            st = s.get("stats") or {}
            comp = {c: float(st.get(k, 0) or 0) for k, c in ESPN_STAT_IDS.items()}
            wrows.append((season, int(s["scoringPeriodId"]), eid, sid, *[comp[c] for c in STAT_COMPONENTS],
                          float(s.get("appliedTotal") or 0)))

    con.execute("DELETE FROM espn_players")
    con.executemany("INSERT INTO espn_players VALUES (?,?,?,?,?,?,?,?,?,?)", prow)
    con.execute("DELETE FROM espn_weekly_proj WHERE season = ?", (season,))
    con.executemany(f"INSERT OR REPLACE INTO espn_weekly_proj VALUES ({','.join('?' * (5 + len(STAT_COMPONENTS)))})",
                    wrows)
    con.executemany("INSERT OR REPLACE INTO espn_market_history VALUES (?,?,?,?,?,?)", hrows)
    mapped = sum(1 for r in prow if r[1])
    log(f"ESPN: {len(prow)} players ({mapped} mapped to Sleeper), {sum(1 for r in prow if r[4])} with ADP, "
        f"{len(wrows)} weekly projection rows")
    return f"espn_players={len(prow)}; espn_mapped={mapped}"


# --------------------------------------------------------------------------- rookies
def fetch_rookie_updates(path) -> None:
    """Hook: merge an external prospect board into rookies_2027.csv.

    Set ROOKIE_SOURCE_URL to a CSV with the same columns (e.g. a published Google Sheet).
    New prospects are appended; for existing names only blank local fields are filled,
    so your hand edits in rookies_2027.csv always win.
    """
    url = os.environ.get("ROOKIE_SOURCE_URL")
    if not url:
        return
    try:
        remote = get_csv(url)
    except Exception as e:
        log(f"WARN rookie source fetch failed: {e}")
        return
    local = pd.read_csv(path)
    local_keys = set(local["name"].map(merge_name))
    for _, r in remote.iterrows():
        k = merge_name(r["name"])
        if k not in local_keys:
            local = pd.concat([local, pd.DataFrame([r])], ignore_index=True)
        else:
            idx = local.index[local["name"].map(merge_name) == k][0]
            for col in remote.columns:
                if col in local.columns and pd.isna(local.at[idx, col]) and pd.notna(r[col]):
                    local.at[idx, col] = r[col]
    local.to_csv(path, index=False)
    log(f"rookie hook merged {len(remote)} rows from ROOKIE_SOURCE_URL")


def load_rookies(con, now: str, target: int) -> int:
    path = rookies_csv(target)
    con.execute("DELETE FROM rookies")
    con.execute("DELETE FROM players WHERE is_rookie_2027 = 1")
    if not path.exists():
        log(f"WARN {path.name} not found: no incoming rookies on the {target} board. Copy last year's file, "
            f"rename it to {path.name} and fill in the new prospect class.")
        return 0
    fetch_rookie_updates(path)
    rk = pd.read_csv(path)
    for _, r in rk.iterrows():
        if r["position"] not in FANTASY_POSITIONS:
            continue
        pid = f"rk:{slugify(r['name'])}"
        val = lambda c: None if pd.isna(r.get(c)) else r.get(c)  # noqa: E731
        con.execute(
            "INSERT INTO rookies VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (pid, r["name"], r["position"], val("college"), int(r["draft_capital_tier"]),
             val("projected_pick"), float(val("talent_grade") or 1.0), val("age_2027"),
             val("landing_team"), val("adp_override"), val("notes")),
        )
        con.execute(
            """INSERT OR REPLACE INTO players (player_id, name, merge_name, position, team, age, college,
               years_exp, is_rookie_2027, updated_at) VALUES (?,?,?,?,?,?,?,?,1,?)""",
            (pid, r["name"], merge_name(r["name"]), r["position"], val("landing_team"),
             val("age_2027"), val("college"), -1, now),
        )
    return len(rk)


# --------------------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh-prior", action="store_true", help="re-download the prior season's stats")
    args = ap.parse_args()

    cfg = load_config()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    con = connect()

    state = get_json(f"{SLEEPER}/state/nfl")
    log(f"Sleeper state: season={state.get('season')} week={state.get('week')} ({state.get('season_type')})")
    sleeper_season = int(state.get("season") or datetime.now().year)

    # --- Source season: the newest one with completed regular-season games (auto), or the config value
    if str(cfg.get("source_season", "auto")) == "auto":
        season, stats = sleeper_season, None
        try:
            stats = fetch_nflverse_weekly(season)
        except requests.HTTPError:
            stats = None
        if stats is None or stats.empty:
            log(f"no {season} regular-season games yet; projecting from {season - 1}")
            season -= 1
            stats = fetch_nflverse_weekly(season)
        target = season + 1
    else:
        season = int(cfg["source_season"])
        target = int(cfg["target_season"]) if str(cfg.get("target_season", "auto")) != "auto" else season + 1
        stats = fetch_nflverse_weekly(season)
    set_meta(con, "source_season", season)
    set_meta(con, "target_season", target)
    set_meta(con, "sleeper_season", sleeper_season)
    log(f"seasons: projecting {target} from {season} data")
    sleeper_week = int(state.get("week") or 0) if str(state.get("season")) == str(season) else 18

    players, espn_to_sleeper = fetch_players(now)
    log(f"Sleeper players (QB/RB/WR/TE, active or rostered): {len(players)}")
    nflverse_through = int(stats["week"].max()) if len(stats) else 0
    log(f"nflverse {season}: {len(stats)} rows through week {nflverse_through}")

    # --- Sleeper fallback for weeks nflverse has not published yet
    fallback = []
    for wk in range(nflverse_through + 1, min(sleeper_week, 18) + 1):
        wdf = fetch_sleeper_week(season, wk, players)
        if len(wdf) >= MIN_PLAYERS_FOR_COMPLETE_WEEK:
            fallback.append(wdf)
            log(f"Sleeper fallback week {wk}: {len(wdf)} player-games")
        else:
            log(f"Sleeper week {wk}: only {len(wdf)} player-games so far, treating as incomplete")
    stats_through = nflverse_through + len(fallback)

    # Headshots from nflverse
    heads = stats.dropna(subset=["headshot_url"]).drop_duplicates("gsis_id", keep="last")
    players["headshot_url"] = players["gsis_id"].map(heads.set_index("gsis_id")["headshot_url"])

    cols = list(players.columns)
    con.execute("DELETE FROM players WHERE is_rookie_2027 = 0")
    con.executemany(f"INSERT OR REPLACE INTO players ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                    players.astype(object).where(players.notna(), None).itertuples(index=False, name=None))

    stats = attach_player_ids(stats.drop(columns=["headshot_url"]), players)
    con.execute("DELETE FROM weekly_stats WHERE season = ?", (season,))
    n_rows = upsert_weekly(con, stats)
    for wdf in fallback:
        n_rows += upsert_weekly(con, wdf)

    # --- prior season (used as a stabilising prior); only download once unless asked
    prior = season - 1
    have_prior = con.execute("SELECT COUNT(*) FROM weekly_stats WHERE season = ?", (prior,)).fetchone()[0]
    if args.refresh_prior or have_prior == 0:
        pstats = attach_player_ids(fetch_nflverse_weekly(prior).drop(columns=["headshot_url"]), players)
        con.execute("DELETE FROM weekly_stats WHERE season = ?", (prior,))
        upsert_weekly(con, pstats)
        log(f"nflverse {prior}: {len(pstats)} rows stored")
    else:
        log(f"nflverse {prior}: {have_prior} rows already stored (use --refresh-prior to reload)")

    espn_note = fetch_espn(con, season, players, espn_to_sleeper, now)

    n_rookies = load_rookies(con, now, target)
    log(f"{target} rookie prospects loaded: {n_rookies}")

    mapped = con.execute("SELECT AVG(player_id IS NOT NULL) FROM weekly_stats WHERE season = ?", (season,)).fetchone()[0]
    con.execute(
        "INSERT INTO ingest_runs (run_at, season, sleeper_week, stats_through, players_count, stats_rows, notes) "
        "VALUES (?,?,?,?,?,?,?)",
        (now, season, sleeper_week, stats_through, len(players), n_rows,
         f"nflverse_through={nflverse_through}; sleeper_fallback_weeks={len(fallback)}; id_match={mapped:.1%}; "
         f"{espn_note}"),
    )
    con.commit()
    con.close()
    log(f"done: {n_rows} {season} stat rows through week {stats_through}; id match rate {mapped:.1%}")


if __name__ == "__main__":
    main()
