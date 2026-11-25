"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeagueConfig, RankedPlayer } from "@/lib/types";
import { roundPick } from "@/lib/engine";
import { countPositions, scoreCandidates, teamOnClock } from "@/lib/draft";
import { POSITIONS } from "@/lib/types";
import { PosBadge, TierBadge, fmt } from "./ui";

interface SleeperDraft {
  draft_id: string;
  status: string; // pre_draft | drafting | complete | paused
  type: string;   // snake | linear | auction
  settings: { teams: number; rounds: number };
}
interface SleeperPick {
  player_id: string;
  pick_no: number;
  round: number;
  draft_slot: number;
  metadata?: { first_name?: string; last_name?: string; position?: string; team?: string };
}

const POLL_MS = 5000;

/**
 * Live draft assistant for Sleeper drafts. Sleeper's draft API is public and allows browser requests,
 * and its player ids are the same ids this board uses, so picks map straight onto the board.
 */
export default function LiveDraft({ board, cfg }: { board: RankedPlayer[]; cfg: LeagueConfig }) {
  const [input, setInput] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SleeperDraft | null>(null);
  const [picks, setPicks] = useState<SleeperPick[]>([]);
  const [slot, setSlot] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!draftId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const [d, p] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/draft/${draftId}`).then((r) => r.json()),
          fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`).then((r) => r.json()),
        ]);
        if (stop) return;
        if (!d || !d.draft_id) throw new Error("Draft not found. Copy the ID from the Sleeper draft URL.");
        setDraft(d);
        setPicks(Array.isArray(p) ? p : []);
        setError(null);
        setUpdatedAt(new Date().toLocaleTimeString());
        if (d.status !== "complete") timer = setTimeout(load, POLL_MS);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Couldn't reach Sleeper");
      }
    };
    load();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [draftId]);

  const byId = useMemo(() => new Map(board.map((p) => [p.id, p])), [board]);
  const byAdp = useMemo(() => [...board].sort((a, b) => a.cur.adp - b.cur.adp), [board]);
  const teams = draft?.settings.teams ?? cfg.teams;
  const rounds = draft?.settings.rounds ?? cfg.draft_rounds;
  const taken = new Set(picks.map((p) => p.player_id));
  const available = byAdp.filter((p) => !taken.has(p.id));
  const mine = picks.filter((p) => p.draft_slot === slot);
  const myPlayers = mine.map((p) => byId.get(p.player_id)).filter((p): p is RankedPlayer => !!p);
  const pickIdx = picks.length;
  const onClockSlot = draft?.type === "linear" ? (pickIdx % teams) + 1 : teamOnClock(pickIdx, teams) + 1;
  const myOnClock = draft?.status === "drafting" && onClockSlot === slot;
  const liveCfg = { ...cfg, teams, draft_rounds: rounds };
  const suggestions = draft && draft.status !== "complete"
    ? scoreCandidates({
        available, roster: myPlayers, cfg: liveCfg, pickIdx,
        recent: picks.slice(-6).map((p) => byId.get(p.player_id)).filter((p): p is RankedPlayer => !!p),
        picksLeft: Math.max(1, rounds - mine.length),
      }).sort((a, b) => b.score - a.score).slice(0, 6)
    : [];
  const counts = countPositions(myPlayers);

  if (!draftId) {
    return (
      <section className="mx-auto max-w-xl rounded-2xl bg-slate-900 p-6 ring-1 ring-slate-800">
        <h2 className="text-lg font-semibold text-white">Live draft assistant</h2>
        <p className="mt-1 text-sm text-slate-400">
          Follow your real Sleeper draft as it happens: picks disappear from the board automatically and you get ranked
          suggestions for your next pick, using your league settings. Sleeper only for now (ESPN&apos;s draft room needs a login).
        </p>
        <label className="mt-4 block text-xs text-slate-400">
          Sleeper draft ID (the number in sleeper.com/draft/nfl/<b>…</b>)
          <input value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 1180208789911158785"
            className="mt-1 w-full rounded-md bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-emerald-500" />
        </label>
        <button disabled={input.length < 6} onClick={() => setDraftId(input)}
          className="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 disabled:bg-slate-800 disabled:text-slate-600">
          Connect to draft
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 ring-1 ring-slate-800">
        <span className="text-sm text-white">Draft {draftId}</span>
        {draft && <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">{draft.status.replace("_", " ")} · {teams} teams · {rounds} rounds</span>}
        {draft?.status === "drafting" && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${myOnClock ? "animate-pulse bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}>
            {myOnClock ? "You're on the clock" : `Pick ${roundPick(pickIdx + 1, teams)} · slot ${onClockSlot} on the clock`}
          </span>
        )}
        <label className="flex items-center gap-2 text-xs text-slate-400">
          My slot
          <select value={slot} onChange={(e) => setSlot(Number(e.target.value))}
            className="rounded-md bg-slate-800 px-2 py-1 text-slate-200 ring-1 ring-slate-700">
            {Array.from({ length: teams }, (_, i) => i + 1).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <span className="ml-auto text-[11px] text-slate-500">{error ? <span className="text-rose-300">{error}</span> : updatedAt ? `Updated ${updatedAt}` : "Loading…"}</span>
        <button onClick={() => { setDraftId(null); setDraft(null); setPicks([]); }} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">Disconnect</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800">
          <h3 className="border-b border-slate-800 px-4 py-2.5 text-sm font-semibold text-emerald-400">Suggested picks</h3>
          {suggestions.length === 0 ? <p className="p-4 text-sm text-slate-500">{draft?.status === "complete" ? "Draft complete." : "Waiting for the draft…"}</p> : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-1.5 text-left">Player</th><th className="px-2 py-1.5 text-left">ADP</th><th className="px-2 py-1.5 text-left">Tier</th><th className="px-2 py-1.5 text-left">PPG</th><th className="px-2 py-1.5 text-left">VORP</th><th className="px-2 py-1.5 text-left">Why</th></tr>
              </thead>
              <tbody>
                {suggestions.map((s, i) => (
                  <tr key={s.player.id} className={`border-t border-slate-800/70 ${i === 0 ? "bg-emerald-500/10" : ""}`}>
                    <td className="px-3 py-1.5"><div className="flex items-center gap-2"><PosBadge pos={s.player.pos} rank={s.player.cur.posRank} /><span className="font-medium text-white">{s.player.name}</span><span className="text-[11px] text-slate-500">{s.player.team}</span></div></td>
                    <td className="px-2 py-1.5 tabular-nums text-slate-400">{s.player.cur.adp}</td>
                    <td className="px-2 py-1.5"><TierBadge tier={s.player.cur.tier} /></td>
                    <td className="px-2 py-1.5 tabular-nums text-slate-200">{fmt(s.player.cur.ppg)}</td>
                    <td className="px-2 py-1.5 tabular-nums text-slate-300">{fmt(s.player.cur.vorp, 0)}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-400">
                      {s.parts.value > 2 ? `falling ${Math.round(s.parts.value)} past ADP` : s.parts.value < -2 ? `${Math.round(-s.parts.value)} early vs ADP` : "at ADP"}
                      {s.parts.need >= 3 ? " · fills a starter" : s.parts.need < -5 ? " · position full" : ""}
                      {s.parts.run > 0 ? " · positional run" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <aside className="space-y-3">
          <div className="rounded-xl bg-slate-900/60 p-3 ring-1 ring-slate-800">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">My picks (slot {slot})</h3>
            {mine.length === 0 ? <p className="text-xs text-slate-500">None yet.</p> : mine.map((p) => (
              <div key={p.pick_no} className="flex items-center gap-2 py-0.5 text-sm">
                <span className="w-10 text-[11px] text-slate-500">{roundPick(p.pick_no, teams)}</span>
                <span className="flex-1 truncate text-white">{`${p.metadata?.first_name ?? ""} ${p.metadata?.last_name ?? ""}`.trim()}</span>
                <span className="text-[11px] text-slate-400">{p.metadata?.position}</span>
              </div>
            ))}
            <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
              {POSITIONS.map((p) => <div key={p} className="rounded bg-slate-800/60 py-1 text-slate-400">{p} <span className="font-semibold text-white">{counts[p]}</span></div>)}
            </div>
          </div>
          <div className="rounded-xl bg-slate-900/60 p-3 ring-1 ring-slate-800">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Latest picks</h3>
            {picks.slice(-8).reverse().map((p) => (
              <div key={p.pick_no} className="flex items-center gap-2 py-0.5 text-xs">
                <span className="w-10 text-slate-500">{roundPick(p.pick_no, teams)}</span>
                <span className="flex-1 truncate text-slate-200">{`${p.metadata?.first_name ?? ""} ${p.metadata?.last_name ?? ""}`.trim()}</span>
                <span className="text-slate-500">{p.metadata?.position}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
