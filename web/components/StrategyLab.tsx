"use client";

import { loadBotTuning } from "@/lib/botTuning";
import { useRef, useState } from "react";
import type { LeaguemateProfile } from "@/lib/leaguemates";
import { STRATEGIES, type DraftOutcome, type StrategyResult, simulateDraft, summarize } from "@/lib/strategyLab";
import type { LeagueConfig, RankedPlayer } from "@/lib/types";
import { fmt } from "./ui";

const SIM_OPTIONS = [30, 60, 120];

export default function StrategyLab({ board, cfg, leaguemates, myManager, leagueName }: {
  board: RankedPlayer[]; cfg: LeagueConfig; leaguemates: LeaguemateProfile[]; myManager: string | null; leagueName: string | null;
}) {
  const teams = cfg.teams;
  const reserved = (cfg.roster.K ?? 0) + (cfg.roster.DST ?? 0);
  const rounds = Math.max(1, cfg.draft_rounds - reserved);
  const opponentsAll = leaguemates.filter((m) => m.managerId !== myManager);
  const [slot, setSlot] = useState(1);
  const [sims, setSims] = useState(60);
  const [useLeague, setUseLeague] = useState(true);
  const [chosen, setChosen] = useState<Set<string>>(new Set(STRATEGIES.map((s) => s.id)));
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<{ slot: number; sims: number; rows: StrategyResult[]; league: boolean } | null>(null);
  const cancel = useRef(false);

  const run = () => {
    const strategies = STRATEGIES.filter((s) => chosen.has(s.id));
    if (!strategies.length) return;
    const byAdp = [...board].sort((a, b) => a.cur.adp - b.cur.adp);
    const leagueMode = useLeague && opponentsAll.length > 0;
    const setup = { byAdp, cfg, teams, rounds, userTeam: slot - 1, opponents: leagueMode ? opponentsAll : [], tuning: loadBotTuning() };
    const outcomes = new Map<string, DraftOutcome[]>(strategies.map((s) => [s.id, []]));
    let i = 0;
    cancel.current = false;
    setProgress(0);
    const step = () => {
      if (cancel.current) { setProgress(null); return; }
      const until = Math.min(sims, i + 3);
      for (; i < until; i++) {
        // same seed for every strategy in simulation i: same seats, same bot randomness to start
        for (const s of strategies) outcomes.get(s.id)!.push(simulateDraft(setup, s, 1000 + i * 7919));
      }
      setProgress(i / sims);
      if (i < sims) setTimeout(step, 0);
      else {
        const rows = strategies.map((s) => summarize(s, outcomes.get(s.id)!)).sort((a, b) => b.avgPoints - a.avgPoints);
        setResults({ slot, sims, rows, league: leagueMode });
        setProgress(null);
      }
    };
    setTimeout(step, 0);
  };

  const bpa = results?.rows.find((r) => r.strategy.id === "bpa");
  const best = results?.rows[0];

  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-slate-900 p-5 ring-1 ring-slate-800">
        <h2 className="text-lg font-semibold text-white">Draft strategy lab</h2>
        <p className="mt-1 text-sm text-slate-400">
          Runs full simulated drafts from your slot with your team following each strategy, against the same bots as the mock draft,
          and compares the projected starting lineups. Every strategy faces identical opponents and luck, so the differences come
          from the strategy. Bots include any tuning from your end-of-mock feedback.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Your draft slot</div>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
              {Array.from({ length: teams }, (_, i) => i + 1).map((s) => (
                <button key={s} onClick={() => setSlot(s)}
                  className={`rounded-md py-1.5 text-xs font-semibold tabular-nums ${slot === s ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                  1.{String(s).padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Drafts per strategy</div>
            <div className="flex rounded-lg bg-slate-800 p-1">
              {SIM_OPTIONS.map((n) => (
                <button key={n} onClick={() => setSims(n)} className={`rounded-md px-3 py-1 text-xs font-semibold ${sims === n ? "bg-slate-600 text-white" : "text-slate-400"}`}>{n}</button>
              ))}
            </div>
          </div>
        </div>
        {opponentsAll.length > 0 && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={useLeague} onChange={(e) => setUseLeague(e.target.checked)} className="accent-emerald-500" />
            Draft against my leaguemates{leagueName ? ` (${leagueName})` : ""}
          </label>
        )}
        <div className="mt-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {STRATEGIES.map((s) => (
            <label key={s.id} className={`flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-xs ring-1 ${chosen.has(s.id) ? "bg-emerald-500/10 ring-emerald-500/30" : "bg-slate-950/60 ring-slate-800"}`}>
              <input type="checkbox" checked={chosen.has(s.id)} className="mt-0.5 accent-emerald-500"
                onChange={() => setChosen((c) => { const n = new Set(c); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
              <span><b className="block text-slate-200">{s.label}</b><span className="text-slate-500">{s.desc}</span></span>
            </label>
          ))}
        </div>
        {progress == null ? (
          <button onClick={run} disabled={!chosen.size} className="mt-4 w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600">
            Run {sims * chosen.size} simulated drafts from 1.{String(slot).padStart(2, "0")}
          </button>
        ) : (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>Simulating… {Math.round(progress * 100)}%</span>
              <button onClick={() => (cancel.current = true)} className="text-slate-400 hover:text-white">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {results && best && (
        <div className="space-y-3">
          <div className="rounded-xl bg-emerald-500/10 p-4 ring-1 ring-emerald-500/30">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Best for 1.{String(results.slot).padStart(2, "0")}{results.league ? " against your leaguemates" : ""}</div>
            <div className="mt-1 text-base font-semibold text-white">{best.strategy.label}</div>
            <div className="text-sm text-slate-300">
              {fmt(best.avgPoints, 0)} projected starter points on average
              {bpa && best.strategy.id !== "bpa" && <> (<b className="text-emerald-300">+{fmt(best.avgPoints - bpa.avgPoints, 0)}</b> vs best available)</>}
              , top-3 finish in {Math.round(best.top3 * 100)}% of drafts. Typical start: {best.commonOpening}.
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl ring-1 ring-slate-800">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-900 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <tr><th className="px-3 py-2">Strategy</th><th className="px-3 py-2">Avg starter pts</th><th className="px-3 py-2">vs best avail.</th><th className="px-3 py-2">Avg finish</th><th className="px-3 py-2">Top 3</th><th className="px-3 py-2">Typical start</th><th className="px-3 py-2">Usual 1st pick</th></tr>
              </thead>
              <tbody>
                {results.rows.map((r, i) => {
                  const d = bpa ? r.avgPoints - bpa.avgPoints : 0;
                  return (
                    <tr key={r.strategy.id} className={`border-t border-slate-800 ${i === 0 ? "bg-emerald-500/5" : ""}`}>
                      <td className="px-3 py-2 font-medium text-white">{r.strategy.label}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-200">{fmt(r.avgPoints, 0)}</td>
                      <td className={`px-3 py-2 tabular-nums ${r.strategy.id === "bpa" ? "text-slate-500" : d >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{r.strategy.id === "bpa" ? "—" : `${d >= 0 ? "+" : ""}${fmt(d, 0)}`}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-300">{fmt(r.avgRank, 1)} / {teams}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-300">{Math.round(r.top3 * 100)}%</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{r.commonOpening}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{r.commonFirst}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">
            {results.sims} simulated drafts per strategy. Scores are projected season points for each team&apos;s best starting lineup, so this
            measures how well each plan uses the projections against how your opponents draft. Differences of a few points are noise.
          </p>
        </div>
      )}
    </section>
  );
}
