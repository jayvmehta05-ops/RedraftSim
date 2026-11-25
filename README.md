# 2027 Fantasy Football Redraft Projections & Mock Draft Simulator

Self-updating 2027 redraft board for a **12-team, 1QB, Full PPR** league with the league rules in a config file. A Python
pipeline pulls live 2026 NFL data every week, projects 2027 production, calculates VORP for your roster settings and
exports a static JSON layer. A Next.js app (Big Board, Mock Draft Room, Weekly Trends) reads that JSON and deploys
cleanly to Vercel.

```
config/league_settings.json      League rules: teams, roster slots, scoring, projection knobs
data/rookies_2027.csv            Editable 2027 prospect board (draft-capital tiers, talent grades, overrides)
data/fantasy_2027.db             SQLite: players, weekly_stats, espn_players, espn_weekly_proj, espn_market_history,
                                 rookies, ingest_runs, snapshots, projections
scripts/common.py                Paths, schema, name matching, scoring
scripts/update_data.py           Weekly ingestion (Sleeper + nflverse + ID crosswalk + rookies)
scripts/project_2027.py          2027 projection + VORP engine, weekly snapshots, JSON export
web/                             Next.js 16 App Router + Tailwind v4 front end
web/data/*.json                  Exported data layer (board.json, trends.json, league_settings.json)
.github/workflows/weekly_update.yml   Tuesday 11:00 UTC refresh + commit
```

## Quick start

```bash
pip install -r requirements.txt
python scripts/update_data.py            # pull Sleeper players/injuries/depth charts + nflverse weekly stats
python scripts/project_2027.py --backfill  # project 2027, build week-by-week trend history, export web/data
cd web && npm install && npm run dev       # http://localhost:3000
```

## Data sources (free, no API keys)

| Source | Used for |
| --- | --- |
| `api.sleeper.app/v1/players/nfl` | Player metadata, age, team, injury status/body part, depth chart, market rank (`search_rank`) |
| `api.sleeper.app/v1/state/nfl` | Current NFL week |
| `api.sleeper.app/v1/stats/nfl/regular/{season}/{week}` | Fallback for completed weeks nflverse hasn't published yet |
| nflverse `stats_player_week_{season}.csv` | 2026 weekly box scores (and 2025 as a prior) |
| ESPN fantasy API `lm-api-reads.fantasy.espn.com/.../leaguedefaults/3?view=kona_player_info` | ESPN ADP, % rostered/started, injury status, weekly projections (public but unofficial; a failed pull keeps last week's ESPN data and falls back to Sleeper's market rank) |
| DynastyProcess `db_playerids.csv` | Sleeper ↔ GSIS ↔ ESPN id crosswalk (then name + position fallback) |

`nfl_data_py` is deprecated upstream, so the pipeline reads the same nflverse release files directly with pandas.

## Projection model (`scripts/project_2027.py`)

1. **Usage and efficiency.** Per-game volume from 2026, recency-weighted (×0.93 per week back), blended with 2025 at 0.4 weight per game.
   Partial games (injury exits) are dropped. Efficiency is regressed toward position averages: catch rate, yards per target/carry/attempt
   by sample size, and TD rates 50% toward league average (`td_regression`).
   ESPN's weekly projections for the next `espn_lookahead_weeks` (6) weeks the player is projected to play are then blended
   in at `espn_projection_weight` (30%), so role and depth-chart changes ESPN already sees show up before the box scores catch up.
   Players ESPN projects for 0 points (IR, inactive) keep the model-only line.
2. **Age curve.** RBs lose 6/12/20% at ages 28/29/30 (+8%/yr after that), WRs lose 5/10/16% at 30/31/32, TEs lose 5%/yr from 31, QBs lose 4%/yr from 35.
   Year-2 players get +10% (WR/TE), +6% (QB), +5% (RB); Year-3 players get a smaller bump.
3. **Injuries.** IR/PUP/Out players with ACL, Achilles, Lisfranc, fractures and similar lose projected games plus a little efficiency. Minor IR stints get a small games haircut.
4. **Role.** Free agents lose 15% of volume. Healthy backup QBs on the depth chart get about 35% of starts. QBs 38+ lose 20% of games for retirement risk.
5. **Rookies.** `rookies_2027.csv` rows map to per-game templates by position × draft-capital tier (1 = top-10 pick … 5 = Day 3), scaled by `talent_grade`.
   `adp_override` pins a rookie's ADP if you want to.
6. **VORP.** Season points minus the replacement level, which is the average of the 3 players just after the last projected starter at each
   position. Starters = slots × teams, plus FLEX spots given to the best remaining RB/WR/TE. Tiers come from gaps in VORP.
   ADP = 80% model rank + 20% market rank, expressed as an expected pick number. The market is ESPN ADP
   (`market_source: "espn"`), or Sleeper's `search_rank` if the ESPN pull failed. ESPN freezes its ADP once the season starts, so
   in-season it reflects 2026 preseason drafts. Each pull is also saved to `espn_market_history` for future ESPN ADP trends.

Each run stores a snapshot (`snapshots` + `projections` tables) keyed by week and a hash of the league settings. The Big Board's
`Wk Δ` and the Trends tab come from these snapshots.

> **Backfill caveat:** `--backfill` rebuilds earlier weeks from the stats available at that time, but it uses the *current* Sleeper
> injury/depth-chart data and ESPN ADP, and ESPN weekly projections as they stand now. Only snapshots from the weekly runs themselves are true point-in-time records.

## League settings

Edit `config/league_settings.json` to change the defaults (teams, roster, scoring, rounds). In the app, the **Settings** drawer
toggles **1/2 FLEX**, **Full/Half PPR**, **4/6-pt passing TDs** and **TE Premium +0.5**. VORP, tiers, ADP and rankings are recalculated in the
browser (`web/lib/engine.ts` mirrors the Python scoring step).

The defaults are imported from the ESPN league "In The Pit" (2026 settings): 12 teams, 1 QB / 2 RB / 2 WR / 1 TE / 1 FLEX / 1 K /
1 D/ST, 7 bench, full PPR, 4-pt passing TDs, 16-round snake draft. Kickers and defenses aren't projected: the mock draft simulates
the 14 skill-position rounds and reserves rounds 15–16 for K and D/ST. Bench size and K/D/ST slots don't affect VORP, so changing
them keeps the weekly trend history.

## Mock draft bots (`web/lib/draft.ts`)

Each bot scores the top 24 available players (by active-settings ADP) on:

- **ADP value:** how far a player has fallen past his ADP.
- **VORP edge** over the other candidates.
- **Roster need,** derived from the active roster config: open starter and FLEX slots, the 1QB cap, a TE cap, and forced lineup fills near the end.
- **Positional-run contagion.**
- **Personality:** Zero-RB, Hero-RB, Early-QB, TE Truther, Rookie Fever, Vet Vince, Run-Chaser, VORP Valerie, Chaos Carl and others, each with its own randomness.

After the draft, every team is graded on projected starter points.

## Weekly automation

`.github/workflows/weekly_update.yml` runs every **Tuesday at 11:00 UTC** (and on manual dispatch, with an optional backfill). It ingests data,
projects, checks that the site still builds, then commits `data/fantasy_2027.db` and `web/data/`. Vercel redeploys on that commit.
Optional: set a repository variable `ROOKIE_SOURCE_URL` to a CSV (same columns as `rookies_2027.csv`) to merge outside prospect updates.
Your local edits always win.

## Deploying to Vercel

Import the repo and leave **Root Directory empty** (the repo root). Vercel reads the root `vercel.json`, which declares one
Services entry, `web` (the Next.js app in `web/`), serving every path. Setting Root Directory to `web` makes Vercel look for
`web/vercel.json` instead and fail with "no services are declared". The page is fully static: data is baked in at build time.
