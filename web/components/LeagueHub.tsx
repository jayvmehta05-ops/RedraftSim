"use client";

import { useState } from "react";
import type { LeaguemateProfile } from "@/lib/leaguemates";
import type { ImportedLeague, LeagueConfig, RankedPlayer } from "@/lib/types";
import PowerRankings from "./PowerRankings";
import TradeAssistant from "./TradeAssistant";
import Waivers from "./Waivers";

type Section = "trades" | "waivers" | "power";

/** "My League": trades, waivers and power rankings for an imported (or hand-made) league. */
export default function LeagueHub(props: {
  board: RankedPlayer[]; cfg: LeagueConfig; league: ImportedLeague | null; myManager: string | null;
  leaguemates: LeaguemateProfile[]; weeksLeft: number; onOpenSettings: () => void;
  onLeagueRefreshed: (l: ImportedLeague) => void; onChooseManager: (id: string | null) => void; onOpenEditor: () => void;
}) {
  const [section, setSection] = useState<Section>("trades");
  const { league, myManager } = props;
  // Waivers and power rankings need rosters (and waivers needs your team); the Trades view walks users through that
  const ready = !!league?.rosters?.some((r) => r.playerIds.length || (r.manualIds ?? []).length);
  const sections: { id: Section; label: string; needsMe: boolean }[] = [
    { id: "trades", label: "Trades", needsMe: true },
    { id: "waivers", label: "Waivers", needsMe: true },
    { id: "power", label: "Power rankings", needsMe: false },
  ];
  const current = sections.find((s) => s.id === section)!;
  const blocked = section !== "trades" && (!ready || (current.needsMe && !league?.managers.some((m) => m.id === myManager)));

  return (
    <div className="space-y-4">
      <div className="flex max-w-full overflow-x-auto rounded-xl bg-slate-900 p-1 ring-1 ring-slate-800 sm:inline-flex">
        {sections.map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${section === s.id ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}>
            {s.label}
          </button>
        ))}
      </div>
      {(section === "trades" || blocked) && <TradeAssistant {...props} />}
      {section === "waivers" && !blocked && league && myManager && (
        <Waivers board={props.board} cfg={props.cfg} league={league} myManager={myManager} weeksLeft={props.weeksLeft} />
      )}
      {section === "power" && !blocked && league && (
        <PowerRankings board={props.board} cfg={props.cfg} league={league} myManager={myManager} weeksLeft={props.weeksLeft} />
      )}
    </div>
  );
}
