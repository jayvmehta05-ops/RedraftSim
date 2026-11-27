"use client";

import { useMemo, useState } from "react";
import type { LeaguemateProfile } from "@/lib/leaguemates";
import type { ImportedLeague, LeagueConfig, Pos, RankedPlayer } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { SOURCE } from "@/lib/season";
import {
  type Horizon, type Partner, type TradeEval, type Valued, evaluateTrade, findTrades, lineupSlots, playerValue, positionStrength,
} from "@/lib/trade";
import { IconLock, IconSwap, IconUnlock } from "./icons";
import { HorizonToggle, horizonLabel } from "./Waivers";
import { lockedSet, resolveRoster, toggleLock, unmatchedCount } from "@/lib/rosters";
import { afterLoans } from "@/lib/loans";
import { PosBadge, fmt } from "./ui";
import RateTrade, { applyTradeRating, reportTradeRating } from "./RateTrade";
import { type Rating, boostMine, describeTuning } from "@/lib/tradeTuning";

interface Props {
  board: RankedPlayer[];
  cfg: LeagueConfig;
  league: ImportedLeague | null;
  myManager: string | null;
  leaguemates: LeaguemateProfile[];
  weeksLeft: number;
  /** keeper league: allow valuing next season too */
  keeper: boolean;
  /** false once the league's trade deadline (or the playoffs) has passed */
  tradesOpen: boolean;
  onOpenSettings: () => void;
  onLeagueRefreshed: (l: ImportedLeague) => void;
  onChooseManager: (id: string | null) => void;
  onOpenEditor: () => void;
  /** provided by My League: re-import rosters (handles ESPN login prompts) */
  onRefresh: () => void;
  /** save a hand edit to the league (locking a player) */
  onLeagueEdit: (l: ImportedLeague) => void;
  refreshing: boolean;
  refreshError: string | null;
}


export function acceptLabel(a: number) {
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

/** Your healthy players per position, before -> after, plus warnings when the trade leaves you short. */
export function DepthNote({ t }: { t: TradeEval }) {
  if (!t.depth.length && !t.warnings.length) return null;
  const warned = new Set(t.warnings.map((w) => w.match(/\b(QB|RB|WR|TE)\b/)?.[1]));
  return (
    <div className="mt-2 space-y-1">
      {t.depth.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]" title="Healthy players you'd have at each position, before → after">
          <span className="text-slate-500">Your roster:</span>
          {t.depth.map((d) => (
            <span key={d.pos} className={`rounded-md px-1.5 py-0.5 tabular-nums ring-1 ${warned.has(d.pos) ? "bg-amber-500/10 text-amber-200 ring-amber-500/30" : "bg-slate-800/60 text-slate-300 ring-slate-700/60"}`}>
              {d.pos} {d.before} → {d.after}
            </span>
          ))}
        </div>
      )}
      {t.warnings.map((w) => <p key={w} className="text-[11px] text-amber-300/90">⚠ {w}</p>)}
    </div>
  );
}

/**
 * Your best lineup now and after the trade, spot by spot: players leaving are struck through in red, players
 * arriving are green, and rows that change are highlighted. Bench underneath, then the starting-lineup totals.
 */
export function LineupDiff({ t, cfg }: { t: TradeEval; cfg: LeagueConfig }) {
  const before = lineupSlots(t.rosterBefore, cfg);
  const after = lineupSlots(t.rosterAfter, cfg);
  const giveIds = new Set(t.give.map((p) => p.id));
  const getIds = new Set(t.get.map((p) => p.id));
  const started = (rows: typeof before) => new Set(rows.flatMap((r) => (r.x ? [r.x.p.id] : [])));
  const bench = (r: Valued[], s: Set<string>) => r.filter((x) => !s.has(x.p.id)).sort((a, b) => b.v - a.v);
  const benchB = bench(t.rosterBefore, started(before));
  const benchA = bench(t.rosterAfter, started(after));
  const total = (rows: typeof before) => rows.reduce((n, r) => n + (r.x?.v ?? 0), 0);
  const name = (x: Valued | null, side: "now" | "after") => {
    if (!x) return <span className="italic text-rose-300/80">empty</span>;
    const leaving = side === "now" && giveIds.has(x.p.id);
    const arriving = side === "after" && getIds.has(x.p.id);
    return (
      <span className={`flex min-w-0 items-baseline gap-1 ${leaving ? "text-rose-300" : arriving ? "font-semibold text-emerald-300" : "text-slate-200"}`}>
        <span className={`truncate ${leaving ? "line-through decoration-rose-400/70" : ""}`}>{arriving ? "+ " : ""}{x.p.name}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-slate-500">{fmt(x.v, 0)}</span>
      </span>
    );
  };
  const rows = Math.max(benchB.length, benchA.length);
  return (
    <div className="mt-2 rounded-lg bg-slate-950/60 p-2.5 text-xs ring-1 ring-slate-800">
      <div className="grid grid-cols-[2.6rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-0.5">
        <span />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Now</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">After trade</span>
        {before.map((r, i) => {
          const changed = (r.x?.p.id ?? "") !== (after[i]?.x?.p.id ?? "");
          return (
            <div key={i} className={`col-span-3 grid grid-cols-subgrid items-baseline rounded-md px-1 py-0.5 ${changed ? "bg-slate-800/50" : ""}`}>
              <span className="text-[10px] font-bold text-slate-500">{r.slot}</span>
              {name(r.x, "now")}
              {name(after[i]?.x ?? null, "after")}
            </div>
          );
        })}
        <div className="col-span-3 mt-1 grid grid-cols-subgrid border-t border-slate-800 px-1 pt-1 font-semibold">
          <span className="text-[10px] text-slate-500">Total</span>
          <span className="tabular-nums text-slate-300">{fmt(total(before), 0)} pts</span>
          <span className={`tabular-nums ${total(after) >= total(before) ? "text-emerald-300" : "text-rose-300"}`}>{fmt(total(after), 0)} pts</span>
        </div>
        {rows > 0 && (
          <>
            <span className="col-span-3 mt-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Bench</span>
            {Array.from({ length: rows }, (_, i) => (
              <div key={`b${i}`} className="col-span-3 grid grid-cols-subgrid items-baseline px-1 py-0.5">
                <span className="text-[10px] text-slate-600">{benchB[i]?.p.pos ?? benchA[i]?.p.pos}</span>
                {benchB[i] ? name(benchB[i], "now") : <span />}
                {benchA[i] ? name(benchA[i], "after") : <span />}
              </div>
            ))}
          </>
        )}
      </div>
      <p className="mt-2 px-1 text-[10px] text-slate-500">Numbers are each player&apos;s projected points for the rest of the season. Kickers and defenses aren&apos;t shown.</p>
    </div>
  );
}

/** Stable identity for a trade idea (so a rated card keeps its state when the list re-sorts). */
export const tradeKey = (t: TradeEval) => `${t.partnerId}:${t.give.map((p) => p.id).sort().join(",")}>${t.get.map((p) => p.id).sort().join(",")}`;

export function TradeCard({ t, partnerName, onAnalyze, note, cfg, onRate }: { t: TradeEval; partnerName: string; onAnalyze?: () => void; note?: string; cfg?: LeagueConfig; onRate?: (r: Rating) => void }) {
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
        <span className="text-slate-400">Your lineup <b className={t.myGain >= 0 ? "text-emerald-300" : "text-rose-300"}>{t.myGain >= 0 ? "+" : ""}{fmt(t.myGain, 0)} pts</b> ({pct(t.myGain, t.myBefore)})</span>
        <span className="text-slate-400">Theirs <b className={t.theirGain >= 0 ? "text-emerald-300" : "text-rose-300"}>{t.theirGain >= 0 ? "+" : ""}{fmt(t.theirGain, 0)} pts</b></span>
      </div>
      {t.reasons.length > 0 && <ul className="mt-2 text-[11px] text-slate-500">{t.reasons.slice(0, 3).map((r) => <li key={r}>• {r}</li>)}</ul>}
      <DepthNote t={t} />
      {cfg && (
        <details className="group mt-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300">
            See your lineup before → after
            <span aria-hidden className="inline-block transition-transform duration-300 group-open:rotate-90">›</span>
          </summary>
          <LineupDiff t={t} cfg={cfg} />
        </details>
      )}
      {note && <p className="mt-2 text-[11px] text-amber-300/90">{note}</p>}
      {onAnalyze && <button onClick={onAnalyze} className="mt-3 text-xs font-semibold text-emerald-400 hover:underline">Tweak in the analyzer →</button>}
      {onRate && <RateTrade t={t} onRate={onRate} />}
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

export default function TradeAssistant({ board, cfg, league, myManager, leaguemates, weeksLeft, keeper, tradesOpen, onOpenSettings, onChooseManager, onOpenEditor, onRefresh, onLeagueEdit, refreshing, refreshError }: Props) {
  const [picked, setHorizon] = useState<Horizon>("ros");
  const horizon: Horizon = keeper ? (weeksLeft > 0 ? picked : "both") : "ros"; // offseason keeper leagues look ahead
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [give, setGive] = useState<Set<string>>(new Set());
  const [get, setGet] = useState<Set<string>>(new Set());

  const byId = useMemo(() => new Map(board.map((p) => [p.id, p])), [board]);
  const byEspn = useMemo(() => new Map(board.filter((p) => p.espnId).map((p) => [String(p.espnId), p])), [board]);
  const names = useMemo(() => new Map((league?.managers ?? []).map((m) => [m.id, m.name])), [league]);
  const leans = useMemo(() => new Map(leaguemates.map((l) => [l.managerId, l])), [leaguemates]);
  const locked = useMemo(() => lockedSet(league), [league]);
  const tuning = league?.rules?.tradeTuning;
  const tuned = describeTuning(tuning);
  const [rated, setRated] = useState<string | null>(null); // confirmation after a rating (the card may drop out of the list)
  const rate = (t: TradeEval, r: Rating) => {
    if (!league) return;
    onLeagueEdit(applyTradeRating(league, t, r));
    reportTradeRating(t, r, league.provider);
    setRated(r.vote === "up" ? "Thanks for the rating." : "Thanks. Suggestions below are updated for your rating.");
  };

  // Rosters as they'll be once 1-week loans end (players you lent out count as yours, borrowed ones as theirs),
  // with any players you said you're underselling valued higher on your side
  const teams = useMemo(() => {
    if (!league?.rosters) return [];
    const raw = league.rosters.map((r) => {
      const players = resolveRoster(r, byId, byEspn);
      const roster: Valued[] = players.map((p) => ({ p, v: playerValue(p, horizon, weeksLeft) }));
      return { id: r.managerId, name: names.get(r.managerId) ?? `Team ${r.managerId}`, roster, unmatched: unmatchedCount(r, byId, byEspn) };
    });
    return boostMine(afterLoans(raw, league.rules?.loans), myManager, league.rules?.tradeTuning);
  }, [league, byId, byEspn, names, horizon, weeksLeft, myManager]);

  const me = teams.find((t) => t.id === myManager) ?? null;
  const partners: Partner[] = teams.filter((t) => t.id !== myManager).map((t) => ({ id: t.id, name: t.name, roster: t.roster, lean: leans.get(t.id) }));
  const suggestions = useMemo(
    () => (me ? findTrades(me.roster, partners, cfg, undefined, locked, tuning) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me, teams, cfg, locked, tuning],
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
    return <Empty error={refreshError} title="Import your league to unlock My League" body="Start/sit, waivers, trade ideas, power rankings, playoff odds and the luck meter all run on your league's real rosters and scoring. Paste a Sleeper or ESPN league ID, or set one up by hand."
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
  const giveP = me.roster.filter((x) => give.has(x.p.id) && !locked.has(x.p.id)).map((x) => x.p);
  const getP = partner ? partner.roster.filter((x) => get.has(x.p.id) && !locked.has(x.p.id)).map((x) => x.p) : [];
  const custom = partner && (giveP.length || getP.length) ? evaluateTrade(me.roster, partner.roster, giveP, getP, cfg, partner.id, partner.lean, undefined, true, tuning) : null;
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
        <HorizonToggle horizon={horizon} setHorizon={setHorizon} keeper={keeper} />
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

      {!tradesOpen ? (
        <div className="rounded-xl bg-slate-900/60 p-6 text-sm text-slate-400 ring-1 ring-slate-800">
          <div className="font-semibold text-white">Trades are closed for the season</div>
          Your league&apos;s trade deadline has passed{weeksLeft > 0 ? " (or the playoffs have started)" : ""}, so trade ideas are switched off.
          From here it&apos;s lineups and waivers: use Start/Sit every week and Waivers for pickups.
        </div>
      ) : (<>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-white">Suggested trades</h2>
        {rated && <p className="ff-fade mb-2 text-xs text-emerald-300">{rated}</p>}
        {tuned.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-500/5 px-3 py-2 text-xs text-slate-300 ring-1 ring-emerald-500/20">
            <span><b className="text-emerald-300">Tuned by your ratings:</b> {tuned.join("; ")}.</span>
            <button onClick={() => { onLeagueEdit({ ...league, rules: { ...league.rules, tradeTuning: undefined } }); setRated(null); }}
              className="ml-auto rounded-md px-2 py-0.5 font-semibold text-slate-400 hover:bg-slate-800 hover:text-white">Reset</button>
          </div>
        )}
        {suggestions.length === 0 ? (
          <p className="rounded-xl bg-slate-900/60 p-6 text-sm text-slate-400 ring-1 ring-slate-800">No trades found that clearly help you and that the other side would likely take. Try another time frame, or build one below.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((t) => (
              <TradeCard key={tradeKey(t)} t={t} cfg={cfg} partnerName={names.get(t.partnerId) ?? "Team"} onAnalyze={() => openInAnalyzer(t)} onRate={(r) => rate(t, r)} />
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
                {[...col.roster].sort((a, b) => b.v - a.v).map((x) => {
                  const isLocked = locked.has(x.p.id);
                  return (
                    <div key={x.p.id} className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${isLocked ? "opacity-60" : col.set.has(x.p.id) ? "bg-emerald-500/10" : "hover:bg-slate-800/60"}`}>
                      <input type="checkbox" checked={col.set.has(x.p.id) && !isLocked} disabled={isLocked} aria-label={`Include ${x.p.name}`}
                        onChange={() => toggle(col.set, x.p.id, col.fn)} className="accent-emerald-500 disabled:cursor-not-allowed" />
                      <PosBadge pos={x.p.pos} />
                      <span className="flex-1 truncate text-slate-200">{x.p.name}{isLocked && <span className="ml-1.5 text-[10px] font-semibold text-amber-300">can&apos;t be traded</span>}</span>
                      <span className="text-xs tabular-nums text-slate-500">{fmt(x.v, 0)}</span>
                      {league && (
                        <button type="button" onClick={() => { col.fn(new Set([...col.set].filter((id) => id !== x.p.id))); onLeagueEdit(toggleLock(league, x.p.id)); }}
                          title={isLocked ? "Locked: can't be traded (e.g. on a 1-week trade). Click to unlock." : "Lock: mark as can't be traded (e.g. on a 1-week trade)"}
                          aria-label={isLocked ? `Unlock ${x.p.name}` : `Lock ${x.p.name}`}
                          className={`rounded p-1 ${isLocked ? "text-amber-300 hover:bg-amber-500/10" : "text-slate-600 hover:bg-slate-800 hover:text-slate-300"}`}>
                          {isLocked ? <IconLock className="h-3.5 w-3.5" /> : <IconUnlock className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <IconLock className="h-3 w-3" /> Lock a player who can&apos;t be traded right now (for example he&apos;s on a 1-week trade). Locked players still count in lineups but are never suggested.
        </p>
        {custom && (
          <div className="mt-4 grid gap-3 rounded-lg bg-slate-950/60 p-3 sm:grid-cols-3">
            <div><div className="text-[11px] text-slate-500">Your starting lineup</div><div className={`text-lg font-bold tabular-nums ${custom.myGain >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{custom.myGain >= 0 ? "+" : ""}{fmt(custom.myGain, 0)} pts</div></div>
            <div><div className="text-[11px] text-slate-500">Their starting lineup</div><div className={`text-lg font-bold tabular-nums ${custom.theirGain >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{custom.theirGain >= 0 ? "+" : ""}{fmt(custom.theirGain, 0)} pts</div></div>
            <div><div className="text-[11px] text-slate-500">Chance they accept</div><div className="text-lg font-bold tabular-nums text-white">{Math.round(custom.accept * 100)}% <span className={`ml-1 rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold ${acceptLabel(custom.accept).cls}`}>{acceptLabel(custom.accept).text}</span></div></div>
            <p className="text-xs text-slate-400 sm:col-span-3">
              {custom.myGain > 0 && custom.theirGain > 0 ? "Win-win: both starting lineups improve." :
                custom.myGain > 0 ? "Good for you, worse for them: expect pushback or a counter." :
                custom.theirGain > 0 ? "This helps them more than you." : "This makes both lineups worse."}
              {" "}Values are {horizon === "ros" ? `rest-of-${SOURCE} points (${weeksLeft} weeks left)` : `${horizonLabel(horizon)} points`} for each team&apos;s best starting lineup, plus bench depth (your first backup at each position counts most).
            </p>
            <div className="sm:col-span-3"><DepthNote t={custom} /><LineupDiff t={custom} cfg={cfg} /></div>
          </div>
        )}
      </div>
      </>)}
    </section>
  );
}
