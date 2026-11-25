"use client";

import { useMemo, useState } from "react";
import type { LeaguemateProfile } from "@/lib/leaguemates";
import type { ImportedLeague, LeagueConfig, Pos, RankedPlayer } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { SOURCE, TARGET } from "@/lib/season";
import {
  type Horizon, type Partner, type TradeEval, type Valued, evaluateTrade, findTrades, playerValue, positionStrength,
} from "@/lib/trade";
import { IconSwap } from "./icons";
import { resolveRoster, unmatchedCount } from "@/lib/rosters";
import { PosBadge, fmt } from "./ui";

interface Props {
  board: RankedPlayer[];
  cfg: LeagueConfig;
  league: ImportedLeague | null;
  myManager: string | null;
  leaguemates: LeaguemateProfile[];
  weeksLeft: number;
  onOpenSettings: () => void;
  onLeagueRefreshed: (l: ImportedLeague) => void;
  onChooseManager: (id: string | null) => void;
  onOpenEditor: () => void;
  /** provided by My League: re-import rosters (handles ESPN login prompts) */
  onRefresh: () => void;
  refreshing: boolean;
  refreshError: string | null;
}


function acceptLabel(a: number) {
  if (a >= 0.6) return { text: "Likely yes", cls: "bg-emerald-500/20 text-emerald-300" };
  if (a >= 0.42) return { text: "Maybe", cls: "bg-amber-500/20 text-amber-300" };
  return { text: "Long shot", cls: "bg-rose-500/15 text-rose-300" };
}

function Players({ ps }: { ps: RankedPlayer[] }) {
  return (
    <div className="space-y-1">
      {ps.map((p) => (
        <div key={p.id} className="flex items-center gap-1.5 text-sm">
          <PosBadge pos={p.pos} />
          <span className="truncate font-medium text-white">{p.name}</span>
          <span className="text-[11px] text-slate-500">{p.team}</span>
        </div>
      ))}
    </div>
  );
}

function TradeCard({ t, partnerName, onAnalyze }: { t: TradeEval; partnerName: string; onAnalyze: () => void }) {
  const a = acceptLabel(t.accept);
  const pct = (x: number, base: number) => `${x >= 0 ? "+" : ""}${((x / Math.max(base, 1)) * 100).toFixed(1)}%`;
  return (
    <div className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-slate-800">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold text-white">with {partnerName}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.cls}`}>{a.text} · {Math.round(t.accept * 100)}%</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-rose-300/80">You give</div>
          <Players ps={t.give} />
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300/80">You get</div>
          <Players ps={t.get} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-slate-400">Your lineup <b className="text-emerald-300">+{fmt(t.myGain, 0)} pts</b> ({pct(t.myGain, t.myBefore)})</span>
        <span className="text-slate-400">Theirs <b className={t.theirGain >= 0 ? "text-emerald-300" : "text-rose-300"}>{t.theirGain >= 0 ? "+" : ""}{fmt(t.theirGain, 0)} pts</b></span>
      </div>
      {t.reasons.length > 0 && <ul className="mt-2 text-[11px] text-slate-500">{t.reasons.slice(0, 3).map((r) => <li key={r}>• {r}</li>)}</ul>}
      <button onClick={onAnalyze} className="mt-3 text-xs font-semibold text-emerald-400 hover:underline">Tweak in the analyzer →</button>
    </div>
  );
}

function Empty({ title, body, action, error }: { title: string; body: string; action?: React.ReactNode; error?: string | null }) {
  return (
    <section className="mx-auto max-w-xl rounded-2xl bg-slate-900 p-8 text-center ring-1 ring-slate-800">
      <IconSwap className="mx-auto h-8 w-8 text-emerald-400" />
      <h2 className="mt-3 text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{body}</p>
      {action && <div className="mt-4">{action}</div>}
      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
    </section>
  );
}

export default function TradeAssistant({ board, cfg, league, myManager, leaguemates, weeksLeft, onOpenSettings, onChooseManager, onOpenEditor, onRefresh, refreshing, refreshError }: Props) {
  const [horizon, setHorizon] = useState<Horizon>(weeksLeft > 2 ? "ros" : "next");
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [give, setGive] = useState<Set<string>>(new Set());
  const [get, setGet] = useState<Set<string>>(new Set());

  const byId = useMemo(() => new Map(board.map((p) => [p.id, p])), [board]);
  const byEspn = useMemo(() => new Map(board.filter((p) => p.espnId).map((p) => [String(p.espnId), p])), [board]);
  const names = useMemo(() => new Map((league?.managers ?? []).map((m) => [m.id, m.name])), [league]);
  const leans = useMemo(() => new Map(leaguemates.map((l) => [l.managerId, l])), [leaguemates]);

  const teams = useMemo(() => {
    if (!league?.rosters) return [];
    return league.rosters.map((r) => {
      const players = resolveRoster(r, byId, byEspn);
      const roster: Valued[] = players.map((p) => ({ p, v: playerValue(p, horizon, weeksLeft) }));
      return { id: r.managerId, name: names.get(r.managerId) ?? `Team ${r.managerId}`, roster, unmatched: unmatchedCount(r, byId, byEspn) };
    });
  }, [league, byId, byEspn, names, horizon, weeksLeft]);

  const me = teams.find((t) => t.id === myManager) ?? null;
  const partners: Partner[] = teams.filter((t) => t.id !== myManager).map((t) => ({ id: t.id, name: t.name, roster: t.roster, lean: leans.get(t.id) }));
  const suggestions = useMemo(
    () => (me ? findTrades(me.roster, partners, cfg) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me, teams, cfg],
  );

  const leagueAvg = useMemo(() => {
    const sums = { QB: 0, RB: 0, WR: 0, TE: 0 } as Record<Pos, number>;
    // Only teams with players count (hand-made leagues may have empty rosters)
    const filled = teams.filter((t) => t.roster.length > 0);
    filled.forEach((t) => { const s = positionStrength(t.roster, cfg); POSITIONS.forEach((p) => (sums[p] += s[p])); });
    POSITIONS.forEach((p) => (sums[p] /= Math.max(filled.length, 1)));
    return sums;
  }, [teams, cfg]);

  const refresh = onRefresh;

  // ------------------------------------------------------------------ empty states
  if (!league) {
    return <Empty error={refreshError} title="Trade assistant" body="Import your league to see trade ideas that improve your starting lineup and that your leaguemates would actually accept."
      action={<button onClick={onOpenSettings} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950">Import your league</button>} />;
  }
  if (!league.rosters) {
    return <Empty error={refreshError} title="Load your league's rosters" body={`${league.name} was imported before rosters were supported. Refresh to load every team's current roster.`}
      action={<button onClick={refresh} disabled={refreshing} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-60">{refreshing ? "Loading…" : "Load rosters"}</button>} />;
  }
  if (league.rosters.every((r) => !r.playerIds.length && !(r.manualIds ?? []).length)) {
    return <Empty error={refreshError} title="Add your league's rosters" body="This league was set up by hand, so it has no rosters yet. Add each team's players in the leaguemate editor."
      action={<button onClick={onOpenEditor} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950">Edit rosters</button>} />;
  }
  if (!me) {
    return <Empty error={refreshError} title="Which team is yours?" body="Pick your team so the assistant knows whose lineup to improve."
      action={
        <select value="" onChange={(e) => onChooseManager(e.target.value || null)}
          className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-200 ring-1 ring-slate-700">
          <option value="">Choose your team…</option>
          {league.managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>} />;
  }

  // ------------------------------------------------------------------ analyzer
  const partner = partners.find((p) => p.id === partnerId) ?? null;
  const giveP = me.roster.filter((x) => give.has(x.p.id)).map((x) => x.p);
  const getP = partner ? partner.roster.filter((x) => get.has(x.p.id)).map((x) => x.p) : [];
  const custom = partner && (giveP.length || getP.length) ? evaluateTrade(me.roster, partner.roster, giveP, getP, cfg, partner.id, partner.lean) : null;
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    fn(n);
  };
  const openInAnalyzer = (t: TradeEval) => {
    setPartnerId(t.partnerId);
    setGive(new Set(t.give.map((p) => p.id)));
    setGet(new Set(t.get.map((p) => p.id)));
    document.getElementById("trade-analyzer")?.scrollIntoView({ behavior: "smooth" });
  };
  const fetched = league.fetchedAt ? new Date(league.fetchedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  const myStrength = positionStrength(me.roster, cfg);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 ring-1 ring-slate-800">
        <div>
          <div className="text-sm font-semibold text-white">Trade assistant · {me.name}</div>
          <div className="text-[11px] text-slate-500">{league.name} · rosters {fetched ? `as of ${fetched}` : "loaded"}{me.unmatched ? ` · ${me.unmatched} of your players (K/DST or deep bench) aren't valued` : ""}</div>
        </div>
        <div className="flex rounded-lg bg-slate-950 p-1 ring-1 ring-slate-800">
          {([["ros", `Rest of ${SOURCE}`], ["next", `${TARGET} season`], ["both", "Both (keeper)"]] as const).map(([h, label]) => (
            <button key={h} onClick={() => setHorizon(h)} disabled={h !== "next" && weeksLeft <= 0}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${horizon === h ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>{label}</button>
          ))}
        </div>
        <button onClick={onOpenEditor} className="ml-auto rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">
          Edit leaguemates &amp; rosters
        </button>
        {league.provider !== "manual" && (
          <button onClick={refresh} disabled={refreshing} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-60">
            {refreshing ? "Refreshing…" : "Refresh rosters"}
          </button>
        )}
        {refreshError && <span className="w-full text-xs text-rose-300">{refreshError}</span>}
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {POSITIONS.map((p) => {
          const diff = leagueAvg[p] > 0 ? myStrength[p] / leagueAvg[p] - 1 : 0;
          return (
            <div key={p} className="rounded-xl bg-slate-900/60 px-3 py-2.5 ring-1 ring-slate-800">
              <div className="flex items-center justify-between"><PosBadge pos={p} /><span className={`text-sm font-bold tabular-nums ${diff >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{diff >= 0 ? "+" : ""}{(diff * 100).toFixed(0)}%</span></div>
              <div className="mt-1 text-[11px] text-slate-500">your starters vs league average</div>
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-white">Suggested trades</h2>
        {suggestions.length === 0 ? (
          <p className="rounded-xl bg-slate-900/60 p-6 text-sm text-slate-400 ring-1 ring-slate-800">No trades found that clearly help you and that the other side would likely take. Try another time frame, or build one below.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((t, i) => (
              <TradeCard key={i} t={t} partnerName={names.get(t.partnerId) ?? "Team"} onAnalyze={() => openInAnalyzer(t)} />
            ))}
          </div>
        )}
      </div>

      <div id="trade-analyzer" className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-slate-800">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-white">Trade analyzer</h2>
          <select value={partnerId ?? ""} onChange={(e) => { setPartnerId(e.target.value || null); setGet(new Set()); }}
            className="ml-auto rounded-md bg-slate-800 px-2 py-1.5 text-sm text-slate-200 ring-1 ring-slate-700">
            <option value="">Trade with…</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[{ title: "You give", roster: me.roster, set: give, fn: setGive }, { title: partner ? `You get from ${partner.name}` : "Pick a team to trade with", roster: partner?.roster ?? [], set: get, fn: setGet }].map((col) => (
            <div key={col.title}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{col.title}</div>
              <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
                {[...col.roster].sort((a, b) => b.v - a.v).map((x) => (
                  <label key={x.p.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm ${col.set.has(x.p.id) ? "bg-emerald-500/10" : "hover:bg-slate-800/60"}`}>
                    <input type="checkbox" checked={col.set.has(x.p.id)} onChange={() => toggle(col.set, x.p.id, col.fn)} className="accent-emerald-500" />
                    <PosBadge pos={x.p.pos} />
                    <span className="flex-1 truncate text-slate-200">{x.p.name}</span>
                    <span className="text-xs tabular-nums text-slate-500">{fmt(x.v, 0)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {custom && (
          <div className="mt-4 grid gap-3 rounded-lg bg-slate-950/60 p-3 sm:grid-cols-3">
            <div><div className="text-[11px] text-slate-500">Your starting lineup</div><div className={`text-lg font-bold tabular-nums ${custom.myGain >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{custom.myGain >= 0 ? "+" : ""}{fmt(custom.myGain, 0)} pts</div></div>
            <div><div className="text-[11px] text-slate-500">Their starting lineup</div><div className={`text-lg font-bold tabular-nums ${custom.theirGain >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{custom.theirGain >= 0 ? "+" : ""}{fmt(custom.theirGain, 0)} pts</div></div>
            <div><div className="text-[11px] text-slate-500">Chance they accept</div><div className="text-lg font-bold tabular-nums text-white">{Math.round(custom.accept * 100)}% <span className={`ml-1 rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold ${acceptLabel(custom.accept).cls}`}>{acceptLabel(custom.accept).text}</span></div></div>
            <p className="text-xs text-slate-400 sm:col-span-3">
              {custom.myGain > 0 && custom.theirGain > 0 ? "Win-win: both starting lineups improve." :
                custom.myGain > 0 ? "Good for you, worse for them: expect pushback or a counter." :
                custom.theirGain > 0 ? "This helps them more than you." : "This makes both lineups worse."}
              {" "}Values are {horizon === "ros" ? `rest-of-${SOURCE} points (${weeksLeft} weeks left)` : horizon === "next" ? `${TARGET} season points` : `rest of ${SOURCE} + ${TARGET} points`} for each team&apos;s best starting lineup, plus a little bench depth.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
