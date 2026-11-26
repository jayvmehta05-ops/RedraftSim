"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LeaguemateProfile } from "@/lib/leaguemates";
import { boardMaps } from "@/lib/rosters";
import { type ScoutReport, type Tone, scoutLeague } from "@/lib/scouting";
import type { ImportedLeague, LeagueConfig, RankedPlayer } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { type WeekData, statusLabel, weeklyValue } from "@/lib/weekly";
import { useLeagueTeams } from "./useLeagueTeams";
import { PosBadge, fmt } from "./ui";

const TONE: Record<Tone, string> = {
  good: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  bad: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  neutral: "bg-slate-800 text-slate-200 ring-slate-700",
};
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const rec = (r?: ScoutReport["record"]) => (r ? `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}` : "—");

export function ProBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-amber-400 to-orange-400 px-1.5 py-0.5 text-[10px] font-black tracking-wide text-slate-950 ${className}`}>
      PRO
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 ring-1 ring-slate-800">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-base font-bold tabular-nums text-white">{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

function Report({ r, teams }: { r: ScoutReport; teams: number }) {
  return (
    <div className="ff-rise space-y-4 rounded-2xl bg-slate-950 p-4 ring-1 ring-emerald-500/30 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-3xl ring-1 ring-slate-800" aria-hidden>{r.archetype.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400">{r.archetype.label}</div>
          <h3 className="text-xl font-bold text-white">{r.name}{r.isMe && <span className="ml-2 rounded bg-emerald-500/20 px-1.5 align-middle text-[10px] font-bold text-emerald-300">YOU</span>}</h3>
          <p className="mt-1 text-sm text-slate-400">{r.archetype.blurb}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Record" value={rec(r.record)} sub={r.recordRank ? `${ord(r.recordRank)} in standings` : undefined} />
        <Stat label="Roster" value={r.powerRank ? ord(r.powerRank) : "—"} sub="power ranking" />
        <Stat label="Points for" value={r.record ? fmt(r.record.pointsFor, 0) : "—"} sub={r.pfRank ? `${ord(r.pfRank)} of ${teams}` : undefined} />
        <Stat label="Luck" value={r.luck == null ? "—" : `${r.luck >= 0 ? "+" : ""}${r.luck.toFixed(1)}`} sub="wins vs. what scores earned" />
      </div>

      {(r.recent.length > 0 || r.posRank) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {r.recent.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Last {r.recent.length} (newest first)</div>
              <div className="flex gap-1">
                {r.recent.map((x, i) => (
                  <span key={i} className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold ${x === "W" ? "bg-emerald-500/20 text-emerald-300" : x === "L" ? "bg-rose-500/20 text-rose-300" : "bg-slate-800 text-slate-300"}`}>{x}</span>
                ))}
              </div>
            </div>
          )}
          {r.posRank && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Starters rank by position</div>
              <div className="flex flex-wrap gap-2">
                {POSITIONS.map((p) => {
                  const k = r.posRank![p];
                  const c = k <= Math.ceil(teams / 3) ? "text-emerald-300" : k > teams - Math.ceil(teams / 3) ? "text-rose-300" : "text-slate-300";
                  return <span key={p} className="flex items-center gap-1 text-xs"><PosBadge pos={p} /><b className={c}>{ord(k)}</b></span>;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {r.traits.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {r.traits.map((t) => (
            <span key={t.label} title={t.detail} className={`rounded-lg px-2 py-1 text-xs ring-1 ${TONE[t.tone]}`}>
              <b>{t.label}</b> <span className="opacity-75">· {t.detail}</span>
            </span>
          ))}
        </div>
      )}

      {r.playbook.length > 0 && (
        <div className="rounded-xl bg-emerald-500/5 p-4 ring-1 ring-emerald-500/20">
          <div className="text-sm font-semibold text-white">How to play them</div>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
            {r.playbook.map((t) => <li key={t} className="flex gap-2"><span className="text-emerald-400" aria-hidden>→</span><span>{t}</span></li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-slate-800">
          <div className="text-sm font-semibold text-white">Draft habits</div>
          {r.draft ? (
            <dl className="mt-2 space-y-1 text-xs text-slate-400">
              <div className="flex justify-between gap-2"><dt>First QB</dt><dd className="text-slate-200">{r.draft.firstQb != null ? `round ${r.draft.firstQb.toFixed(1)}` : "none drafted"}{r.draft.leagueFirstQb != null && <span className="text-slate-500"> · league {r.draft.leagueFirstQb.toFixed(1)}</span>}</dd></div>
              <div className="flex justify-between gap-2"><dt>First TE</dt><dd className="text-slate-200">{r.draft.firstTe != null ? `round ${r.draft.firstTe.toFixed(1)}` : "none drafted"}{r.draft.leagueFirstTe != null && <span className="text-slate-500"> · league {r.draft.leagueFirstTe.toFixed(1)}</span>}</dd></div>
              <div className="flex justify-between gap-2"><dt>Rounds 1-3 on RBs</dt><dd className="text-slate-200">{Math.round(r.draft.earlyRb * 100)}%<span className="text-slate-500"> · league {Math.round(r.draft.leagueEarlyRb * 100)}%</span></dd></div>
              <div className="flex justify-between gap-2"><dt>Rounds 1-3 on WRs</dt><dd className="text-slate-200">{Math.round(r.draft.earlyWr * 100)}%<span className="text-slate-500"> · league {Math.round(r.draft.leagueEarlyWr * 100)}%</span></dd></div>
              <div className="pt-1 text-[11px] text-slate-500">From {r.draft.drafts} draft{r.draft.drafts === 1 ? "" : "s"} ({r.draft.picks} picks)</div>
            </dl>
          ) : <p className="mt-2 text-xs text-slate-500">No past drafts for this manager yet.</p>}
        </div>
        <div className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-slate-800">
          <div className="text-sm font-semibold text-white">This season&apos;s moves</div>
          {r.activity ? (
            <dl className="mt-2 space-y-1 text-xs text-slate-400">
              <div className="flex justify-between gap-2"><dt>Pickups</dt><dd className="text-slate-200">{r.activity.adds}<span className="text-slate-500">{r.activity.adds > 0 && ` · ${ord(r.activity.addsRank)} most`} · league avg {r.activity.leagueAvgAdds.toFixed(0)}</span></dd></div>
              <div className="flex justify-between gap-2"><dt>Trades</dt><dd className="text-slate-200">{r.activity.trades}{r.activity.trades > 0 && <span className="text-slate-500"> · {ord(r.activity.tradesRank)} most</span>}</dd></div>
              {r.activity.topPartner && <div className="flex justify-between gap-2"><dt>Trades most with</dt><dd className="text-slate-200">{r.activity.topPartner.name} ({r.activity.topPartner.n})</dd></div>}
              {r.activity.faabSpent != null && <div className="flex justify-between gap-2"><dt>FAAB spent</dt><dd className="text-slate-200">${r.activity.faabSpent}{r.activity.maxBid != null && <span className="text-slate-500"> · top bid ${r.activity.maxBid}</span>}</dd></div>}
              {r.activity.afterLoss != null && r.activity.afterWin != null && (
                <div className="flex justify-between gap-2"><dt>Pickups after a loss / win</dt><dd className="text-slate-200">{r.activity.afterLoss.toFixed(1)} / {r.activity.afterWin.toFixed(1)}</dd></div>
              )}
            </dl>
          ) : <p className="mt-2 text-xs text-slate-500">No transaction data yet. Refresh rosters to load it.</p>}
          {r.lineup && (r.lineup.dead.length > 0 || r.lineup.empty > 0) && (
            <p className="mt-2 rounded-md bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-200 ring-1 ring-rose-500/20">
              Lineup right now: {[...r.lineup.dead.map((d) => `${d.p.name} (${d.why})`), r.lineup.empty ? `${r.lineup.empty} empty spot${r.lineup.empty === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Scouting reports on every manager in the league. A Pro feature, free while in beta. */
export default function Scouting({ board, cfg, league, myManager, leaguemates, weeksLeft, onRefresh, refreshing }: {
  board: RankedPlayer[]; cfg: LeagueConfig; league: ImportedLeague; myManager: string | null; leaguemates: LeaguemateProfile[];
  weeksLeft: number; onRefresh: () => void; refreshing: boolean;
}) {
  const { teams } = useLeagueTeams(board, league, "ros", Math.max(1, weeksLeft));
  const [week, setWeek] = useState<WeekData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/week").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled && d && !d.offseason) setWeek(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const reports = useMemo(() => {
    const { byId, byEspn } = boardMaps(board);
    const dead = week ? (p: RankedPlayer) => {
      const w = weeklyValue(p, week, cfg);
      if (w.source !== "out") return null;
      return w.bye ? "on bye" : !w.opp ? "no game" : statusLabel(w.status) ?? "out";
    } : undefined;
    return scoutLeague({ league, teams, cfg, myId: myManager, leaguemates, byId, byEspn, dead });
  }, [board, league, teams, cfg, myManager, leaguemates, week]);
  const others = reports.filter((r) => !r.isMe);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = reports.find((r) => r.id === picked) ?? others[0] ?? reports[0];
  const reportRef = useRef<HTMLDivElement>(null);
  const pick = (id: string) => {
    setPicked(id);
    // On a phone the report sits below the grid of managers: bring it into view
    requestAnimationFrame(() => {
      const el = reportRef.current;
      if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const hasActivity = (league.rosters ?? []).some((r) => r.activity);

  if (!reports.length) {
    return <div className="rounded-xl bg-slate-900/60 p-6 text-sm text-slate-400 ring-1 ring-slate-800">Import a league with rosters to scout your leaguemates.</div>;
  }
  const ordered = [...others, ...reports.filter((r) => r.isMe)];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 ring-1 ring-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">Scouting reports · {league.name} <ProBadge /></div>
          <div className="text-[11px] text-slate-500">How every manager drafts, trades and works waivers, and how to beat them. Free while Pro is in beta.</div>
        </div>
        {!hasActivity && league.provider !== "manual" && (
          <button onClick={onRefresh} disabled={refreshing} className="ml-auto rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:bg-slate-700">
            {refreshing ? "Refreshing…" : "Load trades & pickups"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {ordered.map((r) => (
          <button key={r.id} onClick={() => pick(r.id)}
            className={`rounded-xl p-3 text-left ring-1 transition ${selected?.id === r.id ? "bg-emerald-500/10 ring-emerald-500/50" : "bg-slate-900/60 ring-slate-800 hover:ring-slate-600"}`}>
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden>{r.archetype.emoji}</span>
              <span className="min-w-0 truncate text-sm font-semibold text-white">{r.name}</span>
              {r.isMe && <span className="rounded bg-emerald-500/20 px-1 text-[9px] font-bold text-emerald-300">YOU</span>}
            </div>
            <div className="mt-1 truncate text-[11px] text-slate-400">{r.archetype.label} · {rec(r.record)}</div>
            {r.traits[0] && <div className="mt-1 truncate text-[11px] text-slate-500">{r.traits.slice(0, 2).map((t) => t.label).join(" · ")}</div>}
          </button>
        ))}
      </div>

      <div ref={reportRef} className="scroll-mt-20">{selected && <Report r={selected} teams={reports.length} />}</div>
      <p className="text-[11px] text-slate-500">
        Built from this league&apos;s past drafts, this season&apos;s {league.provider === "espn" ? "transaction totals" : "trades and pickups"}, weekly results and current rosters.
        {league.provider === "espn" && " ESPN reports totals only, so timing patterns (like pickups after a loss) need a Sleeper league."}
      </p>
    </section>
  );
}
