"""2027 projection + VORP engine.

Usage:
    python scripts/project_2027.py              # project from latest stats, store snapshot, export JSON
    python scripts/project_2027.py --backfill   # also build snapshots "as of" each earlier week (trend history)
    python scripts/project_2027.py --no-export  # skip writing web/data/*.json

Pipeline:
  1. Per-game usage + efficiency from 2026 (recency-weighted) blended with a 2025 prior.
  2. Efficiency regression (TD rates hardest, yards/catch rates by sample size).
  3. Age curve, Year-2/3 ascension bumps, injury-recovery flags, FA / backup-QB discounts.
  4. 2027 rookie prospects from data/rookies_2027.csv via draft-capital templates.
  5. Score with config/league_settings.json, VORP vs. replacement implied by the roster slots
     (dedicated starters + flex allocation), tiers from VORP gaps, ADP blended with market rank.
The browser re-runs step 5 (web/lib/engine.ts) when Settings toggles change.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import sys
import warnings
from datetime import date, datetime, timezone

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    CONFIG_PATH, FANTASY_POSITIONS, STAT_COMPONENTS, WEB_DATA_DIR, config_hash, connect, load_config,
    points_per_game,
)

SEASON_2027_START = date(2027, 9, 9)
RECENCY_DECAY = 0.93          # per-week decay applied to 2026 games (most recent weeks count most)
MAJOR_INJURY_KEYS = ("acl", "achilles", "lisfranc", "patellar", "mcl", "fracture", "broken", "tib", "fib", "pectoral")
SEVERE_STATUSES = {"IR", "PUP", "Out", "DNR"}

# --- 2027 rookie templates: per-game year-1 lines by position and draft-capital tier
#     tier 1 = top-10 pick, 2 = rest of round 1, 3 = round 2, 4 = round 3, 5 = day 3
ROOKIE_TEMPLATES = {
    "WR": {1: dict(targets=7.4, rec=4.8, rec_yds=62, rec_td=0.40, rush_att=0.2, rush_yds=1.5),
           2: dict(targets=6.0, rec=3.8, rec_yds=48, rec_td=0.30, rush_att=0.15, rush_yds=1.0),
           3: dict(targets=4.6, rec=2.9, rec_yds=36, rec_td=0.22),
           4: dict(targets=3.3, rec=2.0, rec_yds=25, rec_td=0.15),
           5: dict(targets=2.2, rec=1.3, rec_yds=16, rec_td=0.10)},
    "RB": {1: dict(rush_att=15, rush_yds=68, rush_td=0.50, targets=3.2, rec=2.5, rec_yds=19, rec_td=0.10, fum_lost=0.1),
           2: dict(rush_att=12, rush_yds=52, rush_td=0.38, targets=2.6, rec=2.0, rec_yds=15, rec_td=0.07, fum_lost=0.08),
           3: dict(rush_att=9, rush_yds=39, rush_td=0.28, targets=2.0, rec=1.5, rec_yds=11, rec_td=0.05, fum_lost=0.06),
           4: dict(rush_att=6, rush_yds=26, rush_td=0.18, targets=1.4, rec=1.0, rec_yds=7, rec_td=0.03, fum_lost=0.04),
           5: dict(rush_att=4, rush_yds=17, rush_td=0.10, targets=1.0, rec=0.7, rec_yds=5, rec_td=0.02, fum_lost=0.03)},
    "TE": {1: dict(targets=5.0, rec=3.4, rec_yds=36, rec_td=0.25),
           2: dict(targets=4.0, rec=2.7, rec_yds=28, rec_td=0.20),
           3: dict(targets=3.0, rec=2.0, rec_yds=20, rec_td=0.14),
           4: dict(targets=2.0, rec=1.3, rec_yds=13, rec_td=0.09),
           5: dict(targets=1.2, rec=0.8, rec_yds=8, rec_td=0.05)},
    "QB": {1: dict(pass_att=30, pass_cmp=19, pass_yds=205, pass_td=1.2, pass_int=0.8, rush_att=5, rush_yds=28, rush_td=0.2, fum_lost=0.2),
           2: dict(pass_att=30, pass_cmp=18.5, pass_yds=195, pass_td=1.1, pass_int=0.85, rush_att=4, rush_yds=20, rush_td=0.15, fum_lost=0.2),
           3: dict(pass_att=30, pass_cmp=18, pass_yds=185, pass_td=1.0, pass_int=0.9, rush_att=3.5, rush_yds=15, rush_td=0.12, fum_lost=0.2),
           4: dict(pass_att=30, pass_cmp=18, pass_yds=180, pass_td=0.9, pass_int=0.95, rush_att=3, rush_yds=12, rush_td=0.1, fum_lost=0.2),
           5: dict(pass_att=30, pass_cmp=17.5, pass_yds=175, pass_td=0.85, pass_int=1.0, rush_att=3, rush_yds=10, rush_td=0.1, fum_lost=0.2)},
}
# Expected 2027 games (QBs: probability of starting)
ROOKIE_GAMES = {"QB": {1: 13.0, 2: 8.0, 3: 3.0, 4: 1.5, 5: 0.8},
                "RB": {1: 15.5, 2: 15.0, 3: 14.5, 4: 14.0, 5: 13.0},
                "WR": {1: 15.5, 2: 15.0, 3: 14.5, 4: 14.0, 5: 13.0},
                "TE": {1: 15.5, 2: 15.0, 3: 14.5, 4: 14.0, 5: 13.0}}


def log(msg: str) -> None:
    print(f"[project_2027] {msg}", flush=True)


# =========================================================================== helpers
def age_2027(birth_date, age_now, start: date = SEASON_2027_START) -> float | None:
    """Age at the start of the target season (2027 unless a backtest passes another start date)."""
    if isinstance(birth_date, str) and len(birth_date) >= 10:
        try:
            b = date.fromisoformat(birth_date[:10])
            return round((start - b).days / 365.25, 1)
        except ValueError:
            pass
    return float(age_now) + (start - date.today()).days / 365.25 if pd.notna(age_now) else None


def age_multiplier(pos: str, age: float | None, years_exp, exp_offset: int = 2) -> tuple[float, list[str]]:
    """Age-curve + career-arc multiplier on 2027 volume. Returns (mult, reasons)."""
    m, why = 1.0, []
    if age is not None and not math.isnan(age):
        a = int(math.floor(age))
        if pos == "RB" and a >= 28:
            pen = {28: 0.06, 29: 0.12, 30: 0.20}.get(a, 0.20 + 0.08 * (a - 30))
            m *= 1 - pen; why.append(f"RB age {a}: -{pen:.0%}")
        elif pos == "WR" and a >= 30:
            pen = {30: 0.05, 31: 0.10, 32: 0.16}.get(a, 0.16 + 0.07 * (a - 32))
            m *= 1 - pen; why.append(f"WR age {a}: -{pen:.0%}")
        elif pos == "TE" and a >= 31:
            pen = 0.05 * (a - 30)
            m *= 1 - pen; why.append(f"TE age {a}: -{pen:.0%}")
        elif pos == "QB" and a >= 35:
            pen = 0.04 * (a - 34)
            m *= 1 - pen; why.append(f"QB age {a}: -{pen:.0%}")
    if pd.notna(years_exp):
        # NFL season number in the target year. Sleeper years_exp is 0 for 2026 rookies, so 2027 = +2.
        yr = int(years_exp) + exp_offset
        bump = {2: {"WR": 0.10, "TE": 0.10, "RB": 0.05, "QB": 0.06},
                3: {"WR": 0.05, "TE": 0.06, "RB": 0.02, "QB": 0.04}}.get(yr, {}).get(pos, 0.0)
        if bump:
            m *= 1 + bump; why.append(f"Year {yr} ascension: +{bump:.0%}")
    return max(m, 0.3), why


def injury_adjustment(pos: str, status, body_part, notes) -> tuple[float, float, str | None]:
    """Returns (games_mult, efficiency_mult, flag) for injuries carried into the offseason."""
    if status not in SEVERE_STATUSES:
        return 1.0, 1.0, None
    text = f"{body_part or ''} {notes or ''}".lower()
    if any(k in text for k in MAJOR_INJURY_KEYS):
        if "achilles" in text:
            eff = 0.88 if pos == "RB" else 0.92
            return 0.85, eff, f"Achilles recovery ({status})"
        if "acl" in text:
            return 0.88, 0.94 if pos == "RB" else 0.96, f"ACL recovery ({status})"
        return 0.94, 0.97, f"{(body_part or 'Major').strip()} recovery ({status})"
    if status in ("IR", "PUP"):
        return 0.97, 0.99, f"{(body_part or 'Injury').strip()} — {status}, expected back for 2027"
    return 1.0, 1.0, None


def shrink(player_num, player_den, league_rate, k):
    """Bayesian shrink of a rate (num/den) toward league_rate with k pseudo-observations."""
    return (player_num + k * league_rate) / (player_den + k)


# =========================================================================== projection
def load_espn(con, cfg, season: int, through_week: int) -> tuple[dict, dict]:
    """ESPN inputs keyed by Sleeper id.

    Returns (rest_of_season, market):
      rest_of_season[pid] = {"pg": per-game components over the next N weeks ESPN projects the player
                             to play, "weeks": N}
      market[pid]         = {"adp": ESPN ADP, "owned": roster %, "started": start %}
    """
    pcfg = cfg["projection"]
    look = int(pcfg.get("espn_lookahead_weeks", 6))
    ros: dict = {}
    wk = pd.read_sql_query(
        "SELECT * FROM espn_weekly_proj WHERE season = ? AND week > ? AND week <= ? AND player_id IS NOT NULL "
        "AND espn_points > 0", con, params=(season, through_week, min(through_week + look, 18)))
    if len(wk):
        g = wk.groupby("player_id")
        means = g[list(STAT_COMPONENTS)].mean()
        n = g.size()
        for pid, row in means.iterrows():
            ros[pid] = {"pg": {c: float(row[c]) for c in STAT_COMPONENTS}, "weeks": int(n[pid])}
    mk = pd.read_sql_query("SELECT player_id, adp, pct_owned, pct_started FROM espn_players "
                           "WHERE player_id IS NOT NULL", con).drop_duplicates("player_id")
    market = {r.player_id: {"adp": r.adp, "owned": r.pct_owned, "started": r.pct_started} for r in mk.itertuples()}
    return ros, market


def build_veteran_projections(con, cfg, season: int, through_week: int, *, ws: pd.DataFrame | None = None,
                              players: pd.DataFrame | None = None, target_start: date = SEASON_2027_START,
                              exp_offset: int = 2, live_flags: bool = True) -> pd.DataFrame:
    """Project next season from `season` stats (through `through_week`) plus the prior season.

    Backtests pass their own weekly stats (`ws`) and player table, an earlier `target_start` /
    `exp_offset`, and live_flags=False to drop inputs that only exist for the current season
    (Sleeper injury / depth chart / free-agent status and ESPN projections).
    """
    pcfg = cfg["projection"]
    if ws is None:
        ws = pd.read_sql_query(
            "SELECT * FROM weekly_stats WHERE (season = ? AND week <= ?) OR season = ?",
            con, params=(season, through_week, season - 1))
    else:
        ws = ws[((ws["season"] == season) & (ws["week"] <= through_week)) | (ws["season"] == season - 1)].copy()
    for c in STAT_COMPONENTS:
        ws[c] = ws[c].fillna(0.0)
    ws = ws[ws["position"].isin(FANTASY_POSITIONS)]

    # Team-week totals for target share / touch share
    team_wk = ws.groupby(["season", "week", "team"])[["targets", "rush_att"]].sum().rename(
        columns={"targets": "team_targets", "rush_att": "team_rush"})
    ws = ws.join(team_wk, on=["season", "week", "team"])
    decay = float(pcfg.get("recency_decay", RECENCY_DECAY))
    ws["w"] = np.where(ws["season"] == season, decay ** (through_week - ws["week"]), 1.0)

    # Drop partial games (injury exits / garbage-time cameos): opportunities < 30% of the
    # player's median that season. They count as missed games for availability instead.
    ws["opp"] = ws["pass_att"] + ws["rush_att"] + ws["targets"]
    med_opp = ws.groupby(["player_id", "season"])["opp"].transform("median")
    ws = ws[~((med_opp >= 8) & (ws["opp"] < 0.3 * med_opp))]

    cur, prv = ws[ws["season"] == season], ws[ws["season"] == season - 1]
    team_games = cur.groupby("team")["week"].nunique()

    def agg(df: pd.DataFrame, weighted: bool) -> pd.DataFrame:
        df = df.copy()
        w = df["w"] if weighted else 1.0
        cols = list(STAT_COMPONENTS) + ["team_targets", "team_rush"]
        for c in cols:
            df[c] = df[c] * w
        df["wsum"] = w
        g = df.groupby("player_id")
        out = g[cols + ["wsum"]].sum()
        out["games"] = g.size()
        out["last_team"] = g.apply(lambda d: d.sort_values("week")["team"].iloc[-1], include_groups=False)
        return out

    a26, a25 = agg(cur.dropna(subset=["player_id"]), True), agg(prv.dropna(subset=["player_id"]), False)

    if players is None:
        players = pd.read_sql_query("SELECT * FROM players WHERE is_rookie_2027 = 0", con).set_index("player_id")
    pids = players.index.intersection(a26.index.union(a25.index))
    pw = pcfg["prior_season_weight"]
    espn_ros, espn_mkt = load_espn(con, cfg, season, through_week) if live_flags else ({}, {})
    espn_w = float(pcfg.get("espn_projection_weight", 0.0))

    # League-average efficiency by position (both seasons, volume weighted)
    lg = ws.groupby("position")[list(STAT_COMPONENTS)].sum()
    lg_rate = {
        pos: dict(catch=r.rec / max(r.targets, 1), ypt=r.rec_yds / max(r.targets, 1),
                  rectd=r.rec_td / max(r.targets, 1), ypc=r.rush_yds / max(r.rush_att, 1),
                  rushtd=r.rush_td / max(r.rush_att, 1), cmp=r.pass_cmp / max(r.pass_att, 1),
                  ypa=r.pass_yds / max(r.pass_att, 1), passtd=r.pass_td / max(r.pass_att, 1),
                  int=r.pass_int / max(r.pass_att, 1))
        for pos, r in lg.iterrows()}
    td_reg = pcfg["td_regression"]

    rows = []
    for pid in pids:
        p = players.loc[pid]
        pos = p["position"]
        r26 = a26.loc[pid] if pid in a26.index else None
        r25 = a25.loc[pid] if pid in a25.index else None
        g26 = float(r26["games"]) if r26 is not None else 0.0
        g25 = float(r25["games"]) if r25 is not None else 0.0
        eff_g = g26 + pw * g25
        if eff_g < 1:
            continue

        # (a) blended per-game volume & raw totals (raw totals drive regression sample sizes)
        pg, raw = {}, {}
        for c in STAT_COMPONENTS:
            v26 = r26[c] / r26["wsum"] if r26 is not None else 0.0
            v25 = r25[c] / r25["wsum"] if r25 is not None else 0.0
            pg[c] = (g26 * v26 + pw * g25 * v25) / eff_g
            raw[c] = (r26[c] / r26["wsum"] * g26 if r26 is not None else 0.0) + (r25[c] if r25 is not None else 0.0)

        # Usage shares (2026 only, games played)
        tgt_share = touch_share = None
        if r26 is not None and r26["team_targets"] > 0:
            tgt_share = r26["targets"] / r26["team_targets"]
            touch_share = (r26["targets"] + r26["rush_att"]) / max(r26["team_targets"] + r26["team_rush"], 1)

        # (a cont.) efficiency regression toward position averages
        L = lg_rate.get(pos, lg_rate["WR"])
        n_tgt, n_car, n_att = raw["targets"], raw["rush_att"], raw["pass_att"]
        catch = shrink(raw["rec"], n_tgt, L["catch"], 40)
        ypt = shrink(raw["rec_yds"], n_tgt, L["ypt"], 60)
        rectd = (1 - td_reg) * shrink(raw["rec_td"], n_tgt, L["rectd"], 30) + td_reg * L["rectd"]
        ypc = shrink(raw["rush_yds"], n_car, L["ypc"], 80)
        rushtd = (1 - td_reg) * shrink(raw["rush_td"], n_car, L["rushtd"], 40) + td_reg * L["rushtd"]
        cmp_ = shrink(raw["pass_cmp"], n_att, L["cmp"], 150)
        ypa = shrink(raw["pass_yds"], n_att, L["ypa"], 200)
        passtd = (1 - td_reg) * shrink(raw["pass_td"], n_att, L["passtd"], 150) + td_reg * L["passtd"]
        intr = shrink(raw["pass_int"], n_att, L["int"], 300)

        # Volume (small-sample shrink) * age/career multiplier * team status
        vol_mult = eff_g / (eff_g + 0.5)
        m_age, why = age_multiplier(pos, age27 := age_2027(p["birth_date"], p["age"], target_start),
                                    p["years_exp"], exp_offset)
        flags = []
        if any("ascension" in w for w in why):
            flags.append("ascending")
        if any("age" in w for w in why):
            flags.append("age_decline")
        if live_flags and not p["team"]:
            vol_mult *= 0.85; why.append("Free agent: -15% volume"); flags.append("free_agent")
        g_mult, e_mult, inj_flag = (injury_adjustment(pos, p["injury_status"], p["injury_body_part"], p["injury_notes"])
                                    if live_flags else (1.0, 1.0, None))
        if inj_flag:
            flags.append("injury_recovery"); why.append(inj_flag)
        vm = vol_mult  # age/career multiplier is applied after the ESPN blend

        tg, ca, at = pg["targets"] * vm, pg["rush_att"] * vm, pg["pass_att"] * vm
        comp = {
            "targets": tg, "rec": tg * catch, "rec_yds": tg * ypt * e_mult, "rec_td": tg * rectd * e_mult,
            "rush_att": ca, "rush_yds": ca * ypc * e_mult, "rush_td": ca * rushtd * e_mult,
            "pass_att": at, "pass_cmp": at * cmp_, "pass_yds": at * ypa * e_mult, "pass_td": at * passtd * e_mult,
            "pass_int": at * intr, "pass_2pt": pg["pass_2pt"] * vm, "rush_2pt": pg["rush_2pt"] * vm,
            "rec_2pt": pg["rec_2pt"] * vm, "fum_lost": pg["fum_lost"] * vm,
        }

        # (a cont.) Blend in ESPN's rest-of-season weekly projections (current role / depth chart view)
        er = espn_ros.get(pid)
        if er and er["weeks"] >= 2 and espn_w > 0:
            comp = {c: (1 - espn_w) * comp[c] + espn_w * er["pg"][c] for c in comp}
            why.append(f"ESPN rest-of-season projection blended at {espn_w:.0%} ({er['weeks']} wks)")
        comp = {c: v * m_age for c, v in comp.items()}

        # Games: availability history, injury, backup-QB role, retirement risk
        tg26 = float(team_games.get(r26["last_team"], g26)) if r26 is not None else 0.0
        if g25 > 0:
            hist = (g26 + g25) / max(tg26 + 17, g26 + g25)
        else:
            hist = g26 / max(tg26, g26, 1)
        aw = float(pcfg.get("availability_weight", 0.15))
        games = pcfg["base_games"] * ((1 - aw) + aw * hist) * g_mult
        # Depth-chart demotions of injured starters reflect the injury, not the role, so skip those.
        if (live_flags and pos == "QB" and (p["depth_chart_order"] or 1) > 1 and p["depth_chart_position"] == "QB"
                and p["injury_status"] not in SEVERE_STATUSES):
            games *= 0.35; flags.append("backup_qb"); why.append("Backup QB on depth chart: ~35% of starts")
        if age27 and age27 >= 38:
            games *= 0.8; why.append("Retirement risk: -20% games")

        # 2026 actual per-game line (unweighted) for display / re-scoring in the browser
        s26 = {c: round(float(cur.loc[cur["player_id"] == pid, c].sum()) / g26, 3) if g26 else 0.0
               for c in STAT_COMPONENTS}

        rows.append({
            "player_id": pid, "name": p["name"], "position": pos, "team": p["team"] or "FA",
            "age_2027": age27, "years_exp": None if pd.isna(p["years_exp"]) else int(p["years_exp"]),
            "college": p["college"], "headshot_url": p["headshot_url"], "is_rookie": False,
            "injury_status": p["injury_status"], "injury_body_part": p["injury_body_part"],
            "games_2026": int(g26), "games_2025": int(g25),
            "target_share_2026": None if tgt_share is None else round(float(tgt_share), 4),
            "touch_share_2026": None if touch_share is None else round(float(touch_share), 4),
            "stats_2026": s26, "proj_games": round(float(games), 2),
            "proj": {k: round(float(v), 4) for k, v in comp.items()},
            "search_rank": None if pd.isna(p["search_rank"]) else int(p["search_rank"]),
            "adp_override": None, "draft_capital_tier": None, "flags": flags, "notes": why,
            "espn_adp": (espn_mkt.get(pid) or {}).get("adp"),
            "espn_owned": (espn_mkt.get(pid) or {}).get("owned"),
            "espn_ros": {k: round(v, 4) for k, v in er["pg"].items()} if er else None,
        })
    return pd.DataFrame(rows)


def build_rookie_projections(con) -> pd.DataFrame:
    rk = pd.read_sql_query("SELECT * FROM rookies", con)
    rows = []
    for _, r in rk.iterrows():
        pos, tier = r["position"], int(min(max(r["draft_capital_tier"], 1), 5))
        tpl = ROOKIE_TEMPLATES[pos][tier]
        grade = float(r["talent_grade"] or 1.0)
        comp = {c: 0.0 for c in STAT_COMPONENTS}
        for k, v in tpl.items():
            # talent grade scales volume and efficiency (counting stats)
            comp[k] = v * (grade if k not in ("pass_att", "pass_int", "fum_lost") else 1.0)
        notes = [f"2027 rookie — draft capital tier {tier} (proj. pick {r['projected_pick'] or '?'})"]
        if grade != 1.0:
            notes.append(f"Talent grade x{grade:.2f}")
        rows.append({
            "player_id": r["player_id"], "name": r["name"], "position": pos,
            "team": r["landing_team"] or "R27", "age_2027": r["age_2027"], "years_exp": -1,
            "college": r["college"], "headshot_url": None, "is_rookie": True,
            "injury_status": None, "injury_body_part": None, "games_2026": 0, "games_2025": 0,
            "target_share_2026": None, "touch_share_2026": None,
            "stats_2026": {c: 0.0 for c in STAT_COMPONENTS},
            "proj_games": ROOKIE_GAMES[pos][tier] * (0.97 if not r["landing_team"] else 1.0),
            "proj": {k: round(v, 4) for k, v in comp.items()}, "search_rank": None,
            "espn_adp": None, "espn_owned": None, "espn_ros": None,
            "adp_override": None if pd.isna(r["adp_override"]) else float(r["adp_override"]),
            "draft_capital_tier": tier, "flags": ["rookie"], "notes": notes,
        })
    return pd.DataFrame(rows)


# =========================================================================== scoring / VORP
def replacement_levels(df: pd.DataFrame, cfg: dict) -> dict:
    """Replacement points per position implied by the roster config (dedicated starters + flex)."""
    teams, roster = cfg["teams"], cfg["roster"]
    starters = {pos: teams * int(roster.get(pos, 0)) for pos in FANTASY_POSITIONS}
    pools = {pos: df[df["position"] == pos].sort_values("proj_points", ascending=False) for pos in FANTASY_POSITIONS}
    flex_slots = teams * int(roster.get("FLEX", 0))
    if flex_slots:
        cands = pd.concat([pools[p].iloc[starters[p]:] for p in cfg["flex_eligible"]])
        top = cands.sort_values("proj_points", ascending=False).head(flex_slots)
        for p, n in top["position"].value_counts().items():
            starters[p] += int(n)
    repl = {}
    for pos, pool in pools.items():
        pts = pool["proj_points"].to_numpy()
        n = starters[pos]
        window = pts[n:n + 3] if len(pts) > n else pts[-1:]
        repl[pos] = float(window.mean()) if len(window) else 0.0
    return {"points": repl, "starters": starters}


def assign_tiers(vorps: np.ndarray, factor: float = 2.5, min_size: int = 5, max_size: int = 20) -> list[int]:
    tiers, tier, size = [], 1, 0
    gaps = np.abs(np.diff(vorps, prepend=vorps[0]))
    for i in range(len(vorps)):
        if i > 0:
            lo, hi = max(1, i - 12), min(len(vorps), i + 12)
            med = float(np.median(gaps[lo:hi])) or 0.1
            if (gaps[i] > factor * med and size >= min_size) or size >= max_size:
                tier += 1; size = 0
        tiers.append(tier); size += 1
    return tiers


def score_board(df: pd.DataFrame, cfg: dict) -> tuple[pd.DataFrame, dict]:
    df = df.copy()
    sc = cfg["scoring"]
    df["proj_ppg"] = [points_per_game(c, pos, sc) for c, pos in zip(df["proj"], df["position"])]
    df["ppg_2026"] = [points_per_game(c, pos, sc) for c, pos in zip(df["stats_2026"], df["position"])]
    df["proj_points"] = df["proj_ppg"] * df["proj_games"]
    rl = replacement_levels(df, cfg)
    df["vorp"] = df["proj_points"] - df["position"].map(rl["points"])
    df = df.sort_values(["vorp", "proj_points"], ascending=False).reset_index(drop=True)
    df["overall_rank"] = np.arange(1, len(df) + 1)
    df["pos_rank"] = df.groupby("position").cumcount() + 1

    # ADP: model rank blended with the market where available; manual overrides win.
    # Market = ESPN ADP when the ESPN pull succeeded, otherwise Sleeper's search_rank.
    w = cfg["projection"]["market_adp_weight"]
    espn_adp = pd.to_numeric(df["espn_adp"], errors="coerce")
    if cfg["projection"].get("market_source", "espn") == "espn" and espn_adp.notna().sum() >= 100:
        mkt = espn_adp
        rl["market_source"] = "espn"
    else:
        sr = pd.to_numeric(df["search_rank"], errors="coerce")
        mkt = sr.where(sr < 1e6)
        rl["market_source"] = "sleeper"
    df["market_rank"] = mkt.rank(method="first")
    blend = np.where(df["market_rank"].notna(), (1 - w) * df["overall_rank"] + w * df["market_rank"], df["overall_rank"])
    df["adp"] = np.where(df["adp_override"].notna(), df["adp_override"], blend)
    df["adp"] = df["adp"].rank(method="first")  # express as expected pick number

    n = cfg["projection"]["board_size"]
    df["tier"] = assign_tiers(df["vorp"].to_numpy()[: max(n, len(df))])
    return df, rl


# =========================================================================== snapshots
def store_snapshot(con, df: pd.DataFrame, cfg: dict, season: int, week: int, backfill: bool) -> int:
    h = config_hash(cfg)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    con.execute("DELETE FROM snapshots WHERE season=? AND through_week=? AND config_hash=?", (season, week, h))
    cur = con.execute(
        "INSERT INTO snapshots (season, through_week, snapshot_date, config_hash, is_backfill, created_at) "
        "VALUES (?,?,?,?,?,?)", (season, week, date.today().isoformat(), h, int(backfill), now))
    sid = cur.lastrowid
    con.executemany(
        "INSERT INTO projections VALUES (?,?,?,?,?,?,?,?,?,?)",
        [(sid, r.player_id, int(r.overall_rank), int(r.pos_rank), float(r.adp), int(r.tier),
          round(float(r.proj_ppg), 3), float(r.proj_games), round(float(r.proj_points), 2), round(float(r.vorp), 2))
         for r in df.itertuples()])
    return sid


def history(con, cfg: dict, season: int) -> pd.DataFrame:
    return pd.read_sql_query(
        """SELECT s.through_week AS week, p.player_id, p.overall_rank, p.adp, p.proj_ppg, p.vorp
           FROM projections p JOIN snapshots s USING (snapshot_id)
           WHERE s.season = ? AND s.config_hash = ? ORDER BY s.through_week""",
        con, params=(season, config_hash(cfg)))


def run_week(con, cfg, season, week, backfill=False) -> tuple[pd.DataFrame, dict]:
    vets = build_veteran_projections(con, cfg, season, week)
    rookies = build_rookie_projections(con)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", FutureWarning)
        pool = pd.concat([vets, rookies], ignore_index=True)
    board, rl = score_board(pool, cfg)
    store_snapshot(con, board.head(cfg["projection"]["export_pool_size"]), cfg, season, week, backfill)
    return board, rl


# =========================================================================== export
def clean_json(o):
    """Convert numpy scalars / NaN to JSON-safe Python values (NaN -> null)."""
    if isinstance(o, dict):
        return {str(k): clean_json(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean_json(v) for v in o]
    if isinstance(o, np.generic):
        o = o.item()
    if isinstance(o, float) and (math.isnan(o) or math.isinf(o)):
        return None
    return o


def export(con, board: pd.DataFrame, rl: dict, cfg: dict, season: int, week: int) -> None:
    # Publication switches: turn these off before charging money. NFL headshots are copyrighted, and
    # ESPN's terms restrict commercial reuse of its data (the model can still use ESPN internally).
    pub = {"show_headshots": True, "show_espn_fields": True, **cfg.get("publication", {})}
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    pool = board.head(cfg["projection"]["export_pool_size"]).copy()
    hist = history(con, cfg, season)
    weeks = sorted(hist["week"].unique().tolist())
    prev_week = max([w for w in weeks if w < week], default=None)
    prev = hist[hist["week"] == prev_week].set_index("player_id") if prev_week else pd.DataFrame()

    def delta(pid, col, cur_val):
        if prev.empty or pid not in prev.index:
            return None
        return int(round(prev.at[pid, col] - cur_val))  # positive = moved up the board

    players = []
    for r in pool.itertuples():
        players.append({
            "id": r.player_id, "name": r.name, "pos": r.position, "team": r.team,
            "age": None if pd.isna(r.age_2027) else float(r.age_2027), "yearsExp": r.years_exp,
            "college": r.college, "headshot": r.headshot_url if pub["show_headshots"] else None, "rookie": bool(r.is_rookie),
            "draftTier": r.draft_capital_tier, "injury": r.injury_status, "injuryPart": r.injury_body_part,
            "flags": r.flags, "notes": r.notes,
            "g26": r.games_2026, "g25": r.games_2025, "tgtShare": r.target_share_2026,
            "touchShare": r.touch_share_2026, "s26": r.stats_2026,
            "projGames": r.proj_games, "proj": r.proj,
            "marketRank": None if pd.isna(r.market_rank) else int(r.market_rank),
            "espnAdp": None if pd.isna(r.espn_adp) or not pub["show_espn_fields"] else round(float(r.espn_adp), 1),
            "espnOwned": None if pd.isna(r.espn_owned) or not pub["show_espn_fields"] else round(float(r.espn_owned), 1),
            "espnRos": r.espn_ros if isinstance(r.espn_ros, dict) and pub["show_espn_fields"] else None,
            "adpOverride": r.adp_override,
            # default-settings outputs (browser recomputes these for toggled settings)
            "rank": int(r.overall_rank), "posRank": int(r.pos_rank), "adp": float(r.adp), "tier": int(r.tier),
            "ppg": round(float(r.proj_ppg), 2), "ppg26": round(float(r.ppg_2026), 2),
            "points": round(float(r.proj_points), 1), "vorp": round(float(r.vorp), 1),
            "rankDelta": delta(r.player_id, "overall_rank", r.overall_rank),
            "adpDelta": delta(r.player_id, "adp", r.adp),
        })

    # Trend history: ADP / rank per snapshot week for every exported player
    ids = set(pool["player_id"])
    h = hist[hist["player_id"].isin(ids)]
    trend = {pid: {"adp": [None] * len(weeks), "rank": [None] * len(weeks), "ppg": [None] * len(weeks)}
             for pid in ids}
    widx = {w: i for i, w in enumerate(weeks)}
    for r in h.itertuples():
        t = trend[r.player_id]
        i = widx[r.week]
        t["adp"][i], t["rank"][i], t["ppg"][i] = float(r.adp), int(r.overall_rank), round(float(r.proj_ppg), 2)

    last_run = con.execute("SELECT run_at, notes FROM ingest_runs ORDER BY run_id DESC LIMIT 1").fetchone()
    meta = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sourceSeason": season, "throughWeek": week, "previousWeek": prev_week,
        "targetSeason": cfg["target_season"], "lastIngest": last_run[0] if last_run else None,
        "ingestNotes": last_run[1] if last_run else None, "replacement": {"points": rl["points"], "starters": rl["starters"]},
        "marketSource": rl.get("market_source", "sleeper"),
        "publication": pub,
        "poolSize": len(players), "configHash": config_hash(cfg),
    }
    def write(name: str, obj) -> None:
        (WEB_DATA_DIR / name).write_text(json.dumps(clean_json(obj), separators=(",", ":"), allow_nan=False),
                                         encoding="utf-8")

    write("board.json", {"meta": meta, "players": players})
    write("trends.json", {"weeks": weeks, "players": trend})
    shutil.copy(CONFIG_PATH, WEB_DATA_DIR / "league_settings.json")
    log(f"exported {len(players)} players, {len(weeks)} trend weeks -> {WEB_DATA_DIR}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="rebuild snapshots as of each earlier week")
    ap.add_argument("--backfill-from", type=int, default=3)
    ap.add_argument("--no-export", action="store_true")
    args = ap.parse_args()

    cfg = load_config()
    season = int(cfg["source_season"])
    con = connect()
    week = con.execute("SELECT MAX(week) FROM weekly_stats WHERE season = ?", (season,)).fetchone()[0]
    if not week:
        raise SystemExit("No current-season stats in the database; run scripts/update_data.py first.")

    if args.backfill:
        for wk in range(args.backfill_from, week):
            run_week(con, cfg, season, wk, backfill=True)
            log(f"backfilled snapshot through week {wk}")
    board, rl = run_week(con, cfg, season, week)
    con.commit()

    top = board.head(24)[["overall_rank", "name", "position", "team", "proj_ppg", "vorp", "adp", "tier"]]
    log(f"snapshot through {season} week {week}; replacement pts {({k: round(v, 1) for k, v in rl['points'].items()})}")
    print(top.to_string(index=False))
    print("positions in top 36:", board.head(36)["position"].value_counts().to_dict())
    if not args.no_export:
        export(con, board, rl, cfg, season, week)
    con.close()


if __name__ == "__main__":
    main()
