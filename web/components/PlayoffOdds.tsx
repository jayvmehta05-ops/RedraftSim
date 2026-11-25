"use client";

import { useMemo } from "react";
import { type PlayoffOdds as Odds, simulatePlayoffs } from "@/lib/playoffs";
import { lineupValue } from "@/lib/trade";
import type { ImportedLeague, LeagueConfig, RankedPlayer } from "@/lib/types";
import { encodeOdds } from "@/lib/share";
import ShareButton from "./ShareButton";
import { useLeagueTeams } from "./useLeagueTeams";

const pct = (x: number) => (x >= 0.995 ? ">99%" : x <= 0.005 ? (x === 0 ? "0%" : "<1%") : `${Math.round(x * 100)}%`);
const pctTone = (x: number) => (x >= 0.75 ? "text-emerald-300" : x >= 0.4 ? "text-amber-300" : x >= 0.1 ? "text-orange-300" : "text-rose-300");

/** Playoff, bye, top-seed and title odds from 10,000 simulated finishes to the season. */
export default function PlayoffOdds({ board, cfg, league, myManager, weeksLeft, onRefresh, refreshing }: {
  board: RankedPlayer[]; cfg: LeagueConfig; league: ImportedLeague; myManager: string | null; weeksLeft: number;
  onRefresh: () => void; refreshing: boolean;
}) {
  // Each team's projected starting-lineup points per week, from its current roster
  const { teams } = useLeagueTeams(board, league, "ros", Math.max(1, weeksLeft));
  const projected = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of teams) if (t.roster.length) m.set(t.id, lineupValue(t.roster, cfg).starters.reduce((s, x) => s + x.v, 0) / Math.max(1, weeksLeft));
    return m;
  }, [teams, cfg, weeksLeft]);
  const res = useMemo(() => simulatePlayoffs(league, projected, myManager), [league, projected, myManager]);

  if ("error" in res) {
    return (
      <div className="rounded-xl bg-slate-900/60 p-6 text-sm text-slate-400 ring-1 ring-slate-800">
        {league.provider === "manual"
          ? "Playoff odds need your league's schedule, which comes from a Sleeper or ESPN import."
          : "Refresh rosters to load your league's full schedule for playoff odds."}
        {league.provider !== "manual" && (
          <button onClick={onRefresh} disabled={refreshing} className="ml-3 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 disabled:bg-slate-700">
            {refreshing ? "Refreshing…" : "Refresh rosters"}
          </button>
        )}
      </div>
    );
  }
  return <OddsView res={res} myManager={myManager} leagueName={league.name} />;
}

function OddsView({ res, myManager, leagueName }: { res: Odds; myManager: string | null; leagueName: string }) {
  const me = res.me;
  const hasByes = res.teams.some((t) => t.bye > 0);
  const n = res.teams.length;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 ring-1 ring-slate-800">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">Playoff odds</div>
          <div className="text-[11px] text-slate-500">
            {res.sims.toLocaleString("en-US")} simulated finishes · {res.weeksLeft > 0 ? `${res.weeksLeft} regular-season week${res.weeksLeft === 1 ? "" : "s"} left` : "regular season complete"} · top {res.playoffTeams} make the playoffs
          </div>
        </div>
        <ShareButton label="Share card" title={`${leagueName} playoff odds`}
          text={me ? `My playoff odds: ${pct(me.odds)}${me.opponent && me.ifWin != null && me.ifLose != null ? `. Beat ${me.opponent}: ${pct(me.ifWin)}, lose: ${pct(me.ifLose)}` : ""}.` : `Playoff odds for ${leagueName}`}
          build={() => {
            const mine = res.teams.find((t) => t.id === myManager);
            return `/odds/${encodeOdds({
              v: 1, lg: leagueName, wk: res.week, p: res.playoffTeams, me: mine?.name,
              st: me?.opponent && me.ifWin != null && me.ifLose != null ? [me.opponent, Math.round(me.ifWin * 1000), Math.round(me.ifLose * 1000)] : undefined,
              t: res.teams.map((t) => [t.name, t.wins, t.losses, Math.round(t.playoff * 1000), Math.round(t.title * 1000)]),
            })}`;
          }} />
      </div>

      {me && (
        <div className="grid gap-3 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center justify-center rounded-2xl bg-slate-900 px-8 py-5 ring-1 ring-slate-800">
            <div className={`text-5xl font-black tabular-nums ${pctTone(me.odds)}`}>{pct(me.odds)}</div>
            <div className="mt-1 text-xs text-slate-400">your playoff odds</div>
          </div>
          <div className="space-y-2 rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-800">
            {me.opponent && me.ifWin != null && me.ifLose != null && (() => {
              const rows = [
                { label: "Make playoffs", now: me.odds, win: me.ifWin, lose: me.ifLose },
                ...(me.bye && me.bye.ifWin != null && me.bye.ifLose != null ? [{ label: "First-round bye", now: me.bye.now, win: me.bye.ifWin, lose: me.bye.ifLose }] : []),
                ...(me.title.ifWin != null && me.title.ifLose != null ? [{ label: "Win the title", now: me.title.now, win: me.title.ifWin, lose: me.title.ifLose }] : []),
              ];
              const biggest = rows.reduce((b, r) => (Math.abs(r.win - r.lose) > Math.abs(b.win - b.lose) ? r : b), rows[0]);
              return (
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase">This week vs {me.opponent}</div>
                  <table className="mt-1.5 w-full text-sm">
                    <thead><tr className="text-[11px] text-slate-500"><th className="text-left font-medium" /><th className="text-right font-medium text-emerald-300">If you win</th><th className="text-right font-medium text-rose-300">If you lose</th></tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.label} className={r === biggest ? "text-white" : "text-slate-400"}>
                          <td className="py-0.5">{r.label}</td>
                          <td className="py-0.5 text-right font-bold tabular-nums">{pct(r.win)}</td>
                          <td className="py-0.5 text-right font-bold tabular-nums">{pct(r.lose)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {Math.abs(biggest.win - biggest.lose) < 0.01
                      ? "This game barely moves your odds either way."
                      : <>Biggest stake: <b className="text-slate-300">{biggest.label.toLowerCase()}</b>, a {Math.round(Math.abs(biggest.win - biggest.lose) * 100)}-point swing.</>}
                  </div>
                </div>
              );
            })()}
            {me.rootFor.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase">Root for</div>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {me.rootFor.slice(0, 3).map((r) => (
                    <li key={r.winner + r.loser} className="text-slate-300">
                      <b className="text-white">{r.winner}</b> over {r.loser} <span className="text-emerald-300">(+{Math.max(1, Math.round(r.swing * 100))} pts of odds)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!me.opponent && me.rootFor.length === 0 && <div className="text-sm text-slate-400">No regular-season games left: these are your final playoff and title odds.</div>}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-900 text-[11px] text-slate-400 uppercase">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Team</th>
              <th className="px-2 py-2 text-right font-semibold">Record</th>
              <th className="px-2 py-2 text-right font-semibold" title="Average final record across the simulations">Proj.</th>
              <th className="px-2 py-2 text-right font-semibold">Playoffs</th>
              {hasByes && <th className="px-2 py-2 text-right font-semibold">Bye</th>}
              <th className="px-2 py-2 text-right font-semibold">#1 seed</th>
              <th className="px-2 py-2 text-right font-semibold">Title</th>
              <th className="px-4 py-2 text-left font-semibold" title="Chance of finishing at each seed, 1 on the left">Seed range</th>
            </tr>
          </thead>
          <tbody>
            {res.teams.map((t) => {
              const games = t.wins + t.losses + t.ties;
              const totalGames = games + res.weeksLeft;
              const maxSeed = Math.max(...t.seeds);
              return (
                <tr key={t.id} className={`border-t border-slate-800/70 ${t.id === myManager ? "bg-emerald-500/10" : "bg-slate-950"}`}>
                  <td className="max-w-[12rem] truncate px-4 py-2.5 font-semibold text-white">
                    {t.name}{t.id === myManager && <span className="ml-1.5 rounded bg-emerald-500/20 px-1.5 text-[10px] font-bold text-emerald-300">YOU</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-300">{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ""}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-400">{t.projWins.toFixed(1)}-{(totalGames - t.projWins).toFixed(1)}</td>
                  <td className={`px-2 py-2.5 text-right font-bold tabular-nums ${pctTone(t.playoff)}`}>{pct(t.playoff)}</td>
                  {hasByes && <td className="px-2 py-2.5 text-right tabular-nums text-slate-300">{pct(t.bye)}</td>}
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-300">{pct(t.topSeed)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-300">{pct(t.title)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex h-6 items-end gap-px" aria-label="Seed distribution">
                      {t.seeds.map((v, k) => (
                        <span key={k} title={`Seed ${k + 1}: ${pct(v)}`} style={{ height: `${Math.max(2, (v / Math.max(0.01, maxSeed)) * 100)}%` }}
                          className={`w-2 rounded-sm ${k < res.playoffTeams ? "bg-emerald-400/80" : "bg-slate-600"} ${v === 0 ? "opacity-20" : ""}`} />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        How it works: each team&apos;s weekly scoring blends its current roster&apos;s projected starting lineup with how it has actually scored
        (kickers and defenses are covered by a league-wide adjustment). Every simulated season gives each team its own random
        &quot;the projections were off&quot; shift plus normal week-to-week swings (about ±{Math.round(res.sd)} points), plays out your real
        remaining schedule, ranks teams by wins then points for, and plays the bracket{hasByes ? " with byes for the top seeds" : ""}.
        Green bars are playoff seeds out of {n}. Your platform&apos;s tiebreakers may differ slightly.
      </p>
    </section>
  );
}
