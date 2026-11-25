"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardData, ImportedLeague, LeagueConfig, Toggles, TrendData } from "@/lib/types";
import { applyToggles, computeBoard, defaultToggles, sameToggles } from "@/lib/engine";
import { buildLeaguemateBots } from "@/lib/leaguemates";
import { type ProfileOverride, effectiveProfile } from "@/lib/profiles";
import { keepRosterEdits } from "@/lib/rosters";
import BigBoard from "./BigBoard";
import LeagueEditor from "./LeagueEditor";
import FeedbackButton from "./Feedback";
import KeeperCalc from "./KeeperCalc";
import LiveDraft from "./LiveDraft";
import MockDraft from "./MockDraft";
import SettingsDrawer from "./SettingsDrawer";
import TradeAssistant from "./TradeAssistant";
import TrendTracker from "./TrendTracker";
import Welcome from "./Welcome";
import { IconBoard, IconKeeper, IconLive, IconMock, IconSettings, IconSwap, IconTrend, Logo } from "./icons";
import { TARGET } from "@/lib/season";

const TABS = [
  { id: "board", label: `${TARGET} Big Board`, short: "Board", icon: IconBoard },
  { id: "mock", label: "Mock Draft", short: "Mock", icon: IconMock },
  { id: "live", label: "Live Draft", short: "Live", icon: IconLive },
  { id: "trades", label: "Trades", short: "Trades", icon: IconSwap },
  { id: "keepers", label: "Keepers", short: "Keepers", icon: IconKeeper },
  { id: "trends", label: "Trends", short: "Trends", icon: IconTrend },
] as const;
type Tab = (typeof TABS)[number]["id"];
const STORAGE_KEY = "redraft27.toggles";
const LEAGUE_KEY = "redraft27.league";
const ME_KEY = "redraft27.myManager";
const PROFILES_KEY = "redraft27.profiles"; // { "<provider>:<leagueId>": { managerId: ProfileOverride } }
const leagueKey = (l: ImportedLeague | null) => (l ? `${l.provider}:${l.leagueId}` : "none");

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
  const learned = useMemo(() => (league ? buildLeaguemateBots(league) : []), [league]);
  const [allOverrides, setAllOverrides] = useState<Record<string, Record<string, ProfileOverride>>>({});
  const overrides = useMemo(() => allOverrides[leagueKey(league)] ?? {}, [allOverrides, league]);
  const setOverrides = (o: Record<string, ProfileOverride>) => {
    const next = { ...allOverrides, [leagueKey(league)]: o };
    setAllOverrides(next);
    save(PROFILES_KEY, next);
  };
  // Learned habits with your manual edits on top (edits always win)
  const leaguemates = useMemo(() => {
    if (!league) return [];
    const byId = new Map(learned.map((l) => [l.managerId, l]));
    return league.managers.map((m) => effectiveProfile(m.id, m.name, byId.get(m.id), overrides[m.id]));
  }, [league, learned, overrides]);
  const [editorOpen, setEditorOpen] = useState(false);
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
      setAllOverrides(JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "{}"));
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
  // Re-imported league (e.g. refreshed rosters): keep the chosen team and current toggles
  const refreshLeague = (lg: ImportedLeague) => {
    const merged = keepRosterEdits(league, lg);
    setLeague(merged);
    save(LEAGUE_KEY, merged);
  };
  // From the leaguemate editor: a hand-made league is created, or an existing one is edited
  const editLeague = (lg: ImportedLeague) => {
    if (!league) {
      importLeague(lg);
      if (lg.provider === "manual" && lg.managers[0]) chooseManager(lg.managers[0].id);
      return;
    }
    setLeague(lg);
    save(LEAGUE_KEY, lg);
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

  const go = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen text-slate-200">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Logo className="h-8 w-8 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight tracking-tight text-white sm:text-lg">
              <span className="text-emerald-400">{TARGET}</span> Redraft Projections<span className="hidden sm:inline"> &amp; Mock Draft</span>
            </h1>
            <p className="truncate text-[11px] text-slate-500">
              Through {m.sourceSeason} Week {m.throughWeek} · updated {updated}<span className="hidden sm:inline"> · refreshes every Tuesday</span>
            </p>
          </div>
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === t.id ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto lg:hidden"><FeedbackButton inline context={{ tab, league: league ? league.provider : "none" }} /></div>
          <button onClick={() => setSettingsOpen(true)}
            className={`flex shrink-0 lg:ml-auto items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition ${nonDefault || league ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/40 hover:bg-emerald-500/20" : "bg-slate-900 text-slate-200 ring-slate-700 hover:bg-slate-800"}`}>
            <IconSettings className="h-4 w-4" />
            <span className="hidden sm:inline">{league ? "Your league" : "League settings"}</span>
          </button>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-2.5">
          <button onClick={() => setSettingsOpen(true)} className="no-scrollbar -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" aria-label="Edit league settings">
            {chips.map((c, i) => (
              <span key={c} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ring-1 ${i === 0 && league ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30" : "bg-slate-900 text-slate-300 ring-slate-800"}`}>{c}</span>
            ))}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 lg:pb-10">
        {tab === "board" && (
          <Welcome onImport={() => setSettingsOpen(true)} onMock={() => go("mock")} onLive={() => go("live")} />
        )}
        {tab === "board" && <BigBoard board={board} cfg={cfg} nonDefault={nonDefault} showEspn={m.publication?.show_espn_fields !== false} />}
        {tab === "mock" && <MockDraft board={board} cfg={cfg} leaguemates={leaguemates} myManager={myManager} leagueName={league?.name ?? null} onOpenEditor={() => setEditorOpen(true)} />}
        {tab === "live" && <LiveDraft board={board} cfg={cfg} />}
        {tab === "trades" && (
          <TradeAssistant board={board} cfg={cfg} league={league} myManager={myManager} leaguemates={leaguemates}
            weeksLeft={Math.max(0, 17 - m.throughWeek)} onOpenSettings={() => setSettingsOpen(true)}
            onLeagueRefreshed={refreshLeague} onChooseManager={chooseManager} onOpenEditor={() => setEditorOpen(true)} />
        )}
        {tab === "keepers" && <KeeperCalc board={board} cfg={cfg} />}
        {tab === "trends" && <TrendTracker board={board} trends={trends} throughWeek={m.throughWeek} />}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-28 text-[11px] leading-relaxed text-slate-600 lg:pb-8">
        <div className="mb-2 flex gap-4 text-xs">
          <a href="/guide" className="text-emerald-400/80 hover:text-emerald-300">How it works</a>
          <a href="/accuracy" className="text-emerald-400/80 hover:text-emerald-300">How accurate are these projections?</a>
          <a href="/risers" className="text-emerald-400/80 hover:text-emerald-300">This week&apos;s risers &amp; fallers</a>
        </div>
        Sources: Sleeper public API (players, injuries, depth charts), ESPN fantasy API (ADP, roster %, rest-of-season
        projections{m.marketSource === "espn" ? "; ESPN ADP is the market signal" : "; ESPN unavailable, Sleeper rank used as market"}),
        nflverse weekly player stats, DynastyProcess ID map,
        an editable list of the incoming {TARGET} rookie class. Projections are model estimates, not guarantees.
      </footer>

      {/* Phone / tablet: app-style bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Sections">
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {TABS.map(({ id, short, icon: Icon }) => (
            <button key={id} onClick={() => go(id)} aria-current={tab === id ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${tab === id ? "text-emerald-400" : "text-slate-500"}`}>
              <Icon className="h-5 w-5" />
              {short}
            </button>
          ))}
        </div>
      </nav>

      <FeedbackButton context={{ tab, league: league ? league.provider : "none" }} />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} toggles={toggles} defaults={defaults}
        onChange={updateToggles} cfg={cfg} replacement={replacement}
        league={league} onImport={importLeague} myManager={myManager} onChooseManager={chooseManager}
        onOpenEditor={() => { setSettingsOpen(false); setEditorOpen(true); }} />
      <LeagueEditor open={editorOpen} onClose={() => setEditorOpen(false)} board={board} cfg={cfg} league={league}
        learned={learned} overrides={overrides} onOverrides={setOverrides} onLeagueChange={editLeague} myManager={myManager} />
    </div>
  );
}
