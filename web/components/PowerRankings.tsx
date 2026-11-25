"use client";

import { useMemo, useState } from "react";
import { powerRankings } from "@/lib/league";
import { encodePower } from "@/lib/share";
import type { Horizon } from "@/lib/trade";
import type { ImportedLeague, LeagueConfig, RankedPlayer } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { useLeagueTeams } from "./useLeagueTeams";
import { HorizonToggle, horizonLabel as labelFor } from "./Waivers";
import { PosBadge, fmt } from "./ui";

export default function PowerRankings({ board, cfg, league, myManager, weeksLeft, keeper }: {
  board: RankedPlayer[]; cfg: LeagueConfig; league: ImportedLeague; myManager: string | null; weeksLeft: number; keeper: boolean;
}) {
  const [picked, setHorizon] = useState<Horizon>("ros");
  const horizon: Horizon = keeper ? (weeksLeft > 0 ? picked : "both") : "ros"; // offseason keeper leagues look ahead
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const { teams } = useLeagueTeams(board, league, horizon, weeksLeft);
  const rows = useMemo(() => powerRankings(teams, cfg), [teams, cfg]);
  const horizonLabel = labelFor(horizon);

  const share = async () => {
    const code = encodePower({
      v: 1, lg: league.name, h: horizonLabel,
      t: rows.map((r) => [r.name, r.rank, r.record?.wins ?? 0, r.record?.losses ?? 0, Math.round(r.total), r.best?.name ?? ""]),
    });
    const url = `${window.location.origin}/rankings/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied!");
    } catch {
      window.prompt("Copy your power rankings link:", url);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 ring-1 ring-slate-800">
        <div>
          <div className="text-sm font-semibold text-white">Power rankings · {league.name}</div>
          <div className="text-[11px] text-slate-500">Every team ranked by its best projected starting lineup ({horizonLabel}), next to its actual record</div>
        </div>
        <HorizonToggle horizon={horizon} setHorizon={setHorizon} keeper={keeper} />
        <button onClick={share} className="ml-auto rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400">{shareMsg ?? "Share rankings"}</button>
      </div>

      <div className="overflow-hidden rounded-xl ring-1 ring-slate-800">
        {rows.map((r) => {
          const diff = r.recordRank != null ? r.recordRank - r.rank : null; // positive: better than their record
          const sorted = POSITIONS.map((p) => [p, r.strengths[p]] as const).sort((a, b) => b[1] - a[1]);
          const [bestPos, worstPos] = [sorted[0], sorted[sorted.length - 1]];
          return (
            <div key={r.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800/70 px-4 py-3 last:border-0 ${r.id === myManager ? "bg-emerald-500/10" : "bg-slate-950"}`}>
              <div className="w-8 text-center text-xl font-black tabular-nums text-white">{r.rank}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-white">{r.name}</span>
                  {r.id === myManager && <span className="rounded bg-emerald-500/20 px-1.5 text-[10px] font-bold text-emerald-300">YOU</span>}
                </div>
                <div className="text-[11px] text-slate-500">
                  {r.record ? `${r.record.wins}-${r.record.losses}${r.record.ties ? `-${r.record.ties}` : ""} · ${fmt(r.record.pointsFor, 0)} PF` : "no record"}
                  {diff != null && diff !== 0 && (
                    <span className={diff > 0 ? "text-emerald-400" : "text-rose-400"}> · {diff > 0 ? `${diff} spot${diff === 1 ? "" : "s"} better than their record` : `${-diff} spot${diff === -1 ? "" : "s"} worse than their record`}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <PosBadge pos={bestPos[0]} /><span className="text-emerald-300">{bestPos[1] >= 0 ? "+" : ""}{(bestPos[1] * 100).toFixed(0)}%</span>
                <PosBadge pos={worstPos[0]} /><span className="text-rose-300">{(worstPos[1] * 100).toFixed(0)}%</span>
              </div>
              <div className="hidden w-40 truncate text-[11px] text-slate-400 sm:block">Best: <span className="text-slate-200">{r.best?.name ?? "—"}</span></div>
              <div className="w-20 text-right text-sm font-bold tabular-nums text-white">{fmt(r.total, 0)}<div className="text-[10px] font-normal text-slate-500">proj. pts</div></div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">Strength chips: each team&apos;s best and worst position group compared with the league average starter.</p>
    </section>
  );
}
