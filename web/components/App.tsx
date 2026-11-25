"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardData, ImportedLeague, LeagueConfig, Toggles, TrendData } from "@/lib/types";
import { applyToggles, computeBoard, defaultToggles, sameToggles } from "@/lib/engine";
import { buildLeaguemateBots } from "@/lib/leaguemates";
import BigBoard from "./BigBoard";
import FeedbackButton from "./Feedback";
import KeeperCalc from "./KeeperCalc";
import LiveDraft from "./LiveDraft";
import MockDraft from "./MockDraft";
import SettingsDrawer from "./SettingsDrawer";
import TrendTracker from "./TrendTracker";

const TABS = [
  { id: "board", label: "2027 Big Board" },
  { id: "mock", label: "Mock Draft Room" },
  { id: "live", label: "Live Draft" },
  { id: "keepers", label: "Keepers" },
  { id: "trends", label: "Weekly Trends" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const STORAGE_KEY = "redraft27.toggles";
const LEAGUE_KEY = "redraft27.league";
const ME_KEY = "redraft27.myManager";

/** The site's default config with an imported league's teams, roster, scoring and draft length applied. */
function withLeague(config: LeagueConfig, league: ImportedLeague | null): LeagueConfig {
  if (!league) return config;
  return {
    ...config,
    league_name: league.name,
    teams: league.teams,
    draft_rounds: league.draftRounds,
    roster: { ...league.roster },
    scoring: { ...league.scoring },
  };
}

function save(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export default function App({ data, trends, config: siteConfig }: { data: BoardData; trends: TrendData; config: LeagueConfig }) {
  const [league, setLeague] = useState<ImportedLeague | null>(null);
  const [myManager, setMyManager] = useState<string | null>(null);
  const config = useMemo(() => withLeague(siteConfig, league), [siteConfig, league]);
  const leaguemates = useMemo(() => (league ? buildLeaguemateBots(league) : []), [league]);
  const defaults = useMemo(() => defaultToggles(config), [config]);
  const [toggles, setToggles] = useState<Toggles>(defaults);
  const [tab, setTab] = useState<Tab>("board");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Restore an imported league (best effort)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LEAGUE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setLeague(JSON.parse(saved));
      setMyManager(localStorage.getItem(ME_KEY));
    } catch {
      /* storage unavailable */
    }
  }, []);
  const importLeague = (lg: ImportedLeague | null) => {
    setLeague(lg);
    save(LEAGUE_KEY, lg);
    setMyManager(null);
    save(ME_KEY, null);
    const t = defaultToggles(withLeague(siteConfig, lg));
    setToggles(t);
    save(STORAGE_KEY, t);
  };
  const chooseManager = (id: string | null) => {
    setMyManager(id);
    save(ME_KEY, id);
  };

  // Restore per-browser settings (best effort)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setToggles({ ...defaults, ...JSON.parse(saved) });
    } catch {
      /* storage unavailable */
    }
  }, [defaults]);
  const updateToggles = (t: Toggles) => {
    setToggles(t);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    } catch {
      /* ignore */
    }
  };

  const cfg = useMemo(() => applyToggles(config, toggles), [config, toggles]);
  const { board, replacement } = useMemo(() => computeBoard(data.players, cfg), [data.players, cfg]);
  const nonDefault = !sameToggles(toggles, defaults);
  const m = data.meta;
  const updated = m.lastIngest ? new Date(m.lastIngest).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

  const chips = [
    ...(league ? [league.name] : []),
    `${cfg.teams} teams`,
    `${cfg.roster.FLEX} FLEX`,
    ...(cfg.roster.SUPERFLEX ? ["Superflex"] : []),
    cfg.scoring.rec === 1 ? "Full PPR" : cfg.scoring.rec === 0.5 ? "Half PPR" : cfg.scoring.rec === 0 ? "Standard" : `${cfg.scoring.rec} PPR`,
    `${cfg.scoring.pass_td}-pt pass TD`,
    ...(cfg.scoring.te_premium ? [`TE +${cfg.scoring.te_premium}`] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              <span className="text-emerald-400">2027</span> Redraft Projections &amp; Mock Draft
            </h1>
            <p className="text-xs text-slate-500">
              Data through {m.sourceSeason} Week {m.throughWeek} · updated {updated} · auto-refreshes every Tuesday
            </p>
          </div>
          <nav className="flex rounded-xl bg-slate-900 p-1 ring-1 ring-slate-800">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${tab === t.id ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300 ring-1 ring-slate-800">{c}</span>
            ))}
            <button onClick={() => setSettingsOpen(true)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ${nonDefault ? "bg-amber-500/15 text-amber-300 ring-amber-500/40" : "bg-slate-900 text-slate-200 ring-slate-700 hover:bg-slate-800"}`}>
              ⚙ Settings{nonDefault ? " (custom)" : ""}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        {tab === "board" && <BigBoard board={board} cfg={cfg} nonDefault={nonDefault} showEspn={m.publication?.show_espn_fields !== false} />}
        {tab === "mock" && <MockDraft board={board} cfg={cfg} leaguemates={leaguemates} myManager={myManager} leagueName={league?.name ?? null} />}
        {tab === "live" && <LiveDraft board={board} cfg={cfg} />}
        {tab === "keepers" && <KeeperCalc board={board} cfg={cfg} />}
        {tab === "trends" && <TrendTracker board={board} trends={trends} throughWeek={m.throughWeek} />}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-[11px] leading-relaxed text-slate-600">
        <div className="mb-2 flex gap-4 text-xs">
          <a href="/guide" className="text-emerald-400/80 hover:text-emerald-300">How it works</a>
          <a href="/accuracy" className="text-emerald-400/80 hover:text-emerald-300">How accurate are these projections?</a>
          <a href="/risers" className="text-emerald-400/80 hover:text-emerald-300">This week&apos;s risers &amp; fallers</a>
        </div>
        Sources: Sleeper public API (players, injuries, depth charts), ESPN fantasy API (ADP, roster %, rest-of-season
        projections{m.marketSource === "espn" ? "; ESPN ADP is the market signal" : "; ESPN unavailable, Sleeper rank used as market"}),
        nflverse weekly player stats, DynastyProcess ID map,
        editable data/rookies_2027.csv. Projections are model estimates, not guarantees.
      </footer>

      <FeedbackButton context={{ tab, league: league ? league.provider : "none" }} />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} toggles={toggles} defaults={defaults}
        onChange={updateToggles} cfg={cfg} replacement={replacement}
        league={league} onImport={importLeague} myManager={myManager} onChooseManager={chooseManager} />
    </div>
  );
}
