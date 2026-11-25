"use client";

import { useMemo, useState } from "react";
import { powerRankings } from "@/lib/league";
import { lockedSet, toggleLock } from "@/lib/rosters";
import type { LeaguemateProfile } from "@/lib/leaguemates";
import { SOURCE, TARGET } from "@/lib/season";
import { type Horizon, type Partner, type TradeEval as BaseTrade, type Valued, findTradesFor, lineupSlots, lineupValue, shopPlayer } from "@/lib/trade";
import type { ImportedLeague, LeagueConfig, Pos, RankedPlayer } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { IconLock, IconUnlock } from "./icons";
import { TradeCard } from "./TradeAssistant";
import { type LeagueTeam, useLeagueTeams } from "./useLeagueTeams";
import { HorizonToggle, horizonLabel as labelFor } from "./Waivers";
import { Flags, PosBadge, fmt, thumb } from "./ui";

const POS_NAME: Record<Pos, string> = { QB: "quarterback", RB: "running back", WR: "receiver", TE: "tight end" };
type Mode = "trade" | "week" | "shop";
type TradeEval = BaseTrade & { partnerName?: string };

/** Rest-of-season points per game: ESPN's projection when available, else this season's average. */
const rosPpg = (p: RankedPlayer) => p.cur.espnRosPpg ?? (p.g26 > 0 ? p.cur.ppg26 : null);

function PlayerRow({ slot, x, dim, selected, onClick, rosRank, keeper, locked }: {
  slot?: string; x: Valued | null; dim?: boolean; selected?: boolean; onClick?: () => void; rosRank?: number; keeper?: boolean; locked?: boolean;
}) {
  if (!x) {
    return (
      <div className="flex items-center gap-3 border-b border-slate-800/70 bg-slate-950 px-4 py-2.5 last:border-0">
        <span className="w-12 text-[11px] font-bold text-slate-500">{slot}</span>
        <span className="text-sm italic text-rose-300">Empty: no eligible player on this roster</span>
      </div>
    );
  }
  const p = x.p;
  const img = thumb(p.headshot, 64);
  const ros = rosPpg(p);
  const hurt = p.injury && p.injury !== "Active";
  return (
    <button type="button" onClick={onClick} aria-expanded={selected}
      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-800/70 px-4 py-2.5 text-left transition last:border-0 hover:bg-slate-900 ${selected ? "bg-slate-900 ring-1 ring-emerald-500/40 ring-inset" : dim ? "bg-slate-950/60" : "bg-slate-950"}`}>
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
            {locked && <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 text-[10px] font-bold text-amber-300" title="Can't be traded right now"><IconLock className="h-2.5 w-2.5" />LOCKED</span>}
            <Flags flags={p.flags.filter((f) => f !== "rookie")} notes={p.notes} />
          </div>
          <div className="text-[11px] text-slate-500">{p.team || "FA"}{p.age ? ` · ${p.age.toFixed(0)} yo` : ""}</div>
        </div>
      </div>
      <span title={`Rank at ${p.pos} for the rest of ${SOURCE}`}><PosBadge pos={p.pos} rank={rosRank} /></span>
      <div className="w-16 text-right" title={`Projected points per game for the rest of ${SOURCE}`}>
        <div className="text-sm tabular-nums text-slate-200">{fmt(ros)}</div>
        <div className="text-[10px] text-slate-500">ROS PPG</div>
      </div>
      <div className="w-16 text-right" title={`Points per game so far in ${SOURCE}`}>
        <div className="text-sm tabular-nums text-slate-200">{p.g26 > 0 ? fmt(p.cur.ppg26) : "—"}</div>
        <div className="text-[10px] text-slate-500">{SOURCE} PPG</div>
      </div>
      <div className="hidden w-14 text-right sm:block" title={`Games played in ${SOURCE}`}>
        <div className="text-sm tabular-nums text-slate-200">{p.g26}</div>
        <div className="text-[10px] text-slate-500">games</div>
      </div>
      {keeper && (
        <div className="hidden w-16 text-right sm:block" title={`Projected points per game in ${TARGET} (keeper value)`}>
          <div className="text-sm tabular-nums text-slate-200">{fmt(p.cur.ppg)}</div>
          <div className="text-[10px] text-slate-500">{TARGET} PPG</div>
        </div>
      )}
    </button>
  );
}

/** Actions for a clicked player: trade for them (or a 1-week trade), or shop your own player. */
function PlayerActions({ player, owner, isMine, weekTrades, weeksLeft, onOpenEditor, ideas, isLocked, onToggleLock, tradesOpen }: {
  player: RankedPlayer; owner: LeagueTeam; isMine: boolean; weekTrades: boolean; weeksLeft: number; onOpenEditor: () => void;
  ideas: (mode: Mode) => TradeEval[]; isLocked: boolean; onToggleLock: () => void; tradesOpen: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const results = useMemo(() => (mode && !isLocked ? ideas(mode) : []), [mode, ideas, isLocked]);
  const longShot = results.length > 0 && results.every((t) => t.accept < 0.4);
  const btn = (m: Mode, label: string, sub: string) => (
    <button onClick={() => setMode(m)}
      className={`rounded-lg px-3 py-2 text-left text-xs ring-1 transition ${mode === m ? "bg-emerald-500 text-slate-950 ring-emerald-500" : "bg-slate-900 text-slate-200 ring-slate-700 hover:ring-emerald-500/60"}`}>
      <div className="font-bold">{label}</div>
      <div className={mode === m ? "text-slate-900/80" : "text-slate-500"}>{sub}</div>
    </button>
  );
  return (
    <div className="space-y-3 border-b border-slate-800/70 bg-slate-900/70 px-4 py-3">
      <div className="flex flex-wrap gap-2">
        {!tradesOpen ? (
          <p className="self-center text-xs text-slate-400">Your league&apos;s trade deadline has passed, so trades are closed for the season.</p>
        ) : isLocked ? (
          <p className="self-center text-xs text-amber-200">
            {player.name} is locked, so he can&apos;t be traded and won&apos;t appear in any trade idea. He still counts in {isMine ? "your" : "their"} lineup.
          </p>
        ) : isMine ? (
          btn("shop", `Shop ${player.name.split(" ").slice(-1)[0]}`, "Best offers from every team")
        ) : (
          <>
            {btn("trade", `Trade for ${player.name.split(" ").slice(-1)[0]}`, `Offers ${owner.name} might take`)}
            {weekTrades && weeksLeft > 0 && btn("week", "1-week trade", "Borrow him for this week")}
          </>
        )}
        {tradesOpen && <button onClick={() => { setMode(null); onToggleLock(); }}
          className={`ml-auto inline-flex items-center gap-1.5 self-center rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ${isLocked ? "bg-amber-500/15 text-amber-200 ring-amber-500/40 hover:bg-amber-500/25" : "text-slate-400 ring-slate-700 hover:text-white"}`}
          title="For players on a 1-week trade or otherwise not tradeable">
          {isLocked ? <><IconUnlock className="h-3.5 w-3.5" /> Unlock</> : <><IconLock className="h-3.5 w-3.5" /> Can&apos;t be traded</>}
        </button>}
        {tradesOpen && !isMine && !isLocked && !weekTrades && weeksLeft > 0 && (
          <button onClick={onOpenEditor} className="self-center text-[11px] text-slate-500 hover:text-slate-300">League allows 1-week trades? Turn it on →</button>
        )}
      </div>
      {mode && (
        results.length === 0 ? (
          <p className="text-xs text-slate-400">
            {mode === "shop" ? `No team has an offer for ${player.name} that clearly helps your lineup right now.` : `No offer found. ${owner.name}'s roster may not fit anything you can send.`}
          </p>
        ) : (
          <>
            {longShot && <p className="text-xs text-amber-300">Nothing here is likely to be accepted. These are the closest offers, so you can see the gap.</p>}
            <div className="grid gap-3 md:grid-cols-2">
              {results.map((t, i) => (
                <TradeCard key={i} t={t} partnerName={mode === "shop" ? (t.partnerName ?? "Team") : owner.name}
                  note={mode === "week" ? "1-week trade: values are this week's projected points, and everyone goes back after the week." : undefined} />
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}

/** Rosters: any team's best lineup and bench. Click a player to trade for them, or to shop your own. */
export default function MyTeam({ board, cfg, league, myManager, leaguemates, weeksLeft, tradesOpen, keeper, onGo, onOpenEditor, onLeagueEdit }: {
  board: RankedPlayer[]; cfg: LeagueConfig; league: ImportedLeague; myManager: string; leaguemates: LeaguemateProfile[];
  weeksLeft: number; tradesOpen: boolean; keeper: boolean; onGo: (section: "trades" | "waivers" | "power") => void; onOpenEditor: () => void;
  onLeagueEdit: (l: ImportedLeague) => void;
}) {
  const [picked, setHorizon] = useState<Horizon>("ros");
  const horizon: Horizon = keeper ? (weeksLeft > 0 ? picked : "both") : "ros"; // offseason keeper leagues look ahead
  const [teamId, setTeamId] = useState(myManager);
  const [selected, setSelected] = useState<string | null>(null);
  const { teams } = useLeagueTeams(board, league, horizon, weeksLeft);
  const { teams: weekTeams } = useLeagueTeams(board, league, "week", weeksLeft);
  const leans = useMemo(() => new Map(leaguemates.map((l) => [l.managerId, l])), [leaguemates]);
  const locked = useMemo(() => lockedSet(league), [league]);
  // Rest-of-season rank at each position across the whole board
  const rosRanks = useMemo(() => {
    const out = new Map<string, number>();
    for (const pos of POSITIONS) {
      board.filter((p) => p.pos === pos && !p.rookie).sort((a, b) => (rosPpg(b) ?? -1) - (rosPpg(a) ?? -1)).forEach((p, i) => out.set(p.id, i + 1));
    }
    return out;
  }, [board]);
  const me = teams.find((t) => t.id === myManager);
  const viewing = teams.find((t) => t.id === teamId) ?? me;
  const isMine = viewing?.id === myManager;
  const power = useMemo(() => powerRankings(teams, cfg), [teams, cfg]);
  const view = useMemo(() => {
    if (!viewing) return null;
    const { bench, total } = lineupValue(viewing.roster, cfg);
    return { slots: lineupSlots(viewing.roster, cfg), bench, total };
  }, [viewing, cfg]);

  // Trade ideas for the clicked player, computed on demand
  const ideas = useMemo(() => {
    return (mode: Mode, player: RankedPlayer): TradeEval[] => {
      const pool = mode === "week" ? weekTeams : teams;
      const mine = pool.find((t) => t.id === myManager);
      if (!mine || !viewing) return [];
      const asPartner = (t: LeagueTeam): Partner => ({ id: t.id, name: t.name, roster: t.roster, lean: leans.get(t.id) });
      if (mode === "shop") {
        const names = new Map(pool.map((t) => [t.id, t.name]));
        return shopPlayer(player, mine.roster, pool.filter((t) => t.id !== myManager && t.roster.length).map(asPartner), cfg, 4, locked)
          .map((t) => ({ ...t, partnerName: names.get(t.partnerId) }));
      }
      const owner = pool.find((t) => t.id === viewing.id);
      return owner ? findTradesFor(player, mine.roster, asPartner(owner), cfg, 4, locked) : [];
    };
  }, [teams, weekTeams, myManager, viewing, leans, cfg, locked]);

  if (!me || !viewing || !view) return null;

  const row = power.find((r) => r.id === viewing.id);
  const horizonLabel = labelFor(horizon);
  const sorted = row ? POSITIONS.map((p) => [p, row.strengths[p]] as const).sort((a, b) => a[1] - b[1]) : [];
  const weakest = sorted[0];

  // A few plain-English takeaways (your team only)
  const notes: { text: string; go?: "trades" | "waivers" }[] = [];
  if (isMine) {
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
    const worstSame = stash && view.slots.filter((s) => s.x && s.x.p.pos === stash.p.pos).map((s) => s.x!).sort((a, b) => a.p.cur.points - b.p.cur.points)[0];
    if (keeper && stash && worstSame && stash.p.cur.points > worstSame.p.cur.points) {
      notes.push({ text: `${stash.p.name} sits on your bench but projects better than ${worstSame.p.name} for ${TARGET}. Worth keeping in mind for your keepers.` });
    }
  }

  const rowFor = (x: Valued | null, slot: string, dim?: boolean, key?: string) => (
    <div key={key ?? x?.p.id ?? slot}>
      <PlayerRow slot={slot} x={x} dim={dim} selected={!!x && selected === x.p.id} rosRank={x ? rosRanks.get(x.p.id) : undefined} keeper={keeper} locked={!!x && locked.has(x.p.id)}
        onClick={x ? () => setSelected(selected === x.p.id ? null : x.p.id) : undefined} />
      {x && selected === x.p.id && (
        <PlayerActions key={`${viewing.id}-${x.p.id}`} player={x.p} owner={viewing} isMine={isMine}
          weekTrades={!!league.rules?.weekTrades} weeksLeft={weeksLeft} onOpenEditor={onOpenEditor}
          isLocked={locked.has(x.p.id)} onToggleLock={() => onLeagueEdit(toggleLock(league, x.p.id))} tradesOpen={tradesOpen}
          ideas={(m) => ideas(m, x.p)} />
      )}
    </div>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 ring-1 ring-slate-800">
        <div className="min-w-0">
          <select value={viewing.id} onChange={(e) => { setTeamId(e.target.value); setSelected(null); }} aria-label="Team to view"
            className="max-w-[16rem] truncate rounded-md bg-slate-800 py-1 pr-7 pl-2 text-sm font-semibold text-white ring-1 ring-slate-700">
            {teams.filter((t) => t.roster.length).map((t) => <option key={t.id} value={t.id}>{t.id === myManager ? `${t.name} (you)` : t.name}</option>)}
          </select>
          <div className="mt-1 text-[11px] text-slate-500">
            {viewing.record ? `${viewing.record.wins}-${viewing.record.losses}${viewing.record.ties ? `-${viewing.record.ties}` : ""} · ${fmt(viewing.record.pointsFor, 0)} PF · ` : ""}
            {row ? <>#{row.rank} of {power.length} by projected lineup ({horizonLabel})</> : null}
          </div>
        </div>
        <HorizonToggle horizon={horizon} setHorizon={setHorizon} keeper={keeper} />
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

      <p className="text-xs text-slate-400">
        {!tradesOpen ? "Trades are closed for the season, so this is a view of every roster." : isMine ? "Click one of your players to see what he'd bring back in a trade." : `Click any of ${viewing.name}'s players to see offers they might accept.`}
      </p>

      <div>
        <h3 className="mb-2 text-xs font-bold tracking-wide text-slate-400 uppercase">Best lineup</h3>
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-800">
          {view.slots.map((s, i) => rowFor(s.x, s.slot, false, `${s.slot}-${i}`))}
        </div>
      </div>

      {view.bench.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-slate-400 uppercase">Bench</h3>
          <div className="overflow-hidden rounded-xl ring-1 ring-slate-800">
            {view.bench.map((x) => rowFor(x, "BN", true))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        Best lineup = the starters with the most projected points for the {horizonLabel}, under your league&apos;s roster slots.
        It isn&apos;t a weekly start/sit call (matchups and byes aren&apos;t modeled).
        {viewing.unmatched > 0 && ` ${viewing.unmatched} rostered player${viewing.unmatched === 1 ? " isn't" : "s aren't"} shown (kickers, defenses or players outside our board).`}
        {" "}Wrong players? Refresh rosters in Trades or edit them in the league editor.
      </p>
    </section>
  );
}
