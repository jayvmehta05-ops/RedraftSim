"use client";

import { useMemo, useState } from "react";
import { findPickups } from "@/lib/league";
import { SOURCE, TARGET } from "@/lib/season";
import type { Horizon } from "@/lib/trade";
import type { ImportedLeague, LeagueConfig, Pos, RankedPlayer } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { useLeagueTeams } from "./useLeagueTeams";
import { Flags, PosBadge, fmt } from "./ui";

/** Redraft leagues value players for the rest of this season only. Keeper leagues can also count next season. */
export function HorizonToggle({ horizon, setHorizon, keeper }: { horizon: Horizon; setHorizon: (h: Horizon) => void; keeper: boolean }) {
  if (!keeper) return null;
  return (
    <div className="flex rounded-lg bg-slate-950 p-1 ring-1 ring-slate-800">
      {([["ros", "This season"], ["both", `This season + ${TARGET} (keeper)`]] as const).map(([h, label]) => (
        <button key={h} onClick={() => setHorizon(h)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${horizon === h ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>{label}</button>
      ))}
    </div>
  );
}

export const horizonLabel = (h: Horizon) => (h === "both" ? `rest of ${SOURCE} + ${TARGET}` : h === "week" ? "this week" : `rest of ${SOURCE}`);

export default function Waivers({ board, cfg, league, myManager, weeksLeft, keeper }: {
  board: RankedPlayer[]; cfg: LeagueConfig; league: ImportedLeague; myManager: string; weeksLeft: number; keeper: boolean;
}) {
  const [picked, setHorizon] = useState<Horizon>("ros");
  const horizon: Horizon = keeper ? (weeksLeft > 0 ? picked : "both") : "ros"; // offseason keeper leagues look ahead
  const [pos, setPos] = useState<Pos | "ALL">("ALL");
  const { teams, freeAgents } = useLeagueTeams(board, league, horizon, weeksLeft);
  const me = teams.find((t) => t.id === myManager);
  const pickups = useMemo(() => (me ? findPickups(me.roster, freeAgents, cfg) : []), [me, freeAgents, cfg]);
  const shown = pickups.filter((x) => pos === "ALL" || x.add.p.pos === pos);
  if (!me) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 ring-1 ring-slate-800">
        <div>
          <div className="text-sm font-semibold text-white">Waiver wire · {me.name}</div>
          <div className="text-[11px] text-slate-500">{freeAgents.length} unrostered players on our board · ranked by how much each improves your best lineup</div>
        </div>
        <HorizonToggle horizon={horizon} setHorizon={setHorizon} keeper={keeper} />
        <div className="flex rounded-lg bg-slate-950 p-1 ring-1 ring-slate-800">
          {(["ALL", ...POSITIONS] as const).map((f) => (
            <button key={f} onClick={() => setPos(f)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${pos === f ? "bg-slate-700 text-white" : "text-slate-400"}`}>{f}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl bg-slate-900/60 p-6 text-sm text-slate-400 ring-1 ring-slate-800">
          No free agent clearly improves your lineup{pos !== "ALL" ? ` at ${pos}` : ""} right now. Your roster is in good shape, or the best players are already taken.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-800">
          {shown.map((x, i) => {
            const p = x.add.p;
            const dollars = me.faabLeft != null && x.bid.pct ? `$${Math.max(1, Math.round((me.faabLeft * x.bid.pct[0]) / 100))}–${Math.max(1, Math.round((me.faabLeft * x.bid.pct[1]) / 100))}` : null;
            return (
              <div key={p.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-800/70 px-4 py-3 last:border-0 ${i === 0 ? "bg-emerald-500/5" : "bg-slate-950"}`}>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="w-5 text-xs tabular-nums text-slate-500">{i + 1}</span>
                  <PosBadge pos={p.pos} />
                  <span className="truncate font-semibold text-white">{p.name}</span>
                  <span className="text-[11px] text-slate-500">{p.team}</span>
                  <Flags flags={p.flags.filter((f) => f !== "rookie")} notes={p.notes} />
                  {p.espnOwned != null && <span className="text-[10px] text-slate-500">{p.espnOwned.toFixed(0)}% rostered on ESPN</span>}
                </div>
                <div className="text-xs text-slate-400">
                  {x.starts ? <>Starts{x.replaces ? <> over <span className="text-slate-200">{x.replaces.p.name}</span></> : ""}</> : "Depth / bye-week cover"}
                  {x.drop && <> · drop <span className="text-rose-300">{x.drop.p.name}</span></>}
                </div>
                <div className="w-24 text-right">
                  <div className="text-sm font-bold tabular-nums text-emerald-300">+{fmt(x.gain, 0)} pts</div>
                  <div className="text-[10px] text-slate-500">{(x.gainPct * 100).toFixed(1)}% lineup</div>
                </div>
                <div className="w-32 text-right text-[11px]">
                  <div className="font-semibold text-slate-200">{x.bid.label}</div>
                  <div className="text-slate-500">{x.bid.pct ? `${x.bid.pct[0]}–${x.bid.pct[1]}% of FAAB${dollars ? ` (${dollars})` : ""}` : "if you're not using FAAB"}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        Free agents are players on our {board.length}-player board who aren&apos;t on any roster in your imported league (refresh rosters in Trades for the latest).
        Kickers, defenses and players outside our board aren&apos;t included. Check your platform for waiver order and locks.
      </p>
    </section>
  );
}
