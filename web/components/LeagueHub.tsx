"use client";

import { useEffect, useRef, useState } from "react";
import { type EspnAuth, fetchLatest, isStale, rememberEspnAuth, savedEspnAuth } from "@/lib/refresh";
import type { LeaguemateProfile } from "@/lib/leaguemates";
import { LEAGUE_GROUPS, LEAGUE_HELP } from "@/lib/help";
import { seasonPhase } from "@/lib/phase";
import { readNav, writeNav } from "@/lib/nav";
import { SOURCE, TARGET } from "@/lib/season";
import type { ImportedLeague, LeagueConfig, RankedPlayer } from "@/lib/types";
import Glide from "./Glide";
import type { SwipeTarget } from "./useSwipePages";
import LuckMeter from "./LuckMeter";
import MyTeam from "./MyTeam";
import PlayoffOdds from "./PlayoffOdds";
import StartSit from "./StartSit";
import PowerRankings from "./PowerRankings";
import TradeAssistant from "./TradeAssistant";
import Waivers from "./Waivers";

type Section = "team" | "startsit" | "trades" | "waivers" | "power" | "odds" | "luck";

/** Shown when ESPN needs fresh login cookies for a private league; retries the refresh on submit. */
function EspnLogin({ onSubmit, busy, error }: { onSubmit: (a: EspnAuth, remember: boolean) => void; busy: boolean; error: string | null }) {
  const [s2, setS2] = useState("");
  const [swid, setSwid] = useState("");
  const [remember, setRemember] = useState(true);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (s2.trim() && swid.trim()) onSubmit({ espnS2: s2.trim(), swid: swid.trim() }, remember); }}
      className="rounded-xl bg-amber-500/10 p-4 ring-1 ring-amber-500/30">
      <div className="text-sm font-semibold text-amber-200">ESPN needs your login to refresh this private league</div>
      <p className="mt-1 text-xs text-slate-400">
        {error ?? "Your saved ESPN cookies are missing or expired (they expire when you log out of ESPN)."} On a computer, open fantasy.espn.com
        while logged in → F12 → Application → Cookies → espn.com → copy <b>espn_s2</b> and <b>SWID</b>.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input value={s2} onChange={(e) => setS2(e.target.value)} placeholder="espn_s2" type="password" autoComplete="off"
          className="rounded-md bg-slate-900 px-2 py-1.5 text-xs text-white ring-1 ring-slate-700 placeholder:text-slate-500" />
        <input value={swid} onChange={(e) => setSwid(e.target.value)} placeholder="SWID, like {XXXXXXXX-...}" autoComplete="off"
          className="rounded-md bg-slate-900 px-2 py-1.5 text-xs text-white ring-1 ring-slate-700 placeholder:text-slate-500" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-emerald-500" />
          Remember on this device
        </label>
        <button type="submit" disabled={busy || !s2.trim() || !swid.trim()}
          className="ml-auto rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 disabled:bg-slate-800 disabled:text-slate-600">
          {busy ? "Refreshing…" : "Update login & refresh"}
        </button>
      </div>
    </form>
  );
}

/** "My League": trades, waivers and power rankings for an imported (or hand-made) league. */
export default function LeagueHub(props: {
  board: RankedPlayer[]; cfg: LeagueConfig; league: ImportedLeague | null; myManager: string | null;
  leaguemates: LeaguemateProfile[]; keeper: boolean; onOpenSettings: () => void;
  /** last NFL week with complete stats (drives the season phase) */
  throughWeek: number;
  onLeagueRefreshed: (l: ImportedLeague) => void; onChooseManager: (id: string | null) => void; onOpenEditor: () => void;
  /** save a hand edit to the league (e.g. locking a player) */
  onLeagueEdit: (l: ImportedLeague) => void;
  /** lets the app's phone swipe step through these tools before moving to the next tab */
  swipeRef?: React.RefObject<SwipeTarget | null>;
}) {
  // Open on what matters for this point in the season: lineups once trading is over, rosters before that
  // A link or refresh (/app#league/odds) opens that tool; otherwise what matters for this point in the season
  const [section, setSectionState] = useState<Section>(() => {
    const fromUrl = readNav().section;
    if (fromUrl) return fromUrl;
    const p = seasonPhase(props.throughWeek, props.league, 0);
    return p.phase === "playoffs" || (p.phase === "stretch" && !p.tradesOpen) ? "startsit" : "team";
  });
  const [secDir, setSecDir] = useState<-1 | 0 | 1>(0); // slide direction for the next tool's entrance
  const ORDER = LEAGUE_GROUPS.flatMap((g) => g.ids); // left-to-right order, as the picker shows them
  const setSection = (s: Section) => {
    const a = ORDER.indexOf(section), b = ORDER.indexOf(s);
    setSecDir(a === b ? 0 : b > a ? 1 : -1);
    setSectionState(s);
    writeNav("trades", s);
  };
  const { swipeRef } = props;
  useEffect(() => {
    if (!swipeRef) return;
    const i = ORDER.indexOf(section);
    swipeRef.current = { can: (d) => !!ORDER[i + d], go: (d) => { if (ORDER[i + d]) setSection(ORDER[i + d]); } };
    return () => { swipeRef.current = null; };
  });
  // Keep the URL showing the open tool, and follow Back / Forward between tools
  useEffect(() => {
    writeNav("trades", section, true);
    const onPop = () => { const n = readNav(); if (n.tab === "trades" && n.section) { setSecDir(0); setSectionState(n.section); } };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { league, myManager, onLeagueRefreshed } = props;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [now, setNow] = useState(0); // for "updated N min ago"; set after mount so server and client HTML match

  const refresh = async (auth?: EspnAuth | null, auto = false) => {
    if (!league || league.provider === "manual") return;
    setRefreshing(true);
    setRefreshError(null);
    const r = await fetchLatest(league, auth);
    setRefreshing(false);
    if (r.league) {
      onLeagueRefreshed(r.league);
      setNeedsLogin(false);
    } else {
      setNeedsLogin(!!r.needsLogin);
      // A failed automatic refresh stays quiet unless ESPN needs a login
      if (!auto || r.needsLogin) setRefreshError(r.error ?? "Refresh failed");
    }
  };

  // Keep rosters current: refresh in the background (from this browser) when they're more than a few minutes old,
  // on opening My League, on coming back to the tab, and periodically while it's open.
  const latest = useRef({ league, refreshing, refresh });
  useEffect(() => { latest.current = { league, refreshing, refresh }; });
  const leagueId = league ? `${league.provider}:${league.leagueId}` : "";
  useEffect(() => {
    const check = () => {
      const { league: lg, refreshing: busy, refresh: run } = latest.current;
      setNow(Date.now());
      if (!lg || busy || document.visibilityState !== "visible" || !isStale(lg, Date.now())) return;
      if (lg.provider === "espn" && !savedEspnAuth()) return; // don't nag before the user tries a manual refresh
      void run(null, true);
    };
    const t = setTimeout(check, 0);
    const every = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearTimeout(t);
      clearInterval(every);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [leagueId]);
  const fetchedMs = league?.fetchedAt ? Date.parse(league.fetchedAt) : 0;
  const ago = !now || !fetchedMs ? null : (() => {
    const m = Math.max(0, Math.round((now - fetchedMs) / 60_000));
    return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`;
  })();
  // Waivers and power rankings need rosters (and waivers needs your team); the Trades view walks users through that
  const ready = !!league?.rosters?.some((r) => r.playerIds.length || (r.manualIds ?? []).length);
  const sections: { id: Section; label: string; needsMe: boolean }[] = [
    { id: "team", label: "Rosters", needsMe: true },
    { id: "startsit", label: "Start/Sit", needsMe: true },
    { id: "trades", label: "Trades", needsMe: true },
    { id: "waivers", label: "Waivers", needsMe: true },
    { id: "power", label: "Power rankings", needsMe: false },
    { id: "odds", label: "Playoff odds", needsMe: false },
    { id: "luck", label: "Luck meter", needsMe: false },
  ];
  const phase = seasonPhase(props.throughWeek, league, now);
  const weeksLeft = phase.weeksLeft;
  const current = sections.find((s) => s.id === section)!;
  const blocked = section !== "trades" && (!ready || (current.needsMe && !league?.managers.some((m) => m.id === myManager)));
  // Redraft rosters reset after the season, so in-season tools pause until next season (keeper leagues look ahead)
  const offseason = phase.phase === "offseason" && !props.keeper && section !== "luck";

  return (
    <div className="space-y-4">
      {/* Tools grouped by what you're trying to do, with a plain description of the open one */}
      {/* Wraps onto more rows on narrow screens so every tool stays visible (no hidden sideways scroll) */}
      <Glide pill="rounded-lg bg-emerald-500" className="flex flex-wrap gap-x-2 gap-y-2.5">
        {LEAGUE_GROUPS.map((g) => (
          <div key={g.label} className="max-w-full">
            <div className="mb-1 px-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">{g.label}</div>
            <div className="flex flex-wrap rounded-xl bg-slate-900 p-1 ring-1 ring-slate-800">
              {g.ids.map((id) => (
                <button key={id} onClick={() => setSection(id)} title={LEAGUE_HELP[id].what} aria-pressed={section === id} data-active={section === id}
                  className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold ${section === id ? "text-slate-950" : "text-slate-400 hover:text-white"}`}>
                  {LEAGUE_HELP[id].name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Glide>
      <div key={section} data-swipe-surface className={`${secDir > 0 ? "ff-slide-next" : secDir < 0 ? "ff-slide-prev" : "ff-view"} space-y-4`}>
      <p className="-mt-1 text-sm text-slate-300"><b className="text-white">{LEAGUE_HELP[section].name}:</b> {LEAGUE_HELP[section].what}</p>
      {league && !offseason && (
        <div className="flex items-start gap-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-transparent px-4 py-3 ring-1 ring-emerald-500/20">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${phase.phase === "playoffs" ? "animate-pulse bg-amber-400" : "bg-emerald-400"}`} aria-hidden />
          <div className="min-w-0 text-xs">
            <div className="font-semibold text-white">{phase.headline}</div>
            <div className="mt-0.5 text-slate-400">{phase.tip}</div>
          </div>
        </div>
      )}
      {needsLogin && league?.provider === "espn" && (
        <EspnLogin busy={refreshing} error={refreshError && /rejected/i.test(refreshError) ? refreshError : null} onSubmit={(a, remember) => { if (remember) rememberEspnAuth(a); refresh(a); }} />
      )}
      {league && league.provider !== "manual" && !needsLogin && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${refreshing ? "animate-pulse bg-amber-400" : "bg-emerald-400"}`} aria-hidden />
          {refreshing ? "Updating rosters…" : <>Rosters from {league.provider === "espn" ? "ESPN" : "Sleeper"} {ago ? `updated ${ago}` : ""} · auto-refresh every 10 min</>}
          {!refreshing && (
            <button onClick={() => refresh()} className="rounded-md px-2 py-0.5 font-semibold text-emerald-400 hover:bg-slate-900 hover:text-emerald-300">Refresh now</button>
          )}
          {refreshError && !refreshing && <span className="text-rose-300">{refreshError}</span>}
        </div>
      )}
      {offseason && (
        <div className="rounded-xl bg-slate-900/60 p-6 text-sm text-slate-400 ring-1 ring-slate-800">
          The {SOURCE} season is over. In a redraft league everyone starts fresh, so rosters, trades, waivers and power rankings
          return when the next season kicks off. Meanwhile the {TARGET} Big Board and mock drafts are ready, and the Luck meter
          still has this season&apos;s story. In a keeper league? Switch League type to Keeper in settings.
        </div>
      )}
      {!offseason && (section === "trades" || blocked) && (
        <TradeAssistant {...props} weeksLeft={weeksLeft} tradesOpen={phase.tradesOpen} onRefresh={() => refresh()} refreshing={refreshing} refreshError={needsLogin ? null : refreshError} />
      )}
      {!offseason && section === "team" && !blocked && league && myManager && (
        <MyTeam board={props.board} cfg={props.cfg} league={league} myManager={myManager} leaguemates={props.leaguemates}
          weeksLeft={weeksLeft} tradesOpen={phase.tradesOpen} keeper={props.keeper} onGo={setSection} onOpenEditor={props.onOpenEditor} onLeagueEdit={props.onLeagueEdit} />
      )}
      {!offseason && section === "startsit" && !blocked && league && myManager && (
        <StartSit board={props.board} cfg={props.cfg} league={league} myManager={myManager} onRefresh={() => refresh()} refreshing={refreshing} />
      )}
      {!offseason && section === "waivers" && !blocked && league && myManager && (
        <Waivers board={props.board} cfg={props.cfg} league={league} myManager={myManager} weeksLeft={weeksLeft} keeper={props.keeper} />
      )}
      {!offseason && section === "odds" && !blocked && league && (
        <PlayoffOdds board={props.board} cfg={props.cfg} league={league} myManager={myManager} weeksLeft={weeksLeft} onRefresh={() => refresh()} refreshing={refreshing} />
      )}
      {section === "luck" && !blocked && league && (
        <LuckMeter league={league} myManager={myManager} onRefresh={() => refresh()} refreshing={refreshing} />
      )}
      {!offseason && section === "power" && !blocked && league && (
        <PowerRankings board={props.board} cfg={props.cfg} league={league} myManager={myManager} weeksLeft={weeksLeft} keeper={props.keeper} />
      )}
      </div>
    </div>
  );
}
