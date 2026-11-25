"use client";

import { useMemo, useState } from "react";
import { powerRankings } from "@/lib/league";
import { SOURCE, TARGET } from "@/lib/season";
import { type Horizon, type Valued, lineupSlots, lineupValue } from "@/lib/trade";
import type { ImportedLeague, LeagueConfig, Pos, RankedPlayer } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { useLeagueTeams } from "./useLeagueTeams";
import { HorizonToggle } from "./Waivers";
import { Flags, PosBadge, fmt, thumb } from "./ui";

const POS_NAME: Record<Pos, string> = { QB: "quarterback", RB: "running back", WR: "receiver", TE: "tight end" };

function PlayerRow({ slot, x, dim }: { slot?: string; x: Valued | null; dim?: boolean }) {
  if (!x) {
    return (
      <div className="flex items-center gap-3 border-b border-slate-800/70 bg-slate-950 px-4 py-2.5 last:border-0">
        <span className="w-12 text-[11px] font-bold text-slate-500">{slot}</span>
        <span className="text-sm italic text-rose-300">Empty: no eligible player on your roster</span>
      </div>
    );
  }
  const p = x.p;
  const img = thumb(p.headshot, 64);
  const ros = p.cur.espnRosPpg ?? (p.g26 > 0 ? p.cur.ppg26 : null);
  const hurt = p.injury && p.injury !== "Active";
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-800/70 px-4 py-2.5 last:border-0 ${dim ? "bg-slate-950/60" : "bg-slate-950"}`}>
      {slot && <span className="w-12 text-[11px] font-bold text-slate-400">{slot}</span>}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-full bg-slate-800 object-cover" />
        ) : (
          <span className="h-8 w-8 shrink-0 rounded-full bg-slate-800" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`truncate font-semibold ${dim ? "text-slate-300" : "text-white"}`}>{p.name}</span>
            {hurt && <span className="rounded bg-red-500/20 px-1 text-[10px] font-bold text-red-300" title={p.injuryPart ?? undefined}>{p.injury}</span>}
            <Flags flags={p.flags.filter((f) => f !== "rookie")} notes={p.notes} />
          </div>
          <div className="text-[11px] text-slate-500">{p.team || "FA"}{p.age ? ` · ${p.age.toFixed(0)} yo` : ""}</div>
        </div>
      </div>
      <PosBadge pos={p.pos} rank={p.cur.posRank} />
      <div className="w-16 text-right" title={`Projected points per game for the rest of ${SOURCE}`}>
        <div className="text-sm tabular-nums text-slate-200">{fmt(ros)}</div>
        <div className="text-[10px] text-slate-500">ROS PPG</div>
      </div>
      <div className="w-16 text-right" title={`Projected points per game in ${TARGET}`}>
        <div className="text-sm tabular-nums text-slate-200">{fmt(p.cur.ppg)}</div>
        <div className="text-[10px] text-slate-500">{TARGET} PPG</div>
      </div>
      <div className="hidden w-16 text-right sm:block" title={`Overall rank on the ${TARGET} board`}>
        <div className="text-sm tabular-nums text-slate-200">#{p.cur.rank}</div>
        <div className="text-[10px] text-slate-500">{TARGET} rank</div>
      </div>
    </div>
  );
}

/** "My team": your roster laid out as your best lineup and bench, with how each position group stacks up. */
export default function MyTeam({ board, cfg, league, myManager, weeksLeft, onGo }: {
  board: RankedPlayer[]; cfg: LeagueConfig; league: ImportedLeague; myManager: string; weeksLeft: number;
  onGo: (section: "trades" | "waivers" | "power") => void;
}) {
  const [horizon, setHorizon] = useState<Horizon>(weeksLeft > 2 ? "ros" : "next");
  const { teams } = useLeagueTeams(board, league, horizon, weeksLeft);
  const me = teams.find((t) => t.id === myManager);
  const power = useMemo(() => powerRankings(teams, cfg), [teams, cfg]);
  const view = useMemo(() => {
    if (!me) return null;
    const slots = lineupSlots(me.roster, cfg);
    const { bench, total } = lineupValue(me.roster, cfg);
    return { slots, bench, total };
  }, [me, cfg]);
  if (!me || !view) return null;

  const row = power.find((r) => r.id === me.id);
  const horizonLabel = horizon === "ros" ? `rest of ${SOURCE}` : horizon === "next" ? `${TARGET} season` : `${SOURCE} + ${TARGET}`;
  const sorted = row ? POSITIONS.map((p) => [p, row.strengths[p]] as const).sort((a, b) => a[1] - b[1]) : [];
  const weakest = sorted[0];

  // A few plain-English takeaways
  const notes: { text: string; go?: "trades" | "waivers" }[] = [];
  if (weakest && weakest[1] < -0.05) {
    notes.push({ text: `Your ${POS_NAME[weakest[0]]}s are ${Math.round(-weakest[1] * 100)}% below the league-average starter, your biggest weakness.`, go: "trades" });
  }
  const hurtStarters = view.slots.filter((s) => s.x && ["IR", "Out", "PUP", "Doubtful"].includes(s.x.p.injury ?? ""));
  if (hurtStarters.length) {
    notes.push({ text: `${hurtStarters.map((s) => s.x!.p.name).join(", ")} ${hurtStarters.length === 1 ? "is" : "are"} injured but still in your best lineup on value. Check who's healthy this week.`, go: "waivers" });
  }
  const emptySlots = view.slots.filter((s) => !s.x).length;
  if (emptySlots) notes.push({ text: `${emptySlots} starting spot${emptySlots === 1 ? " has" : "s have"} no eligible player.`, go: "waivers" });
  const stash = [...view.bench].sort((a, b) => b.p.cur.points - a.p.cur.points)[0];
  const worstStarter = view.slots.filter((s) => s.x).map((s) => s.x!).sort((a, b) => a.p.cur.points - b.p.cur.points)[0];
  if (stash && worstStarter && stash.p.cur.points > worstStarter.p.cur.points) {
    notes.push({ text: `${stash.p.name} sits on your bench but projects better than ${worstStarter.p.name} for ${TARGET}. Worth holding in keeper leagues.` });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 ring-1 ring-slate-800">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{me.name}</div>
          <div className="text-[11px] text-slate-500">
            {me.record ? `${me.record.wins}-${me.record.losses}${me.record.ties ? `-${me.record.ties}` : ""} · ${fmt(me.record.pointsFor, 0)} PF · ` : ""}
            {row ? <>#{row.rank} of {power.length} by projected lineup ({horizonLabel})</> : null}
          </div>
        </div>
        <HorizonToggle horizon={horizon} setHorizon={setHorizon} weeksLeft={weeksLeft} />
        <div className="ml-auto text-right">
          <div className="text-lg font-black tabular-nums text-white">{fmt(view.total, 0)}</div>
          <div className="text-[10px] text-slate-500">projected lineup pts</div>
        </div>
      </div>

      {row && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {POSITIONS.map((pos) => {
            const s = row.strengths[pos];
            const w = Math.min(50, Math.abs(s) * 100);
            return (
              <div key={pos} className="rounded-xl bg-slate-900 px-3 py-2.5 ring-1 ring-slate-800">
                <div className="flex items-center justify-between">
                  <PosBadge pos={pos} />
                  <span className={`text-sm font-bold tabular-nums ${s >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{s >= 0 ? "+" : ""}{Math.round(s * 100)}%</span>
                </div>
                <div className="relative mt-2 h-1.5 rounded-full bg-slate-800" aria-hidden>
                  <span className="absolute top-0 left-1/2 h-1.5 w-px bg-slate-600" />
                  <span className={`absolute top-0 h-1.5 rounded-full ${s >= 0 ? "left-1/2 bg-emerald-400" : "right-1/2 bg-rose-400"}`} style={{ width: `${w}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-slate-500">vs league-average starters</div>
              </div>
            );
          })}
        </div>
      )}

      {notes.length > 0 && (
        <ul className="space-y-1.5 rounded-xl bg-slate-900/60 p-3 ring-1 ring-slate-800">
          {notes.map((n) => (
            <li key={n.text} className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="text-emerald-400">●</span>
              <span className="min-w-0 flex-1">{n.text}</span>
              {n.go && (
                <button onClick={() => onGo(n.go!)} className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-slate-700">
                  {n.go === "trades" ? "Find trades" : "Check waivers"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div>
        <h3 className="mb-2 text-xs font-bold tracking-wide text-slate-400 uppercase">Best lineup</h3>
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-800">
          {view.slots.map((s, i) => <PlayerRow key={`${s.slot}-${i}`} slot={s.slot} x={s.x} />)}
        </div>
      </div>

      {view.bench.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-slate-400 uppercase">Bench</h3>
          <div className="overflow-hidden rounded-xl ring-1 ring-slate-800">
            {view.bench.map((x) => <PlayerRow key={x.p.id} slot="BN" x={x} dim />)}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        Best lineup = the starters with the most projected points for the {horizonLabel}, under your league&apos;s roster slots.
        It isn&apos;t a weekly start/sit call (matchups and byes aren&apos;t modeled).
        {me.unmatched > 0 && ` ${me.unmatched} rostered player${me.unmatched === 1 ? " isn't" : "s aren't"} shown (kickers, defenses or players outside our board).`}
        {" "}Wrong players? Refresh rosters in Trades or edit them in the league editor.
      </p>
    </section>
  );
}
