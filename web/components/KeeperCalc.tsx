"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeagueConfig, RankedPlayer } from "@/lib/types";
import { roundPick } from "@/lib/engine";
import { teamPickIndices } from "@/lib/draft";
import { PosBadge, TierBadge, fmt } from "./ui";
import { IconKeeper } from "./icons";
import { TARGET } from "@/lib/season";

interface Keeper { id: string; round: number }
const KEY = "redraft27.keepers";

/**
 * Keeper value = how much more VORP the player gives you than the player you'd expect to draft with the
 * pick you give up. "Expected" is the average VORP of the five players whose ADP sits around that pick.
 */
export default function KeeperCalc({ board, cfg }: { board: RankedPlayer[]; cfg: LeagueConfig }) {
  const [slot, setSlot] = useState(1);
  const [maxKeep, setMaxKeep] = useState(2);
  const [keepers, setKeepers] = useState<Keeper[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setKeepers(saved.keepers ?? []);
        setSlot(saved.slot ?? 1);
        setMaxKeep(saved.maxKeep ?? 2);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ keepers, slot, maxKeep }));
    } catch {
      /* ignore */
    }
  }, [keepers, slot, maxKeep]);

  const byId = useMemo(() => new Map(board.map((p) => [p.id, p])), [board]);
  const byAdp = useMemo(() => [...board].sort((a, b) => a.cur.adp - b.cur.adp), [board]);
  const myPicks = useMemo(() => teamPickIndices(slot - 1, cfg.teams, cfg.draft_rounds), [slot, cfg.teams, cfg.draft_rounds]);

  const rows = keepers
    .map((k) => {
      const p = byId.get(k.id);
      if (!p) return null;
      const pickIdx = myPicks[Math.min(Math.max(k.round, 1), myPicks.length) - 1];
      const pickNo = pickIdx + 1;
      const around = byAdp.slice(Math.max(0, pickNo - 3), pickNo + 2);
      const expected = around.reduce((s, x) => s + x.cur.vorp, 0) / Math.max(around.length, 1);
      return { k, p, pickNo, expected, surplus: p.cur.vorp - expected, adpGain: pickNo - p.cur.adp };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.surplus - a.surplus);
  const keepIds = new Set(rows.filter((r) => r.surplus > 0).slice(0, maxKeep).map((r) => r.k.id));

  const matches = q.trim().length >= 2
    ? board.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()) && !keepers.some((k) => k.id === p.id)).slice(0, 8)
    : [];
  const add = (p: RankedPlayer) => {
    const guess = Math.min(cfg.draft_rounds, Math.max(1, Math.ceil(p.cur.adp / cfg.teams)));
    setKeepers((ks) => [...ks, { id: p.id, round: guess }]);
    setQ("");
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4 rounded-xl bg-slate-900/60 p-4 ring-1 ring-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white">Keeper calculator</h2>
          <p className="mt-1 text-xs text-slate-400">
            Add the players you could keep and the round each would cost. Value is the {TARGET} VORP you gain over the player
            you&apos;d expect to draft with that pick.
          </p>
        </div>
        <label className="block text-xs text-slate-400">
          Your draft slot
          <select value={slot} onChange={(e) => setSlot(Number(e.target.value))}
            className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm text-slate-200 ring-1 ring-slate-700">
            {Array.from({ length: cfg.teams }, (_, i) => i + 1).map((s) => <option key={s} value={s}>1.{String(s).padStart(2, "0")}</option>)}
          </select>
        </label>
        <label className="block text-xs text-slate-400">
          Keepers allowed
          <select value={maxKeep} onChange={(e) => setMaxKeep(Number(e.target.value))}
            className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm text-slate-200 ring-1 ring-slate-700">
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a player…"
            className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-emerald-500" />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md bg-slate-800 ring-1 ring-slate-700">
              {matches.map((p) => (
                <button key={p.id} onClick={() => add(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-700">
                  <PosBadge pos={p.pos} /> <span className="flex-1 text-white">{p.name}</span>
                  <span className="text-xs text-slate-400">ADP {p.cur.adp}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-800">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <IconKeeper className="h-8 w-8 text-slate-600" />
            <p className="text-sm font-medium text-slate-300">No keeper candidates yet</p>
            <p className="max-w-xs text-xs text-slate-500">Add the players you could keep and the round each would cost. The best values get marked KEEP.</p>
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-900 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Player</th><th className="px-2 py-2 text-left">Cost round</th>
                <th className="px-2 py-2 text-left">Pick given up</th><th className="px-2 py-2 text-left">{TARGET} ADP</th>
                <th className="px-2 py-2 text-left">VORP</th><th className="px-2 py-2 text-left">Expected at pick</th>
                <th className="px-2 py-2 text-left">Keeper value</th><th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.k.id} className={`border-t border-slate-800 ${keepIds.has(r.k.id) ? "bg-emerald-500/10" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <PosBadge pos={r.p.pos} rank={r.p.cur.posRank} />
                      <span className="font-medium text-white">{r.p.name}</span>
                      <TierBadge tier={r.p.cur.tier} />
                      {keepIds.has(r.k.id) && <span className="rounded bg-emerald-500/20 px-1.5 text-[10px] font-bold text-emerald-300">KEEP</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <select value={r.k.round}
                      onChange={(e) => setKeepers((ks) => ks.map((k) => (k.id === r.k.id ? { ...k, round: Number(e.target.value) } : k)))}
                      className="rounded-md bg-slate-800 px-2 py-1 text-sm text-slate-200 ring-1 ring-slate-700">
                      {Array.from({ length: cfg.draft_rounds }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Round {n}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2 tabular-nums text-slate-300">{roundPick(r.pickNo, cfg.teams)} <span className="text-xs text-slate-500">(#{r.pickNo})</span></td>
                  <td className="px-2 py-2 tabular-nums text-slate-300">
                    {r.p.cur.adp}
                    <span className={`ml-1 text-xs ${r.adpGain > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {r.adpGain > 0 ? `${r.adpGain} picks cheap` : `${-r.adpGain} picks pricey`}
                    </span>
                  </td>
                  <td className="px-2 py-2 tabular-nums text-slate-200">{fmt(r.p.cur.vorp, 0)}</td>
                  <td className="px-2 py-2 tabular-nums text-slate-400">{fmt(r.expected, 0)}</td>
                  <td className={`px-2 py-2 font-semibold tabular-nums ${r.surplus > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {r.surplus > 0 ? "+" : ""}{fmt(r.surplus, 0)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button onClick={() => setKeepers((ks) => ks.filter((k) => k.id !== r.k.id))}
                      className="text-xs text-slate-500 hover:text-rose-300" aria-label={`Remove ${r.p.name}`}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
