"use client";

import { useMemo } from "react";
import { luckTable } from "@/lib/luck";
import { encodeLuck } from "@/lib/share";
import ShareButton from "./ShareButton";
import type { ImportedLeague } from "@/lib/types";
import { fmt } from "./ui";

const rec = (w: number, l: number, t = 0) => `${w}-${l}${t ? `-${t}` : ""}`;

function luckLabel(x: number) {
  if (x >= 1.5) return "Very lucky";
  if (x >= 0.5) return "Lucky";
  if (x > -0.5) return "Fair";
  if (x > -1.5) return "Unlucky";
  return "Very unlucky";
}

/** How much of each team's record is schedule luck: all-play record, expected wins and schedule swaps. */
export default function LuckMeter({ league, myManager, onRefresh, refreshing }: {
  league: ImportedLeague; myManager: string | null; onRefresh: () => void; refreshing: boolean;
}) {
  const rows = useMemo(() => luckTable(league), [league]);

  if (!rows.length) {
    return (
      <div className="rounded-xl bg-slate-900/60 p-6 text-sm text-slate-400 ring-1 ring-slate-800">
        {league.provider === "manual"
          ? "The luck meter needs weekly scores, which come from a Sleeper or ESPN import."
          : "No weekly scores yet. Refresh rosters to load this season's completed weeks."}
        {league.provider !== "manual" && (
          <button onClick={onRefresh} disabled={refreshing}
            className="ml-3 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 disabled:bg-slate-700">
            {refreshing ? "Refreshing…" : "Refresh rosters"}
          </button>
        )}
      </div>
    );
  }

  const me = rows.find((r) => r.id === myManager);
  const maxLuck = Math.max(1, ...rows.map((r) => Math.abs(r.luck)));
  const weeks = rows[0].weeks;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 ring-1 ring-slate-800">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">Luck meter · {league.name}</div>
          <div className="text-[11px] text-slate-500">
            Through {weeks} completed week{weeks === 1 ? "" : "s"}. All-play = your score against every team, every week. Luck = actual wins minus the wins your scores earned.
          </div>
        </div>
        <ShareButton label="Share card" title={`${league.name} luck meter`}
          text={me ? `I'm ${me.wins}-${me.losses} but my scores earned ${me.expectedWins.toFixed(1)} wins. Who's the luckiest in ${league.name}?` : `Who's the luckiest team in ${league.name}?`}
          build={() => `/luck/${encodeLuck({
            v: 1, lg: league.name, wk: weeks, me: me?.name,
            t: rows.map((r) => [r.name, r.wins, r.losses, r.allPlay.wins, r.allPlay.losses, Math.round(r.expectedWins * 10), Math.round(r.luck * 10)]),
          })}`} />
      </div>

      {me && (
        <div className={`rounded-xl p-4 ring-1 ${me.luck >= 0.5 ? "bg-emerald-500/10 ring-emerald-500/30" : me.luck <= -0.5 ? "bg-rose-500/10 ring-rose-500/30" : "bg-slate-900 ring-slate-800"}`}>
          <div className="text-lg font-black text-white">
            You&apos;re {rec(me.wins, me.losses, me.ties)}.{" "}
            {Math.abs(me.luck) < 0.5
              ? "Your record matches your scoring."
              : me.luck > 0
                ? `Your scores earned about ${fmt(me.expectedWins, 1)} wins, so you're ${fmt(me.luck, 1)} win${Math.abs(me.luck) >= 1.05 ? "s" : ""} lucky.`
                : `Your scores earned about ${fmt(me.expectedWins, 1)} wins, so you're ${fmt(-me.luck, 1)} win${Math.abs(me.luck) >= 1.05 ? "s" : ""} unlucky.`}
          </div>
          <div className="mt-1 text-xs text-slate-300">
            Against everyone each week you&apos;d be <b>{rec(me.allPlay.wins, me.allPlay.losses, me.allPlay.ties)}</b>.
            {" "}You&apos;ve faced {me.paRank === 1 ? "the most" : me.paRank === rows.length ? "the fewest" : `the ${ordinal(me.paRank)}-most`} points against in the league.
            {me.bestSwap && me.worstSwap && (
              <> With other teams&apos; schedules your scores go anywhere from <b>{rec(me.worstSwap.wins, me.worstSwap.losses)}</b> ({me.worstSwap.with}&apos;s) to <b>{rec(me.bestSwap.wins, me.bestSwap.losses)}</b> ({me.bestSwap.with}&apos;s).</>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-900 text-[11px] text-slate-400 uppercase">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Team</th>
              <th className="px-2 py-2 text-right font-semibold">Record</th>
              <th className="px-2 py-2 text-right font-semibold">All-play</th>
              <th className="px-2 py-2 text-right font-semibold" title="Wins your weekly scores earned on average">Exp. wins</th>
              <th className="px-2 py-2 text-left font-semibold">Luck</th>
              <th className="px-2 py-2 text-right font-semibold" title="Points scored (rank)">PF</th>
              <th className="px-4 py-2 text-right font-semibold" title="Points against (rank: 1 = toughest schedule)">PA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const w = (Math.abs(r.luck) / maxLuck) * 50;
              return (
                <tr key={r.id} className={`border-t border-slate-800/70 ${r.id === myManager ? "bg-emerald-500/10" : "bg-slate-950"}`}>
                  <td className="max-w-[12rem] truncate px-4 py-2.5 font-semibold text-white">
                    {r.name}{r.id === myManager && <span className="ml-1.5 rounded bg-emerald-500/20 px-1.5 text-[10px] font-bold text-emerald-300">YOU</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-200">{rec(r.wins, r.losses, r.ties)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-400">{rec(r.allPlay.wins, r.allPlay.losses, r.allPlay.ties)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-400">{fmt(r.expectedWins, 1)}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="relative h-1.5 w-24 shrink-0 rounded-full bg-slate-800" aria-hidden>
                        <span className="absolute top-0 left-1/2 h-1.5 w-px bg-slate-600" />
                        <span className={`absolute top-0 h-1.5 rounded-full ${r.luck >= 0 ? "left-1/2 bg-emerald-400" : "right-1/2 bg-rose-400"}`} style={{ width: `${w}%` }} />
                      </div>
                      <span className={`text-xs font-semibold tabular-nums ${r.luck >= 0.5 ? "text-emerald-300" : r.luck <= -0.5 ? "text-rose-300" : "text-slate-400"}`}>
                        {r.luck >= 0 ? "+" : ""}{fmt(r.luck, 1)} <span className="font-normal text-slate-500">{luckLabel(r.luck)}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-400">{fmt(r.pointsFor, 0)} <span className="text-[10px] text-slate-600">#{r.pfRank}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{fmt(r.pointsAgainst, 0)} <span className="text-[10px] text-slate-600">#{r.paRank}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Only regular-season weeks every team has finished are counted. Records here come from those weekly matchups, so they can differ slightly from your platform if it uses median or bonus wins.
      </p>
    </section>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
