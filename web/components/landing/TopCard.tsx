"use client";

import Link from "next/link";
import { useState } from "react";
import type { Pos } from "@/lib/types";
import { PosBadge } from "../ui";

export interface TopRow { id: string; name: string; team: string; pos: Pos; posRank: number; ppg: number; img: string | null }
type Filter = "ALL" | Pos;
const FILTERS: Filter[] = ["ALL", "QB", "RB", "WR", "TE"];

/** Live top-5 preview from the real board, with position tabs and a rotating glow border. */
export default function TopCard({ lists, target }: { lists: Record<Filter, TopRow[]>; target: number }) {
  const [f, setF] = useState<Filter>("ALL");
  return (
    <div className="relative rounded-2xl p-px">
      {/* rotating gradient border */}
      <div aria-hidden className="absolute inset-0 overflow-hidden rounded-2xl">
        <div className="ff-spin-slow absolute -inset-[60%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(16,185,129,0.9)_60deg,transparent_120deg,transparent_240deg,rgba(34,211,238,0.7)_300deg,transparent_360deg)]" />
      </div>
      <div className="relative rounded-2xl bg-slate-950/95 p-4 shadow-2xl shadow-emerald-500/10 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-1 pb-3">
          <div className="text-sm font-bold text-white">Top 5 for {target}</div>
          <div className="flex rounded-lg bg-slate-900 p-0.5 ring-1 ring-slate-800">
            {FILTERS.map((x) => (
              <button key={x} onClick={() => setF(x)}
                className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${f === x ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>{x}</button>
            ))}
          </div>
        </div>
        <ol className="space-y-1.5">
          {lists[f].map((p, i) => (
            <li key={`${f}-${p.id}`} style={{ animationDelay: `${i * 60}ms` }}
              className="ff-rise group flex items-center gap-3 rounded-xl bg-slate-900/70 px-3 py-2.5 ring-1 ring-slate-800/80 transition hover:-translate-y-0.5 hover:bg-slate-900 hover:ring-emerald-500/40">
              <span className="w-5 text-center text-sm font-black tabular-nums text-slate-500 group-hover:text-emerald-400">{i + 1}</span>
              {p.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.img} alt="" className="h-9 w-9 rounded-full bg-slate-800 object-cover ring-2 ring-transparent transition group-hover:ring-emerald-400/60" />
              ) : (
                <span className="h-9 w-9 rounded-full bg-slate-800" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                <div className="text-[11px] text-slate-500">{p.team}</div>
              </div>
              <PosBadge pos={p.pos} rank={p.posRank} />
              <div className="w-14 text-right">
                <div className="text-sm font-bold tabular-nums text-white">{p.ppg.toFixed(1)}</div>
                <div className="text-[10px] text-slate-500">PPG</div>
              </div>
            </li>
          ))}
        </ol>
        <Link href="/app" className="mt-3 block rounded-xl py-2 text-center text-xs font-semibold text-emerald-300 hover:bg-slate-900">
          See the full board →
        </Link>
      </div>
    </div>
  );
}
