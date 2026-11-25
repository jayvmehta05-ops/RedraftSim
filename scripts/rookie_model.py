"""Rookie projection curve learned from draft history.

For every QB/RB/WR/TE drafted since 2012, look up their rookie-season regular-season stats and average them
by position and draft-slot bucket. Busts and injuries count (a rookie who never played contributes zero games),
and a later bucket is never allowed to project better than an earlier one (pool-adjacent-violators).

    python scripts/rookie_model.py            # fit on every complete season, write data/rookie_curve.json

The weekly projection uses data/rookie_curve.json for the incoming rookie class (by projected pick from
data/rookies_<target>.csv); the backtest refits it using only seasons before the season it is testing.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys

import pandas as pd
import requests

sys.path.insert(0, os.path.dirname(__file__))
from common import DATA_DIR, FANTASY_POSITIONS, STAT_COMPONENTS, connect, get_meta, load_config, points_per_game  # noqa: E402

DRAFT_PICKS = "https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv"
SEASON_STATS = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_{season}.csv"
CURVE_PATH = DATA_DIR / "rookie_curve.json"
FIRST_SEASON = 2012
BUCKETS = [10, 20, 32, 48, 64, 100, 150, 262]  # pick ranges (upper bounds)
COLS = {
    "attempts": "pass_att", "completions": "pass_cmp", "passing_yards": "pass_yds", "passing_tds": "pass_td",
    "passing_interceptions": "pass_int", "passing_2pt_conversions": "pass_2pt", "carries": "rush_att",
    "rushing_yards": "rush_yds", "rushing_tds": "rush_td", "rushing_2pt_conversions": "rush_2pt",
    "targets": "targets", "receptions": "rec", "receiving_yards": "rec_yds", "receiving_tds": "rec_td",
    "receiving_2pt_conversions": "rec_2pt",
}
UA = {"User-Agent": "redraft-sim/1.0 (open-source fantasy projection pipeline)"}
_cache: dict = {}


def log(msg: str) -> None:
    print(f"[rookie_model] {msg}", flush=True)


def _csv(url: str) -> pd.DataFrame:
    if url not in _cache:
        r = requests.get(url, headers=UA, timeout=180)
        r.raise_for_status()
        _cache[url] = pd.read_csv(io.StringIO(r.text), low_memory=False)
    return _cache[url]


def rookie_seasons(first: int, last: int) -> pd.DataFrame:
    """One row per drafted QB/RB/WR/TE: draft season, pick, position, rookie-season games and stat totals."""
    dp = _csv(DRAFT_PICKS)
    dp = dp[dp["position"].isin(FANTASY_POSITIONS) & dp["season"].between(first, last)].copy()
    rows = []
    for season in range(first, last + 1):
        st = _csv(SEASON_STATS.format(season=season)).rename(columns=COLS)
        st["fum_lost"] = (st.get("rushing_fumbles_lost", 0).fillna(0) + st.get("receiving_fumbles_lost", 0).fillna(0)
                          + st.get("sack_fumbles_lost", 0).fillna(0))
        st = st.drop_duplicates("player_id").set_index("player_id")
        for r in dp[dp["season"] == season].itertuples():
            row = {"season": season, "pick": int(r.pick), "position": r.position, "gsis_id": r.gsis_id,
                   "name": r.pfr_player_name, "team": r.team, "games": 0.0}
            if isinstance(r.gsis_id, str) and r.gsis_id in st.index:
                s = st.loc[r.gsis_id]
                row["games"] = float(s.get("games", 0) or 0)
                for c in STAT_COMPONENTS:
                    row[c] = float(s.get(c, 0) or 0)
            rows.append(row)
    df = pd.DataFrame(rows)
    for c in STAT_COMPONENTS:
        df[c] = df.get(c, 0.0)
        df[c] = df[c].fillna(0.0)
    return df


def bucket(pick: float) -> int:
    for i, hi in enumerate(BUCKETS):
        if pick <= hi:
            return i
    return len(BUCKETS) - 1


def fit_curve(df: pd.DataFrame, scoring: dict) -> dict:
    """{pos: [{pick_max, n, games, pg: {component: per-game}}...]} with monotone-decreasing season points."""
    curve = {}
    df = df.assign(b=df["pick"].map(bucket))
    for pos in FANTASY_POSITIONS:
        d = df[df["position"] == pos]
        cells = []
        for b, hi in enumerate(BUCKETS):
            g = d[d["b"] == b]
            n = len(g)
            games = float(g["games"].mean()) if n else 0.0
            played = g["games"].sum()
            pg = {c: float(g[c].sum() / played) if played else 0.0 for c in STAT_COMPONENTS}
            cells.append({"pick_max": hi, "n": n, "games": games, "pg": pg})
        # Pool adjacent violators on expected season points (weights = sample size)
        blocks = [[c] for c in cells]
        def pts(block):
            n = sum(max(c["n"], 1) for c in block)
            return sum(points_per_game(c["pg"], pos, scoring) * c["games"] * max(c["n"], 1) for c in block) / n
        i = 0
        while i < len(blocks) - 1:
            if pts(blocks[i + 1]) > pts(blocks[i]) + 1e-9:
                blocks[i] = blocks[i] + blocks.pop(i + 1)
                i = max(i - 1, 0)
            else:
                i += 1
        out = []
        for block in blocks:
            n = sum(max(c["n"], 1) for c in block)
            games = sum(c["games"] * max(c["n"], 1) for c in block) / n
            pg = {k: sum(c["pg"][k] * c["games"] * max(c["n"], 1) for c in block) / max(games * n, 1e-9) for k in STAT_COMPONENTS}
            for c in block:
                out.append({"pick_max": c["pick_max"], "n": c["n"], "games": round(games, 2),
                            "pg": {k: round(v, 4) for k, v in pg.items()}})
        curve[pos] = out
    return curve


def project(curve: dict, pos: str, pick: float, grade: float = 1.0) -> tuple[dict, float]:
    """Per-game components and expected games for a rookie at `pick` (talent grade scales production)."""
    cell = next((c for c in curve[pos] if pick <= c["pick_max"]), curve[pos][-1])
    pg = {k: v * (grade if k not in ("pass_att", "pass_int", "fum_lost") else 1.0) for k, v in cell["pg"].items()}
    return pg, float(cell["games"])


def latest_complete_season() -> int:
    con = connect()
    source = int(get_meta(con, "source_season", 2025))
    max_week = con.execute("SELECT MAX(week) FROM weekly_stats WHERE season = ?", (source,)).fetchone()[0] or 0
    return source if max_week >= 18 else source - 1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--through", type=int, default=None, help="last season to learn from (default: latest complete)")
    args = ap.parse_args()
    through = args.through or latest_complete_season()
    cfg = load_config()
    df = rookie_seasons(FIRST_SEASON, through)
    curve = fit_curve(df, cfg["scoring"])
    CURVE_PATH.write_text(json.dumps({"through": through, "first": FIRST_SEASON, "curve": curve}, indent=1), encoding="utf-8")
    log(f"fit on {len(df)} drafted rookies {FIRST_SEASON}-{through} -> {CURVE_PATH.name}")
    for pos in FANTASY_POSITIONS:
        line = ", ".join(f"<={c['pick_max']}: {points_per_game(c['pg'], pos, cfg['scoring']):.1f} ppg x {c['games']:.1f} g (n={c['n']})"
                         for c in curve[pos])
        print(f"  {pos}: {line}")


if __name__ == "__main__":
    main()
