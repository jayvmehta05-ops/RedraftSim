"""Out-of-sample accuracy backtest.

For each target season T (default 2024 and 2025), project T using only regular-season data from T-1 and
T-2 (the same engine as the live 2027 board, minus inputs that only exist for the current season),
then score the projection against what actually happened in T, side by side with:

  * ESPN's preseason projections for T (season-total projected stats, re-scored with our settings)
  * ESPN's preseason PPR rankings for T (rank only)
  * Naive baseline: "same points as last year"

Evaluation pool: veterans ESPN ranked in its preseason PPR top 200 for T (the players managers actually
draft). Rookies are excluded because the veteran model needs at least one NFL season of data.

Usage:
    python scripts/backtest.py                 # 2024 + 2025, writes data/backtest.json + web/data/backtest.json
    python scripts/backtest.py --targets 2025
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timezone

import numpy as np
import pandas as pd
import requests

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    DATA_DIR, FANTASY_POSITIONS, STAT_COMPONENTS, WEB_DATA_DIR, connect, get_meta, load_config, merge_name,
    points_per_game, season_start,
)
from project_2027 import build_veteran_projections, clean_json, replacement_levels  # noqa: E402
from update_data import (  # noqa: E402
    ESPN_PLAYERS, ESPN_POS, ESPN_STAT_IDS, HEADERS, ID_MAP_URL, SLEEPER, attach_player_ids,
    fetch_nflverse_weekly, get_csv, get_json,
)

POOL_SIZE = 200
TOP_N = {"QB": 12, "RB": 24, "WR": 24, "TE": 12}
# Sleeper's years_exp counts from its current season; needed to turn it into "season number" in past years.
SLEEPER_SEASON = int(get_meta(connect(), "sleeper_season", 2026))


def log(msg: str) -> None:
    print(f"[backtest] {msg}", flush=True)


# --------------------------------------------------------------------------- inputs
def all_players() -> tuple[pd.DataFrame, dict]:
    """Every QB/RB/WR/TE Sleeper knows about (retired players included) + ESPN->Sleeper id map."""
    raw = get_json(f"{SLEEPER}/players/nfl")
    rows = []
    for pid, p in raw.items():
        if p.get("position") not in FANTASY_POSITIONS:
            continue
        name = p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
        rows.append({
            "player_id": str(pid), "gsis_id": (p.get("gsis_id") or "").strip() or None, "name": name,
            "merge_name": merge_name(name), "position": p["position"], "team": p.get("team"),
            "age": p.get("age"), "birth_date": p.get("birth_date"), "years_exp": p.get("years_exp"),
            "college": p.get("college"), "headshot_url": None, "injury_status": None, "injury_body_part": None,
            "injury_notes": None, "depth_chart_order": None, "depth_chart_position": None, "search_rank": None,
        })
    df = pd.DataFrame(rows)
    ids = get_csv(ID_MAP_URL)
    norm = lambda s: s.astype(str).str.replace(r"\.0$", "", regex=True)  # noqa: E731
    g = ids[["sleeper_id", "gsis_id"]].dropna()
    df["gsis_id"] = df["gsis_id"].fillna(df["player_id"].map(dict(zip(norm(g["sleeper_id"]), g["gsis_id"]))))
    e = ids[["espn_id", "sleeper_id"]].dropna()
    return df, dict(zip(norm(e["espn_id"]), norm(e["sleeper_id"])))


def espn_preseason(season: int, players: pd.DataFrame, espn_to_sleeper: dict) -> pd.DataFrame:
    filt = {"players": {"limit": 1500, "filterSlotIds": {"value": [0, 2, 4, 6]},
                        "sortPercOwned": {"sortPriority": 1, "sortAsc": False}}}
    r = requests.get(ESPN_PLAYERS.format(season=season), timeout=180,
                     headers={**HEADERS, "X-Fantasy-Filter": json.dumps(filt)})
    r.raise_for_status()
    known = set(players["player_id"])
    by_name = players.assign(k=players["merge_name"] + "|" + players["position"]) \
        .drop_duplicates("k", keep=False).set_index("k")["player_id"]
    rows = []
    for e in r.json().get("players", []):
        p = e.get("player") or {}
        pos = ESPN_POS.get(p.get("defaultPositionId"))
        if not pos:
            continue
        sid = espn_to_sleeper.get(str(p["id"]))
        if sid not in known:
            sid = by_name.get(merge_name(p.get("fullName", "")) + "|" + pos)
        proj = [s for s in p.get("stats") or [] if s.get("seasonId") == season
                and s.get("statSourceId") == 1 and s.get("statSplitTypeId") == 0]
        rank = ((p.get("draftRanksByRankType") or {}).get("PPR") or {}).get("rank")
        comp = None
        if proj:
            st = proj[0].get("stats") or {}
            comp = {c: float(st.get(k, 0) or 0) for k, c in ESPN_STAT_IDS.items()}
            if not any(comp.values()):  # ESPN's archive has empty projection lines for some seasons (e.g. 2023)
                comp = None
        rows.append({"player_id": sid, "espn_name": p.get("fullName"), "position": pos,
                     "espn_rank": rank, "espn_comp": comp})
    df = pd.DataFrame(rows).dropna(subset=["player_id"]).drop_duplicates("player_id")
    log(f"ESPN {season}: {len(df)} players, {df['espn_comp'].notna().sum()} with preseason projections, "
        f"{df['espn_rank'].notna().sum()} with PPR ranks")
    return df


WEEKLY_ROSTER = "https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{season}.csv"
ON_TEAM = {"ACT", "RES", "INA", "DEV", "EXE"}


def week1_roster(season: int, players: pd.DataFrame) -> dict:
    """player_id -> (team, status) as of Week 1 of `season`: what was knowable before the season started
    (signings, trades, cuts, retirements, players opening on IR/PUP)."""
    r = get_csv(WEEKLY_ROSTER.format(season=season))
    r = r[(r["week"] == r["week"].min()) & (r["position"].isin(FANTASY_POSITIONS)) & (r["status"].isin(ON_TEAM))]
    by_gsis = players.dropna(subset=["gsis_id"]).drop_duplicates("gsis_id").set_index("gsis_id")["player_id"]
    sid = r["sleeper_id"].astype("string").str.replace(r"\.0$", "", regex=True)
    sid = sid.where(sid.isin(set(players["player_id"])), r["gsis_id"].map(by_gsis))
    out = {}
    for pid, team, status in zip(sid, r["team"], r["status"]):
        if isinstance(pid, str) and pid:
            out[pid] = (team, status)
    log(f"Week 1 {season} rosters: {len(out)} QB/RB/WR/TE mapped")
    return out


def season_totals(ws: pd.DataFrame, season: int, scoring: dict) -> pd.DataFrame:
    s = ws[ws["season"] == season].dropna(subset=["player_id"])
    g = s.groupby("player_id")
    tot = g[list(STAT_COMPONENTS)].sum()
    tot["games"] = g.size()
    pos = g["position"].first()
    tot["points"] = [points_per_game(r, pos[pid], scoring) for pid, r in tot[list(STAT_COMPONENTS)].iterrows()]
    tot["position"] = pos
    return tot


# --------------------------------------------------------------------------- metrics
def spearman(a: pd.Series, b: pd.Series) -> float:
    return float(a.rank().corr(b.rank()))


def hit_rate(df: pd.DataFrame, col: str, ascending: bool) -> dict:
    """Share of each method's positional top-N that actually finished top-N (within the pool)."""
    out = {}
    for pos, n in TOP_N.items():
        d = df[df["position"] == pos]
        if len(d) < n:
            continue
        picked = set(d.sort_values(col, ascending=ascending).head(n).index)
        actual = set(d.sort_values("actual_points", ascending=False).head(n).index)
        out[pos] = round(len(picked & actual) / n, 3)
    return out


def vorp(df: pd.DataFrame, col: str, cfg: dict) -> pd.Series:
    tmp = pd.DataFrame({"position": df["position"], "proj_points": df[col]})
    rl = replacement_levels(tmp, cfg)
    return df[col] - df["position"].map(rl["points"])


def evaluate(df: pd.DataFrame, cfg: dict) -> dict:
    df = df.copy()
    df["actual_vorp"] = vorp(df, "actual_points", cfg)
    methods = {"model": "model_points", "espn": "espn_points", "naive": "naive_points"}
    res: dict = {}
    for m, col in methods.items():
        d = df.dropna(subset=[col])
        res[m] = {
            "n": int(len(d)),
            "spearman_points": round(spearman(d[col], d["actual_points"]), 3),
            "mae_points": round(float((d[col] - d["actual_points"]).abs().mean()), 1),
            "spearman_vorp": round(spearman(vorp(d, col, cfg), d["actual_vorp"]), 3),
            "spearman_by_pos": {p: round(spearman(g[col], g["actual_points"]), 3)
                                for p, g in d.groupby("position") if len(g) >= 8},
            "top_n_hit_rate": hit_rate(d, col, ascending=False),
        }
    d = df.dropna(subset=["espn_rank"])
    res["espn_rank"] = {
        "n": int(len(d)),
        "spearman_points": round(spearman(-d["espn_rank"], d["actual_points"]), 3),
        "mae_points": None,
        "spearman_vorp": round(spearman(-d["espn_rank"], d["actual_vorp"]), 3),
        "spearman_by_pos": {p: round(spearman(-g["espn_rank"], g["actual_points"]), 3)
                            for p, g in d.groupby("position") if len(g) >= 8},
        "top_n_hit_rate": hit_rate(d, "espn_rank", ascending=True),
    }
    return res


def biggest_misses(df: pd.DataFrame, n: int = 8) -> dict:
    d = df.dropna(subset=["model_points"]).assign(err=lambda x: x["actual_points"] - x["model_points"])
    cols = ["name", "position", "model_points", "espn_points", "actual_points", "actual_games"]
    fmt = lambda x: [{k: (round(v, 1) if isinstance(v, float) else v) for k, v in r.items()}  # noqa: E731
                     for r in x[cols].to_dict("records")]
    return {"beat_projection": fmt(d.nlargest(n, "err")), "missed_projection": fmt(d.nsmallest(n, "err"))}


# --------------------------------------------------------------------------- main
def run_target(target: int, cfg: dict, players: pd.DataFrame, espn_to_sleeper: dict, weekly: dict,
               rosters: dict | None = None) -> dict:
    sc = cfg["scoring"]
    ws = pd.concat([weekly[target - 2], weekly[target - 1], weekly[target]], ignore_index=True)
    last_week = int(ws.loc[ws["season"] == target - 1, "week"].max())
    pl = players.set_index("player_id")

    proj = build_veteran_projections(
        None, cfg, target - 1, last_week, ws=ws[ws["season"] < target], players=pl,
        target_start=season_start(target), exp_offset=1 + target - SLEEPER_SEASON, live_flags=False,
        next_roster=(rosters or {}).get(target))
    proj["model_points"] = [points_per_game(c, p, sc) * g for c, p, g in
                            zip(proj["proj"], proj["position"], proj["proj_games"])]
    proj = proj.set_index("player_id")

    actual = season_totals(ws, target, sc)
    last = season_totals(ws, target - 1, sc)
    espn = espn_preseason(target, players, espn_to_sleeper).set_index("player_id")
    espn["espn_points"] = [points_per_game(c, p, sc) if isinstance(c, dict) else np.nan
                           for c, p in zip(espn["espn_comp"], espn["position"])]

    # Pool: ESPN preseason PPR top 200 veterans (at least one prior NFL season in the data)
    pool = espn[espn["espn_rank"].notna()].nsmallest(POOL_SIZE, "espn_rank")
    rookies = [pid for pid in pool.index if pid not in last.index and pid not in proj.index]
    pool = pool.drop(index=rookies)
    df = pd.DataFrame(index=pool.index)
    df["name"] = pl["name"].reindex(df.index).fillna(pool["espn_name"])
    df["position"] = pool["position"]
    df["espn_rank"] = pool["espn_rank"]
    df["espn_points"] = pool["espn_points"]
    df["model_points"] = proj["model_points"].reindex(df.index)
    df["naive_points"] = last["points"].reindex(df.index).fillna(0.0)
    df["actual_points"] = actual["points"].reindex(df.index).fillna(0.0)
    df["actual_games"] = actual["games"].reindex(df.index).fillna(0).astype(int)
    missing_model = int(df["model_points"].isna().sum())
    df["model_points"] = df["model_points"].fillna(0.0)  # no usable history -> projected as a non-factor

    res = evaluate(df, cfg)
    log(f"{target}: pool {len(df)} veterans ({len(rookies)} rookies excluded, {missing_model} without model history)")
    return {"target": target, "data_seasons": [target - 2, target - 1], "pool": len(df),
            "rookies_excluded": len(rookies), "metrics": res, "misses": biggest_misses(df)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", type=int, nargs="+", default=[2024, 2025])
    args = ap.parse_args()
    cfg = load_config()
    players, espn_to_sleeper = all_players()
    seasons = sorted({s for t in args.targets for s in (t - 2, t - 1, t)})
    weekly = {}
    for s in seasons:
        w = attach_player_ids(fetch_nflverse_weekly(s).drop(columns=["headshot_url"]), players)
        weekly[s] = w
        log(f"nflverse {s}: {len(w)} rows, {w['player_id'].notna().mean():.1%} mapped")

    rosters = {t: week1_roster(t, players) for t in args.targets}
    results = [run_target(t, cfg, players, espn_to_sleeper, weekly, rosters) for t in args.targets]
    out = {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "poolDefinition": f"ESPN preseason PPR top {POOL_SIZE}, veterans only",
           "scoring": "league_settings.json defaults", "results": results}
    for path in (DATA_DIR / "backtest.json", WEB_DATA_DIR / "backtest.json"):
        path.write_text(json.dumps(clean_json(out), indent=1, allow_nan=False), encoding="utf-8")

    for r in results:
        print(f"\n=== {r['target']} (pool {r['pool']}) ===")
        print(f"{'method':<10}{'rank corr':>10}{'VORP corr':>10}{'MAE pts':>9}   top-N hit rate")
        for m in ("model", "espn", "espn_rank", "naive"):
            x = r["metrics"][m]
            print(f"{m:<10}{x['spearman_points']:>10}{x['spearman_vorp']:>10}{str(x['mae_points']):>9}   "
                  f"{x['top_n_hit_rate']}")
        print("by position (rank corr):", {m: r["metrics"][m]["spearman_by_pos"] for m in ("model", "espn")})


if __name__ == "__main__":
    main()
