"use client";

import { useMemo, useState } from "react";
import type { Pos, RankedPlayer, TrendData } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { Delta, PosBadge, Sparkline, fmt } from "./ui";
import { SOURCE, TARGET } from "@/lib/season";

interface Mover {
  p: RankedPlayer;
  from: number;
  to: number;
  change: number; // positive = ADP improved (rising)
  ppgFrom: number | null;
  ppgTo: number | null;
  series: (number | null)[];
}

function List({ title, rows, tone }: { title: string; rows: Mover[]; tone: "up" | "down" }) {
  return (
    <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800">
      <h3 className={`border-b border-slate-800 px-4 py-2.5 text-sm font-semibold ${tone === "up" ? "text-emerald-400" : "text-rose-400"}`}>{title}</h3>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">No movers in this window.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-1.5 text-left">Player</th><th className="px-2 py-1.5 text-left">ADP</th><th className="px-2 py-1.5 text-left">Δ</th><th className="px-2 py-1.5 text-left">Proj PPG</th><th className="px-2 py-1.5 text-left">Trend</th></tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.p.id} className="border-t border-slate-800/70">
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <PosBadge pos={m.p.pos} />
                    <span className="truncate font-medium text-white">{m.p.name}</span>
                    <span className="text-[11px] text-slate-500">{m.p.team}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-xs tabular-nums text-slate-400">{Math.round(m.from)} → <span className="text-slate-200">{Math.round(m.to)}</span></td>
                <td className="px-2 py-1.5 text-xs"><Delta value={m.change} /></td>
                <td className="px-2 py-1.5 text-xs tabular-nums text-slate-400">{fmt(m.ppgFrom)} → <span className="text-slate-200">{fmt(m.ppgTo)}</span></td>
                <td className="px-2 py-1.5"><Sparkline values={m.series} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function TrendTracker({ board, trends, throughWeek }: { board: RankedPlayer[]; trends: TrendData; throughWeek: number }) {
  const weeks = trends.weeks;
  const maxWindow = Math.max(1, weeks.length - 1);
  const windows = [1, 3, maxWindow].filter((w, i, a) => w <= maxWindow && a.indexOf(w) === i);
  const [win, setWin] = useState(Math.min(3, maxWindow));
  const [pos, setPos] = useState<Pos | "ALL">("ALL");
  const [maxAdp, setMaxAdp] = useState(180);

  const { risers, fallers } = useMemo(() => {
    const end = weeks.length - 1;
    const startIdx = Math.max(0, end - win);
    const movers: Mover[] = [];
    for (const p of board) {
      if (p.rookie) continue;
      const t = trends.players[p.id];
      if (!t) continue;
      if (pos !== "ALL" && p.pos !== pos) continue;
      const from = t.adp[startIdx];
      const to = t.adp[end];
      if (from == null || to == null) continue;
      if (Math.min(from, to) > maxAdp) continue;
      movers.push({
        p, from, to, change: Math.round(from - to),
        ppgFrom: t.ppg[startIdx], ppgTo: t.ppg[end],
        series: t.adp.slice(startIdx),
      });
    }
    return {
      risers: movers.filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, 15),
      fallers: movers.filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, 15),
    };
  }, [board, trends, weeks, win, pos, maxAdp]);

  const startWeek = weeks[Math.max(0, weeks.length - 1 - win)];


  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-slate-900 p-1 ring-1 ring-slate-800">
          {windows.map((w) => (
            <button key={w} onClick={() => setWin(w)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${win === w ? "bg-slate-700 text-white" : "text-slate-400"}`}>
              {w === maxWindow && w > 3 ? "Season" : `${w} wk`}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg bg-slate-900 p-1 ring-1 ring-slate-800">
          {(["ALL", ...POSITIONS] as const).map((f) => (
            <button key={f} onClick={() => setPos(f)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${pos === f ? "bg-slate-700 text-white" : "text-slate-400"}`}>{f}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Within ADP
          <select value={maxAdp} onChange={(e) => setMaxAdp(Number(e.target.value))}
            className="rounded-md bg-slate-900 px-2 py-1 text-slate-200 ring-1 ring-slate-800">
            {[60, 120, 180, 250].map((v) => <option key={v} value={v}>Top {v}</option>)}
          </select>
        </label>
        <span className="text-xs text-slate-500">Projected {TARGET} ADP, snapshots after {SOURCE} Week {startWeek} → Week {throughWeek}</span>
      </div>
      {weeks.length < 2 ? (
        <p className="rounded-xl bg-slate-900 p-6 text-sm text-slate-400 ring-1 ring-slate-800">
          Only one weekly snapshot so far. Trends appear after the next Tuesday update (or run <code>python scripts/project_2027.py --backfill</code>).
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <List title="Biggest risers" rows={risers} tone="up" />
          <List title="Biggest fallers" rows={fallers} tone="down" />
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        Trends are tracked under the default league_settings.json scoring so week-over-week moves are comparable.
      </p>
    </section>
  );
}
