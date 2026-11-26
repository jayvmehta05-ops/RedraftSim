"use client";

import { useMemo, useState } from "react";
import { boardMaps } from "@/lib/rosters";
import type { ImportedLeague, Loan, RankedPlayer } from "@/lib/types";

/** "Was this a 1-week trade?" for swaps noticed on a roster refresh. */
export function LoanPrompt({ board, league, myManager, onLeagueEdit }: {
  board: RankedPlayer[]; league: ImportedLeague; myManager: string | null; onLeagueEdit: (l: ImportedLeague) => void;
}) {
  const { byId, byEspn } = useMemo(() => boardMaps(board), [board]);
  const pending = league.rules?.pendingTrades ?? [];
  if (!pending.length || !myManager) return null;
  const idType = league.rosters?.find((r) => r.managerId === myManager)?.idType ?? "sleeper";
  const find = (pid: string) => (idType === "espn" ? byEspn.get(pid) : byId.get(pid));
  const names = (ids: string[]) => ids.map((id) => find(id)?.name ?? "a player").join(", ");
  const teamName = (id: string) => league.managers.find((m) => m.id === id)?.name ?? "another team";
  const settle = (i: number, loan: boolean) => {
    const p = pending[i];
    const rest = pending.filter((_, j) => j !== i);
    const loans: Loan[] = [...(league.rules?.loans ?? [])];
    if (loan) {
      for (const pid of p.sent) { const pl = find(pid); if (pl) loans.push({ playerId: pl.id, pid, owner: myManager, holder: p.partner, week: p.week }); }
      for (const pid of p.got) { const pl = find(pid); if (pl) loans.push({ playerId: pl.id, pid, owner: p.partner, holder: myManager, week: p.week }); }
    }
    onLeagueEdit({ ...league, rules: { ...league.rules, loans, pendingTrades: rest } });
  };
  return (
    <div className="space-y-2">
      {pending.map((p, i) => (
        <div key={`${p.partner}-${i}`} className="ff-pop rounded-xl bg-sky-500/10 px-4 py-3 text-sm ring-1 ring-sky-500/30">
          <div className="font-semibold text-white">New trade with {teamName(p.partner)}</div>
          <div className="mt-0.5 text-xs text-slate-300">You sent <b>{names(p.sent)}</b> and got <b>{names(p.got)}</b>. Was it a 1-week trade?</div>
          <div className="mt-1 text-[11px] text-slate-400">If it was, trade ideas keep counting {p.sent.length === 1 ? "him" : "them"} as yours, and the loan clears once everyone is back.</div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => settle(i, true)} className="rounded-md bg-sky-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-sky-300">Yes, 1-week trade</button>
            <button onClick={() => settle(i, false)} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700">No, it&apos;s permanent</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mark a player as on a 1-week loan, from the player's action panel on Rosters. */
export function LoanControls({ player, holderId, myManager, league, week, onLeagueEdit }: {
  player: RankedPlayer; holderId: string; myManager: string; league: ImportedLeague; week: number; onLeagueEdit: (l: ImportedLeague) => void;
}) {
  const [from, setFrom] = useState("");
  const loans = league.rules?.loans ?? [];
  const current = loans.find((l) => l.playerId === player.id && l.holder === holderId);
  const save = (next: Loan[]) => onLeagueEdit({ ...league, rules: { ...league.rules, loans: next } });
  const btn = "rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-200 ring-1 ring-sky-500/30 hover:bg-sky-500/25";
  if (current) {
    return <button className={btn} onClick={() => save(loans.filter((l) => l !== current))}>Not on loan anymore</button>;
  }
  if (holderId !== myManager) {
    return (
      <button className={btn} title="He's on their roster this week but comes back to you: trade ideas will count him as yours"
        onClick={() => save([...loans, { playerId: player.id, owner: myManager, holder: holderId, week }])}>
        He&apos;s mine (1-week loan)
      </button>
    );
  }
  return (
    <select value={from} aria-label="On loan from"
      onChange={(e) => { const owner = e.target.value; setFrom(""); if (owner) save([...loans, { playerId: player.id, owner, holder: myManager, week }]); }}
      className="rounded-lg bg-slate-800 px-2 py-1.5 text-xs text-slate-200 ring-1 ring-slate-700">
      <option value="">On a 1-week loan from…</option>
      {league.managers.filter((m) => m.id !== myManager).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}
