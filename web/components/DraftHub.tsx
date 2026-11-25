"use client";

import { useState } from "react";
import type { LeaguemateProfile } from "@/lib/leaguemates";
import type { LeagueConfig, RankedPlayer } from "@/lib/types";
import MockDraft from "./MockDraft";
import StrategyLab from "./StrategyLab";

/** Mock Draft tab: the interactive draft room and the strategy lab. */
export default function DraftHub(props: {
  board: RankedPlayer[]; cfg: LeagueConfig; leaguemates: LeaguemateProfile[]; myManager: string | null;
  leagueName: string | null; onOpenEditor: () => void;
}) {
  const [mode, setMode] = useState<"mock" | "lab">("mock");
  return (
    <div className="space-y-4">
      <div className="flex max-w-full rounded-xl bg-slate-900 p-1 ring-1 ring-slate-800 sm:inline-flex">
        {([["mock", "Mock draft"], ["lab", "Strategy lab"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold sm:flex-none ${mode === id ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>
      {/* Keep the mock mounted so a draft in progress survives switching to the lab */}
      <div className={mode === "mock" ? "" : "hidden"}><MockDraft {...props} /></div>
      {mode === "lab" && (
        <StrategyLab board={props.board} cfg={props.cfg} leaguemates={props.leaguemates} myManager={props.myManager} leagueName={props.leagueName} />
      )}
    </div>
  );
}
