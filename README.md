# Future Fantasy: next-season fantasy football projections, mock drafts & league tools

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
5. **Rookies.** `scripts/rookie_model.py` learns first-season production by position and draft slot from every QB/RB/WR/TE
   drafted since 2012 (busts included, later picks never projected above earlier ones) and writes `data/rookie_curve.json`.
   Each prospect in `rookies_<target>.csv` is projected from its `projected_pick` (or its draft-capital tier) × `talent_grade`.
   Re-run the script once a year after the season ends.
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

## Season rollover

`source_season` / `target_season` are `"auto"` in `config/league_settings.json`. Each run, `update_data.py` picks the newest
season with completed regular-season games as the source and projects the year after it, so the board projects 2027 during the
2026 season and its offseason, then rolls to 2028 once 2027 games start. Every year label on the site comes from
`web/data/season.json`. The one manual step each spring: create `data/rookies_<target>.csv` for the new draft class (copy the
previous file's columns); until it exists the board shows no incoming rookies and the run logs a warning.

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

## App features

| Where | What |
| --- | --- |
| Big Board | Top 250 for 2027 with tiers, VORP, ADP, ESPN ADP, weekly movement; Settings toggles (FLEX, superflex, PPR, pass TD, TE premium) re-rank instantly |
| Settings → Import your league | Sleeper (any league ID) or public ESPN leagues via `/api/league`: roster slots incl. superflex, scoring incl. TE premium, past drafts. Private ESPN leagues can't be read without the owner's login cookies, which the app never asks for |
| Mock Draft Room | Snake draft vs. AI personalities, or vs. bots that draft like your real leaguemates (positional tendencies by round, learned from past drafts). Finished mocks get a share link (`/share/<code>`) with a generated preview image |
| Settings → Describe leaguemates & edit rosters | Manual overrides for everything learned automatically: per-manager style preset, position leans, randomness, rookie appetite, run-following, trade openness, or a plain-English description parsed by transparent keyword rules (`web/lib/profiles.ts`); add/remove roster players (kept across refreshes); or set up a whole league by hand when there's nothing to import |
| Mock Draft → Strategy lab | Simulates full drafts from your slot for 8 strategies (best available, Zero RB, Hero RB, Robust RB, WR-heavy, early/late QB, early TE) against the mock bots or your leaguemates with common random numbers; compares avg projected starter points, finish, top-3 rate, typical opening (`web/lib/strategyLab.ts`) |
| Mock Draft room extras | On the clock: Monte Carlo odds each player lasts to your next pick; steal/reach badges, live grades, tier countdown; post-draft replay (`web/lib/draftSim.ts`) |
| Live Draft | Follows a real Sleeper draft (public draft API, polled every 5 s) and ranks your next pick |
| My League → Waivers | Unrostered board players ranked by gain to your best lineup, with who they'd start over, best drop and a FAAB bid range (Sleeper budgets shown in $) |
| My League → Power rankings | Every team ranked by projected starting lineup vs. its actual record; shareable `/rankings/<code>` page with a preview image |
| Trades | Loads every roster in the imported league; suggests 1-for-1 to 2-for-2 trades that raise your best starting lineup without meaningfully hurting theirs, with an acceptance estimate (their lineup gain, ADP name value, their drafting tastes); manual analyzer. Time frame: rest of season (ESPN rest-of-season projection when available), next season, or both |
| Keepers | Keeper value = 2027 VORP minus the expected VORP at the pick you give up |
| Weekly Trends, `/risers` | Week-over-week ADP movement; `/risers` is a static, search-friendly page that refreshes every Tuesday |
| `/accuracy` | Out-of-sample backtest results (`scripts/backtest.py`) |

## Accuracy backtest

`python scripts/backtest.py` projects 2024 and 2025 using only the two seasons before each, with the same engine minus
current-season-only inputs, and scores the result against actual fantasy points. Pool: ESPN's preseason PPR top 200 veterans.

| Season | Model rank corr | ESPN projections | ESPN rankings | Same as last year |
| --- | --- | --- | --- | --- |
| 2024 | 0.53 | 0.66 | 0.58 | 0.47 |
| 2025 | 0.62 | 0.68 | 0.49 | 0.52 |

The model beats the "same as last year" baseline every season and beat ESPN's rankings in 2025, but trails ESPN's own
projections, mostly at QB and TE. ESPN's preseason numbers include offseason news (trades, depth charts, injuries) the
backtest deliberately leaves out. A grid search over the main model knobs (prior-season weight, TD regression, recency decay,
availability weight) moved results by less than 0.01, so the gap is about missing inputs, not tuning. ESPN's archive has empty
2023 projections, so 2023 can't be compared.

## Feedback loop

A floating **Feedback** button (0–10 recommend score, category, comment, optional email) and a one-tap "how realistic were
the bots?" rating after each mock draft post to `/api/feedback`. Connect at least one private destination in Vercel →
Project → Settings → Environment Variables, then redeploy:

- `FEEDBACK_WEBHOOK_URL` (+ optional `FEEDBACK_WEBHOOK_KIND=slack`): a Discord or Slack incoming webhook for a private channel. Easiest.
- `FEEDBACK_GITHUB_REPO` + `FEEDBACK_GITHUB_TOKEN`: files feedback as issues in a **private** repo (fine-grained token, Issues read/write
  on that repo only). The route refuses to post to a public repo, because this repo is public and feedback can include emails.

Without a destination, feedback only lands in Vercel's runtime logs, which Hobby plans keep for a short time.

### Reading feedback (`scripts/read_feedback.py`)

Webhooks can only post, so reading the channel uses a small **read-only** Discord bot. One-time setup:

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** (any name, e.g. "Feedback reader").
2. **Bot** tab → turn on **Message Content Intent** → **Reset Token** → copy it into `.env` as `DISCORD_BOT_TOKEN=`.
   Don't paste the token anywhere else. Anyone holding it can act as the bot.
3. **OAuth2 → URL Generator**: scope `bot`, permissions **View Channels** + **Read Message History** only. Open the generated
   URL and add the bot to your server. (Or use `https://discord.com/oauth2/authorize?client_id=<Application ID>&scope=bot&permissions=66560`.)
4. If the feedback channel is private, add the bot's role to it (channel settings → Permissions).
5. Discord → User Settings → Advanced → **Developer Mode** on → right-click the feedback channel → **Copy Channel ID** →
   `.env` as `DISCORD_FEEDBACK_CHANNEL_ID=`.

Then `python scripts/read_feedback.py` prints feedback since the last run (`--all` for the last 100, `--json` for scripts).
`.env` and the read position (`data/.feedback_state.json`) are git-ignored.

## Roster refresh and ESPN cookies

- Opening **My League** refreshes rosters automatically when they're more than 12 hours old (from the user's browser; for ESPN
  private leagues only when cookies are remembered on that device). A small note says when it happened.
- If ESPN rejects the cookies (they expire on logout or password change) or none are saved, My League shows an in-place
  "Update login & refresh" box instead of sending the user back to Settings.
- Re-importing a league you already have keeps your hand roster edits, the same as a refresh.

## Reliability and data

- **Error reports:** uncaught errors, failed promises and crashes (`app/error.tsx`) are posted to `/api/feedback` as kind `error`,
  deduplicated and capped at 5 per browser session, so they arrive in the same private Discord/Slack channel as feedback.
- **Saved leagues:** every import is kept (`redraft27.savedLeagues`) with a switcher in Settings; your team and leaguemate edits
  are remembered per league.
- **Backup / restore:** Settings → Back up my data downloads everything the site stores in the browser (ESPN cookies excluded);
  Restore loads it on another device. Accounts will replace this.
- **Analytics:** `@vercel/analytics` is installed; enable Web Analytics in Vercel → Project → Analytics to start collecting
  page views (privacy-friendly, no cookies).

## Private ESPN leagues

ESPN has no third-party sign-in, so private leagues use the viewer's own `espn_s2` and `SWID` cookies. They're sent in a POST body
(never a URL), forwarded to ESPN for that one request, and never stored or logged server-side; the browser keeps them only if the
user ticks "Remember on this device".

## Model changelog (backtest-driven)

| Change | 2023–25 avg rank corr | Shipped |
| --- | --- | --- |
| Baseline (usage + efficiency regression + age curve) | 0.565 | yes |
| + target-season rosters (Week 1 in backtests, Sleeper live): unsigned / reserve / team changes | **0.582** | yes |
| + team volume pools (redistribute vacated targets/carries) | 0.567–0.577 | no (`team_context: false`) |
| + QB-quality adjustment for pass catchers | 0.562–0.579 | no |
| Rookie curve from draft history (rookies-only corr 2024 / 2025) | 0.41 / 0.64 (ESPN 0.62 / 0.54) | yes (replaces hand-made templates) |

## Before charging money

Set `publication.show_headshots` and `publication.show_espn_fields` to `false` in `config/league_settings.json`: NFL headshots
are copyrighted and ESPN's terms restrict commercial reuse of its data. Get a legal review of data sources before launch.

## Weekly automation

`.github/workflows/weekly_update.yml` runs every **Tuesday at 11:00 UTC** (and on manual dispatch, with an optional backfill). It ingests data,
projects, checks that the site still builds, then commits `data/fantasy_2027.db` and `web/data/`. Vercel redeploys on that commit.
Optional: set a repository variable `ROOKIE_SOURCE_URL` to a CSV (same columns as `rookies_2027.csv`) to merge outside prospect updates.
Your local edits always win.

## Deploying to Vercel

Import the repo and leave **Root Directory empty** (the repo root). Vercel reads the root `vercel.json`, which declares one
Services entry, `web` (the Next.js app in `web/`), serving every path. Setting Root Directory to `web` makes Vercel look for
`web/vercel.json` instead and fail with "no services are declared". The page is fully static: data is baked in at build time.

### Custom domain

Live at **https://fantasy.jay-builds.com** (Cloudflare DNS: CNAME `fantasy` → the `*.vercel-dns-*.com` target Vercel shows,
proxy **off**/DNS only so Vercel can issue the certificate). The old `redraftsim.vercel.app` address keeps working.

- Vercel env `NEXT_PUBLIC_SITE_URL=https://fantasy.jay-builds.com` drives the sitemap, robots.txt, link-preview URLs and
  metadata. It's inlined at build time, so redeploy after changing it.
- Supabase → Authentication → URL Configuration: Site URL is the new domain; Redirect URLs allow
  `https://fantasy.jay-builds.com/**` and `https://redraftsim.vercel.app/**`.
- Google Cloud OAuth consent screen: add `jay-builds.com` to authorized domains and publish the app so anyone can sign in.
