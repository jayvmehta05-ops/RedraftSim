"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardData, ImportedLeague, LeagueConfig, Toggles, TrendData } from "@/lib/types";
import { applyToggles, computeBoard, defaultToggles, sameToggles } from "@/lib/engine";
import { buildLeaguemateBots } from "@/lib/leaguemates";
import { type ProfileOverride, effectiveProfile, overrideFromLearned } from "@/lib/profiles";
import { applyMateIssues } from "@/lib/botTuning";
import { seasonPhase } from "@/lib/phase";
import { keepRosterEdits, keeperOn } from "@/lib/rosters";
import AccountButton from "./AccountButton";
import Glide from "./Glide";
import { type SwipeTarget, useSwipePages } from "./useSwipePages";
import BigBoard from "./BigBoard";
import HelpPanel, { HelpButton } from "./HelpPanel";
import LeagueEditor from "./LeagueEditor";
import { LEAGUE_GROUPS, MAIN_HELP } from "@/lib/help";
import FeedbackButton from "./Feedback";
import KeeperCalc from "./KeeperCalc";
import LiveDraft from "./LiveDraft";
import DraftHub from "./DraftHub";
import SettingsDrawer from "./SettingsDrawer";
import LeagueHub from "./LeagueHub";
import TrendTracker from "./TrendTracker";
import Welcome from "./Welcome";
import { IconBoard, IconKeeper, IconLive, IconMock, IconSettings, IconSwap, IconTrend, Logo } from "./icons";
import { TARGET } from "@/lib/season";
import { readNav, writeNav } from "@/lib/nav";

const TABS = [
  { id: "board", label: `${TARGET} Big Board`, mid: "Big Board", short: "Board", icon: IconBoard },
  { id: "mock", label: "Mock Draft", mid: "Mock Draft", short: "Mock", icon: IconMock },
  { id: "live", label: "Live Draft", mid: "Live Draft", short: "Live", icon: IconLive },
  { id: "trades", label: "My League", mid: "My League", short: "League", icon: IconSwap },
  { id: "keepers", label: "Keepers", mid: "Keepers", short: "Keepers", icon: IconKeeper },
  { id: "trends", label: "Trends", mid: "Trends", short: "Trends", icon: IconTrend },
] as const;
type Tab = (typeof TABS)[number]["id"];
const STORAGE_KEY = "redraft27.toggles";
const KEEPER_KEY = "redraft27.keeperMode"; // site-wide keeper mode when no league is imported
const LEAGUE_KEY = "redraft27.league";
const ME_KEY = "redraft27.myManager";
const PROFILES_KEY = "redraft27.profiles";
const SAVED_KEY = "redraft27.savedLeagues"; // { "<provider>:<leagueId>": ImportedLeague }
const MYS_KEY = "redraft27.myManagers";     // { "<provider>:<leagueId>": managerId } // { "<provider>:<leagueId>": { managerId: ProfileOverride } }
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
  const [savedLeagues, setSavedLeagues] = useState<Record<string, ImportedLeague>>({});
  const [myManagers, setMyManagers] = useState<Record<string, string>>({});
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [siteKeeper, setSiteKeeper] = useState(false);
  const keeper = keeperOn(league, siteKeeper);
  const tabs = TABS.filter((t) => t.id !== "keepers" || keeper);

  // Restore an imported league (best effort)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LEAGUE_KEY);
      const active: ImportedLeague | null = saved ? JSON.parse(saved) : null;
      const all: Record<string, ImportedLeague> = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "{}");
      const mys: Record<string, string> = JSON.parse(localStorage.getItem(MYS_KEY) ?? "{}");
      const me = localStorage.getItem(ME_KEY);
      if (active && !all[leagueKey(active)]) all[leagueKey(active)] = active; // migrate single-league storage
      if (active && me && !mys[leagueKey(active)]) mys[leagueKey(active)] = me;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLeague(active);
      setMyManager(me);
      setSavedLeagues(all);
      setMyManagers(mys);
      setAllOverrides(JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "{}"));
      const storedKeeper = localStorage.getItem(KEEPER_KEY) === "1";
      setSiteKeeper(storedKeeper);
      // A link or refresh (/app#league/odds) opens where it points; otherwise, during the season,
      // people with a league come back for their league: open there
      const nav = readNav();
      const p = seasonPhase(data.meta.throughWeek, active, 0).phase;
      if (nav.tab && (nav.tab !== "keepers" || keeperOn(active, storedKeeper))) setTab(nav.tab);
      else if (active && me && p !== "preseason" && p !== "offseason") { setTab("trades"); writeNav("trades", null, true); }
    } catch {
      /* storage unavailable */
    }
  }, [data.meta.throughWeek]);
  const storeSaved = (next: Record<string, ImportedLeague>) => {
    setSavedLeagues(next);
    save(SAVED_KEY, next);
  };
  // Make `lg` the active league: restore your team in it and its default scoring toggles
  const activate = (lg: ImportedLeague | null, mys = myManagers) => {
    setLeague(lg);
    save(LEAGUE_KEY, lg);
    const me = lg ? mys[leagueKey(lg)] ?? null : null;
    setMyManager(me);
    save(ME_KEY, me);
    const t = defaultToggles(withLeague(siteConfig, lg));
    setToggles(t);
    save(STORAGE_KEY, t);
  };
  // New import (kept alongside your other leagues), or null to remove the active league
  const importLeague = (lg: ImportedLeague | null) => {
    if (!lg) {
      const next = { ...savedLeagues };
      if (league) delete next[leagueKey(league)];
      storeSaved(next);
      activate(Object.values(next)[0] ?? null);
      return;
    }
    let incoming = lg;
    if (lg.provider === "manual") {
      // hand-made leagues get a unique id so two of them never overwrite each other
      let n = 1;
      while (savedLeagues[`manual:${lg.leagueId}-${n}`]) n += 1;
      incoming = { ...lg, leagueId: `${lg.leagueId}-${n}` };
    }
    // Re-importing a league you already have keeps your hand roster edits (like a refresh does)
    const existing = savedLeagues[leagueKey(incoming)];
    if (existing) incoming = keepRosterEdits(existing, incoming);
    storeSaved({ ...savedLeagues, [leagueKey(incoming)]: incoming });
    activate(incoming);
    return incoming;
  };
  const switchLeague = (key: string) => {
    const lg = savedLeagues[key];
    if (lg) activate(lg);
  };
  // Re-imported league (e.g. refreshed rosters): keep the chosen team and current toggles
  const refreshLeague = (lg: ImportedLeague) => {
    const merged = keepRosterEdits(league, lg);
    setLeague(merged);
    save(LEAGUE_KEY, merged);
    storeSaved({ ...savedLeagues, [leagueKey(merged)]: merged });
  };
  // From the leaguemate editor: a hand-made league is created, or an existing one is edited
  const editLeague = (lg: ImportedLeague) => {
    if (!league) {
      const created = importLeague(lg);
      if (created && created.provider === "manual" && created.managers[0]) chooseManager(created.managers[0].id, created);
      return;
    }
    setLeague(lg);
    save(LEAGUE_KEY, lg);
    storeSaved({ ...savedLeagues, [leagueKey(lg)]: lg });
  };
  // Keeper mode: saved on the active league, or site-wide when there's no league
  const setKeeper = (on: boolean) => {
    if (league) editLeague({ ...league, rules: { ...league.rules, keeper: on } });
    else { setSiteKeeper(on); save(KEEPER_KEY, on ? "1" : null); }
    if (!on && tab === "keepers") setTab("board");
  };
  const chooseManager = (id: string | null, forLeague: ImportedLeague | null = league) => {
    setMyManager(id);
    save(ME_KEY, id);
    if (forLeague) {
      const next = { ...myManagers };
      if (id) next[leagueKey(forLeague)] = id; else delete next[leagueKey(forLeague)];
      setMyManagers(next);
      save(MYS_KEY, next);
    }
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
  // Fixed locale + UTC so the server-rendered HTML and the browser produce the same text (no hydration mismatch)
  const updated = m.lastIngest
    ? new Date(m.lastIngest).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "—";

  const chips = [
    ...(league ? [league.name] : []),
    `${cfg.teams} teams`,
    `${cfg.roster.FLEX} FLEX`,
    ...(cfg.roster.SUPERFLEX ? ["Superflex"] : []),
    cfg.scoring.rec === 1 ? "Full PPR" : cfg.scoring.rec === 0.5 ? "Half PPR" : cfg.scoring.rec === 0 ? "Standard" : `${cfg.scoring.rec} PPR`,
    `${cfg.scoring.pass_td}-pt pass TD`,
    ...(cfg.scoring.te_premium ? [`TE +${cfg.scoring.te_premium}`] : []),
  ];

  // Which way the last page change went, so the new page slides in from that side (0 = just fade)
  const [dir, setDir] = useState<-1 | 0 | 1>(0);
  const go = (t: Tab) => {
    const from = tabs.findIndex((x) => x.id === tab);
    const to = tabs.findIndex((x) => x.id === t);
    setDir(from < 0 || to < 0 || to === from ? 0 : to > from ? 1 : -1);
    setTab(t);
    if (t !== tab) writeNav(t); // re-tapping the open tab keeps its tool in the URL
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  // Phones: swipe sideways to the next / previous page. In My League that walks through its tools first.
  const leagueSwipe = useRef<SwipeTarget | null>(null);
  useSwipePages(() => {
    const i = tabs.findIndex((x) => x.id === tab);
    const inLeague = (d: 1 | -1) => tab === "trades" && !!leagueSwipe.current?.can(d);
    return {
      can: (d) => inLeague(d) || !!tabs[i + d],
      go: (d) => {
        if (inLeague(d)) { leagueSwipe.current!.go(d); return; }
        const next = tabs[i + d]?.id;
        if (!next) return;
        go(next);
        // Swiping into My League lands on its first tool from the left, its last tool from the right
        if (next === "trades") { const ids = LEAGUE_GROUPS.flatMap((g) => g.ids); writeNav("trades", d > 0 ? ids[0] : ids[ids.length - 1], true); }
      },
    };
  });
  // First visit on a phone: a one-time hint that pages can be swiped
  const [swipeHint, setSwipeHint] = useState(false);
  useEffect(() => {
    try {
      if (window.innerWidth > 1023 || localStorage.getItem("redraft27.swipeHint")) return;
      localStorage.setItem("redraft27.swipeHint", "1");
    } catch { return; }
    const show = setTimeout(() => setSwipeHint(true), 1200);
    const hide = setTimeout(() => setSwipeHint(false), 5200);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);
  // Browser Back / Forward move between tabs instead of leaving the app
  useEffect(() => {
    const onPop = () => { setDir(0); setTab(readNav().tab ?? "board"); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <div className="min-h-screen overflow-x-clip text-slate-200">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-3">
          <Link href="/" aria-label="Home" className="shrink-0"><Logo className="h-8 w-8" /></Link>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold leading-tight tracking-tight text-white sm:text-lg">
              Future <span className="text-emerald-400">Fantasy</span><span className="ml-2 hidden rounded-md bg-emerald-500/10 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30 sm:inline">{TARGET} board</span>
            </h1>
            <p className="truncate text-[11px] text-slate-500">
              Through {m.sourceSeason} Week {m.throughWeek} · updated {updated}<span className="hidden sm:inline"> · refreshes every Tuesday</span>
            </p>
          </div>
          <Glide as="nav" pill="rounded-lg bg-slate-800" className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Sections">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? "page" : undefined} title={MAIN_HELP[t.id].what} data-active={tab === t.id}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${tab === t.id ? "text-white" : "text-slate-400 hover:bg-slate-900/70 hover:text-white"}`}>
                <span className="xl:hidden">{t.mid}</span><span className="hidden xl:inline">{t.label}</span>
              </button>
            ))}
          </Glide>
          <div className="ml-auto flex items-center gap-2"><AccountButton /></div>
          <HelpButton onClick={() => setHelpOpen(true)} />
          <div className="lg:hidden"><FeedbackButton inline context={{ tab, league: league ? league.provider : "none" }} /></div>
          <button onClick={() => setSettingsOpen(true)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition ${nonDefault || league ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/40 hover:bg-emerald-500/20" : "bg-slate-900 text-slate-200 ring-slate-700 hover:bg-slate-800"}`}>
            <IconSettings className="h-4 w-4" />
            {league ? <span className="hidden sm:inline">Your league</span> : <><span className="sm:hidden">Import</span><span className="hidden sm:inline">League settings</span></>}
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

      <main key={tab} className={`${dir > 0 ? "ff-slide-next" : dir < 0 ? "ff-slide-prev" : "ff-view"} mx-auto max-w-7xl px-4 pb-28 pt-5 lg:pb-10`}>
        {tab === "board" && (
          <Welcome onImport={() => setSettingsOpen(true)} onMock={() => go("mock")} onLive={() => go("live")} onHelp={() => setHelpOpen(true)} />
        )}
        {tab === "board" && <BigBoard board={board} cfg={cfg} nonDefault={nonDefault} showEspn={m.publication?.show_espn_fields !== false} />}
        {tab === "mock" && <DraftHub board={board} cfg={cfg} leaguemates={leaguemates} myManager={myManager} leagueName={league?.name ?? null} onOpenEditor={() => setEditorOpen(true)}
          onTuneLeaguemate={(id, ids) => setOverrides({ ...overrides, [id]: applyMateIssues(overrides[id] ?? overrideFromLearned(learned.find((l) => l.managerId === id)), ids) })} />}
        {tab === "live" && <LiveDraft board={board} cfg={cfg} />}
        {tab === "trades" && (
          <LeagueHub board={board} cfg={cfg} league={league} myManager={myManager} leaguemates={leaguemates}
            throughWeek={m.throughWeek} keeper={keeper} onOpenSettings={() => setSettingsOpen(true)} swipeRef={leagueSwipe}
            onLeagueRefreshed={refreshLeague} onChooseManager={chooseManager} onOpenEditor={() => setEditorOpen(true)} onLeagueEdit={editLeague} />
        )}
        {tab === "keepers" && keeper && <KeeperCalc board={board} cfg={cfg} />}
        {tab === "trends" && <TrendTracker board={board} trends={trends} throughWeek={m.throughWeek} />}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-28 text-[11px] leading-relaxed text-slate-600 lg:pb-8">
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <a href="/about" className="text-emerald-400/80 hover:text-emerald-300">About</a>
          <a href="/guide" className="text-emerald-400/80 hover:text-emerald-300">How it works</a>
          <a href="/accuracy" className="text-emerald-400/80 hover:text-emerald-300">How accurate are these projections?</a>
          <a href="/risers" className="text-emerald-400/80 hover:text-emerald-300">This week&apos;s risers &amp; fallers</a>
        </div>
        Sources: Sleeper public API (players, injuries, depth charts), ESPN fantasy API (ADP, roster %, rest-of-season
        projections{m.marketSource === "espn" ? "; ESPN ADP is the market signal" : "; ESPN unavailable, Sleeper rank used as market"}),
        nflverse weekly player stats, DynastyProcess ID map,
        an editable list of the incoming {TARGET} rookie class. Projections are model estimates, not guarantees.
        <div className="mt-2">
          Not affiliated with or endorsed by the NFL, ESPN, Sleeper or Yahoo. ·{" "}
          <a href="/privacy" className="hover:text-slate-400">Privacy</a> · <a href="/terms" className="hover:text-slate-400">Terms</a>
        </div>
      </footer>

      {/* Phone / tablet: app-style bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Sections">
        <Glide pill="rounded-2xl bg-emerald-500/10" className="mx-auto grid max-w-lg px-1 py-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map(({ id, short, icon: Icon }) => (
            <button key={id} onClick={() => go(id)} aria-current={tab === id ? "page" : undefined} data-active={tab === id}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${tab === id ? "text-emerald-400" : "text-slate-500"}`}>
              <Icon className={`h-5 w-5 transition-transform duration-300 ease-[var(--ease-glide)] ${tab === id ? "scale-110" : ""}`} />
              {short}
            </button>
          ))}
        </Glide>
      </nav>
      {swipeHint && (
        <div aria-live="polite" className="ff-pop pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center lg:hidden">
          <span className="rounded-full bg-slate-800/95 px-4 py-2 text-xs font-semibold text-slate-200 shadow-lg ring-1 ring-slate-700">
            Tip: swipe left or right to switch pages
          </span>
        </div>
      )}

      <FeedbackButton context={{ tab, league: league ? league.provider : "none" }} />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} toggles={toggles} defaults={defaults}
        onChange={updateToggles} cfg={cfg} replacement={replacement}
        league={league} onImport={importLeague} myManager={myManager} onChooseManager={(id) => chooseManager(id)}
        savedLeagues={Object.entries(savedLeagues).map(([key, l]) => ({ key, name: l.name, provider: l.provider }))}
        activeKey={league ? leagueKey(league) : null} onSwitchLeague={switchLeague} keeper={keeper} onKeeper={setKeeper}
        onOpenEditor={() => { setSettingsOpen(false); setEditorOpen(true); }} />
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} onGo={(t) => go(t)} hasLeague={!!league}
        hasTeam={!!league && !!myManager && league.managers.some((x) => x.id === myManager)} keeper={keeper} onOpenSettings={() => setSettingsOpen(true)} />
      <LeagueEditor open={editorOpen} onClose={() => setEditorOpen(false)} board={board} cfg={cfg} league={league}
        learned={learned} overrides={overrides} onOverrides={setOverrides} onLeagueChange={editLeague} myManager={myManager} />
    </div>
  );
}
