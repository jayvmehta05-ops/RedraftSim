"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LeagueConfig, Pos, RankedPlayer } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { roundPick } from "@/lib/engine";
import {
  BOT_PROFILES, type BotProfile, botPick, countPositions, letterGrade, mulberry32, optimalLineup,
  scoreCandidates, teamOnClock, teamPickIndices,
} from "@/lib/draft";
import { Flags, POS_CELL, PosBadge, TierBadge, fmt } from "./ui";

type Phase = "setup" | "live" | "done";
const SPEEDS = [
  { label: "Instant", ms: 15 },
  { label: "Fast", ms: 180 },
  { label: "Live", ms: 650 },
];

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MockDraft({ board, cfg }: { board: RankedPlayer[]; cfg: LeagueConfig }) {
  const teams = cfg.teams;
  const rounds = cfg.draft_rounds;
  const total = teams * rounds;

  const [rawPhase, setPhase] = useState<Phase>("setup");
  const [slot, setSlot] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [autoMe, setAutoMe] = useState(false);
  const [paused, setPaused] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [locked, setLocked] = useState<{ board: RankedPlayer[]; cfg: LeagueConfig; userTeam: number } | null>(null);
  const [bots, setBots] = useState<(BotProfile | null)[]>([]);
  const [posFilter, setPosFilter] = useState<Pos | "ALL">("ALL");
  const [q, setQ] = useState("");
  const rngRef = useRef<() => number>(() => 0.5);

  const userTeam = rawPhase !== "setup" && locked ? locked.userTeam : slot - 1;
  const phase: Phase = rawPhase === "live" && picks.length >= total ? "done" : rawPhase;
  const lb = locked?.board ?? board;
  const lcfg = locked?.cfg ?? cfg;
  const byId = useMemo(() => new Map(lb.map((p) => [p.id, p])), [lb]);
  const byAdp = useMemo(() => [...lb].sort((a, b) => a.cur.adp - b.cur.adp), [lb]);
  const taken = useMemo(() => new Set(picks), [picks]);
  const available = useMemo(() => byAdp.filter((p) => !taken.has(p.id)), [byAdp, taken]);
  const rosters = useMemo(() => {
    const r: RankedPlayer[][] = Array.from({ length: teams }, () => []);
    picks.forEach((id, i) => r[teamOnClock(i, teams)].push(byId.get(id)!));
    return r;
  }, [picks, byId, teams]);

  const pickIdx = picks.length;
  const onClock = pickIdx < total ? teamOnClock(pickIdx, teams) : -1;
  const userOnClock = phase === "live" && onClock === userTeam && !autoMe;
  const userPickIdx = useMemo(() => teamPickIndices(userTeam, teams, rounds), [userTeam, teams, rounds]);
  const nextUserPick = userPickIdx.find((i) => i >= pickIdx);

  const ctxFor = (team: number) => {
    const myPicks = teamPickIndices(team, teams, rounds);
    return {
      available,
      roster: rosters[team],
      recent: picks.slice(-6).map((id) => byId.get(id)!),
      pickIdx,
      picksLeft: myPicks.filter((i) => i >= pickIdx).length,
      cfg: lcfg,
    };
  };

  const suggestions = useMemo(() => {
    if (phase !== "live" || onClock !== userTeam) return [];
    return scoreCandidates(ctxFor(userTeam)).sort((a, b) => b.score - a.score).slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, onClock, userTeam, available, rosters]);

  // Bot (and auto-me) picks
  useEffect(() => {
    if (phase !== "live" || paused || pickIdx >= total) return;
    if (onClock === userTeam && !autoMe) return;
    const t = setTimeout(() => {
      const ctx = ctxFor(onClock);
      const profile = bots[onClock] ?? BOT_PROFILES[0];
      const choice = onClock === userTeam
        ? scoreCandidates(ctx).sort((a, b) => b.score - a.score)[0].player
        : botPick(ctx, profile, rngRef.current);
      setPicks((p) => [...p, choice.id]);
    }, SPEEDS[speed].ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused, pickIdx, onClock, autoMe, speed]);

  const start = (startSlot: number) => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const rng = mulberry32(seed);
    rngRef.current = rng;
    const order = shuffle(BOT_PROFILES, rng);
    const b: (BotProfile | null)[] = [];
    let k = 0;
    for (let t = 0; t < teams; t++) b.push(t === startSlot - 1 ? null : order[k++ % order.length]);
    setBots(b);
    setLocked({ board, cfg, userTeam: startSlot - 1 });
    setPicks([]);
    setPaused(false);
    setPhase("live");
  };

  const draft = (id: string) => {
    if (!userOnClock) return;
    setPicks((p) => [...p, id]);
  };

  const teamName = (t: number) => (t === userTeam ? "You" : bots[t]?.name ?? `Team ${t + 1}`);

  // Positional run detector (last 6 picks)
  const run = (() => {
    const recent = picks.slice(-6).map((id) => byId.get(id)!);
    for (const p of POSITIONS) {
      const n = recent.filter((x) => x.pos === p).length;
      if ((p === "QB" || p === "TE") ? n >= 2 : n >= 4) return { pos: p, n };
    }
    return null;
  })();

  // ------------------------------------------------------------------ setup screen
  if (phase === "setup") {
    return (
      <section className="mx-auto max-w-3xl rounded-2xl bg-slate-900 p-6 ring-1 ring-slate-800">
        <h2 className="text-lg font-semibold text-white">12-Team Mock Draft Room</h2>
        <p className="mt-1 text-sm text-slate-400">
          {rounds}-round snake draft vs. {teams - 1} AI bots drafting from the live 2027 ADP + VORP board with roster-need logic for
          {" "}{cfg.roster.QB} QB · {cfg.roster.RB} RB · {cfg.roster.WR} WR · {cfg.roster.TE} TE · {cfg.roster.FLEX} FLEX.
        </p>
        <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Your draft slot</h3>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
          {Array.from({ length: teams }, (_, i) => i + 1).map((s) => (
            <button key={s} onClick={() => setSlot(s)}
              className={`rounded-lg py-2 text-sm font-semibold tabular-nums transition ${slot === s ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
              1.{String(s).padStart(2, "0")}
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Bot speed</h3>
            <div className="flex rounded-lg bg-slate-800 p-1">
              {SPEEDS.map((s, i) => (
                <button key={s.label} onClick={() => setSpeed(i)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ${speed === i ? "bg-slate-600 text-white" : "text-slate-400"}`}>{s.label}</button>
              ))}
            </div>
          </div>
          <label className="mt-6 flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={autoMe} onChange={(e) => setAutoMe(e.target.checked)} className="accent-emerald-500" />
            Auto-draft my team too
          </label>
        </div>
        <div className="mt-5 rounded-lg bg-slate-800/50 p-3 text-xs text-slate-400">
          <div className="mb-1 font-semibold text-slate-300">Your opponents</div>
          {BOT_PROFILES.map((b) => <span key={b.name} className="mr-3 inline-block">{b.name} <span className="text-slate-500">— {b.style}</span></span>)}
        </div>
        <button onClick={() => start(slot)} className="mt-6 w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400">
          Start mock draft from 1.{String(slot).padStart(2, "0")}
        </button>
      </section>
    );
  }

  // ------------------------------------------------------------------ results
  const results = rosters.map((r, t) => ({ t, ...optimalLineup(r, lcfg) }));
  const mean = results.reduce((s, r) => s + r.starterPoints, 0) / teams;
  const sd = Math.sqrt(results.reduce((s, r) => s + (r.starterPoints - mean) ** 2, 0) / teams) || 1;
  const ranked = [...results].sort((a, b) => b.starterPoints - a.starterPoints);
  const myLineup = results[userTeam];

  const list = available.filter((p) =>
    (posFilter === "ALL" || p.pos === posFilter) && (!q || p.name.toLowerCase().includes(q.toLowerCase())),
  ).slice(0, 60);
  const suggestedIds = new Set(suggestions.map((s) => s.player.id));

  return (
    <section className="space-y-4">
      {/* status bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 ring-1 ring-slate-800">
        {phase === "live" ? (
          <>
            <div className="text-sm">
              <span className="text-slate-400">Pick </span>
              <span className="font-semibold tabular-nums text-white">{roundPick(pickIdx + 1, teams)}</span>
              <span className="text-slate-500"> ({pickIdx + 1}/{total})</span>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${onClock === userTeam ? "animate-pulse bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}>
              On the clock: {teamName(onClock)}
            </div>
            {nextUserPick != null && onClock !== userTeam && (
              <span className="text-xs text-slate-400">Your next pick: {roundPick(nextUserPick + 1, teams)} ({nextUserPick - pickIdx} away)</span>
            )}
            {run && <span className="rounded-full bg-orange-500/20 px-2.5 py-1 text-xs font-semibold text-orange-300">{run.pos} run: {run.n} of last 6</span>}
          </>
        ) : (
          <div className="text-sm font-semibold text-white">Draft complete — you finished #{ranked.findIndex((r) => r.t === userTeam) + 1} of {teams} in projected starter points</div>
        )}
        <div className="ml-auto flex gap-2">
          {phase === "live" && (
            <button onClick={() => setPaused((p) => !p)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">{paused ? "Resume" : "Pause"}</button>
          )}
          <button onClick={() => setPhase("setup")} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">New mock</button>
        </div>
      </div>

      {phase === "done" && (
        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-800">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-900 text-[11px] uppercase tracking-wide text-slate-400">
              <tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Team</th><th className="px-3 py-2 text-left">Grade</th><th className="px-3 py-2 text-left">Starter pts</th><th className="px-3 py-2 text-left">Starter VORP</th><th className="px-3 py-2 text-left">Top-4 bench pts</th><th className="px-3 py-2 text-left">Early picks</th></tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.t} className={`border-t border-slate-800 ${r.t === userTeam ? "bg-emerald-500/10" : ""}`}>
                  <td className="px-3 py-2 tabular-nums text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-white">{teamName(r.t)}<span className="ml-1 text-xs text-slate-500">1.{String(r.t + 1).padStart(2, "0")}</span></td>
                  <td className="px-3 py-2 font-bold text-emerald-300">{letterGrade((r.starterPoints - mean) / sd)}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-200">{fmt(r.starterPoints, 0)}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-300">{fmt(r.starterVorp, 0)}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-400">{fmt(r.benchPoints, 0)}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{rosters[r.t].slice(0, 3).map((p) => p.name).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* available players */}
        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-3">
            <div className="flex rounded-lg bg-slate-900 p-1 ring-1 ring-slate-800">
              {(["ALL", ...POSITIONS] as const).map((f) => (
                <button key={f} onClick={() => setPosFilter(f)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${posFilter === f ? "bg-slate-700 text-white" : "text-slate-400"}`}>{f}</button>
              ))}
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
              className="min-w-0 flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white ring-1 ring-slate-800 placeholder:text-slate-500 focus:outline-none" />
            {userOnClock && <span className="text-xs font-semibold text-emerald-400">You&apos;re on the clock — pick a player</span>}
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900 text-[11px] uppercase tracking-wide text-slate-400">
                <tr><th className="px-2 py-1.5 text-left">ADP</th><th className="px-2 py-1.5 text-left">Player</th><th className="px-2 py-1.5 text-left">Pos</th><th className="px-2 py-1.5 text-left">Tier</th><th className="px-2 py-1.5 text-left">PPG</th><th className="px-2 py-1.5 text-left">VORP</th><th /></tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className={`border-t border-slate-800/70 ${suggestedIds.has(p.id) ? "bg-emerald-500/10" : ""}`}>
                    <td className="px-2 py-1.5 tabular-nums text-slate-400">{p.cur.adp}</td>
                    <td className="px-2 py-1.5">
                      <span className="font-medium text-white">{p.name}</span>
                      <span className="ml-1.5 text-[11px] text-slate-500">{p.rookie ? "R27" : p.team}</span>
                      <span className="ml-1.5"><Flags flags={p.flags.filter((f) => f !== "rookie")} notes={p.notes} /></span>
                      {suggestedIds.has(p.id) && <span className="ml-1.5 rounded bg-emerald-500/20 px-1 text-[10px] font-semibold text-emerald-300">SUGGESTED</span>}
                    </td>
                    <td className="px-2 py-1.5"><PosBadge pos={p.pos} rank={p.cur.posRank} /></td>
                    <td className="px-2 py-1.5"><TierBadge tier={p.cur.tier} /></td>
                    <td className="px-2 py-1.5 tabular-nums text-slate-200">{fmt(p.cur.ppg)}</td>
                    <td className="px-2 py-1.5 tabular-nums text-slate-300">{fmt(p.cur.vorp, 0)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button disabled={!userOnClock} onClick={() => draft(p.id)}
                        className="rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600">
                        Draft
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* my roster */}
        <aside className="rounded-xl bg-slate-900/60 p-3 ring-1 ring-slate-800">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Your team · 1.{String(userTeam + 1).padStart(2, "0")}</h3>
          <div className="space-y-1">
            {myLineup.slots.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-slate-800/50 px-2 py-1.5 text-sm">
                <span className="w-10 text-[11px] font-semibold text-slate-500">{s.slot}</span>
                {s.player ? (
                  <>
                    <span className="flex-1 truncate text-white">{s.player.name}</span>
                    <span className="text-xs tabular-nums text-slate-400">{fmt(s.player.cur.ppg)}</span>
                  </>
                ) : <span className="flex-1 text-slate-600">—</span>}
              </div>
            ))}
            {Array.from({ length: Math.max(rounds - myLineup.slots.length, myLineup.bench.length) }, (_, i) => myLineup.bench[i]).map((p, i) => (
              <div key={`b${i}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
                <span className="w-10 text-[11px] font-semibold text-slate-600">BN</span>
                {p ? (
                  <>
                    <span className="flex-1 truncate text-slate-300">{p.name}</span>
                    <PosBadge pos={p.pos} />
                  </>
                ) : <span className="flex-1 text-slate-700">—</span>}
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[11px]">
            {POSITIONS.map((p) => (
              <div key={p} className="rounded bg-slate-800/60 py-1 text-slate-400">{p} <span className="font-semibold text-white">{countPositions(rosters[userTeam])[p]}</span></div>
            ))}
          </div>
          <div className="mt-2 text-xs text-slate-400">Projected starter points: <span className="font-semibold text-white">{fmt(myLineup.starterPoints, 0)}</span></div>
        </aside>
      </div>

      {/* draft grid */}
      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-800">
        <div className="grid min-w-[1100px]" style={{ gridTemplateColumns: `40px repeat(${teams}, minmax(0, 1fr))` }}>
          <div className="bg-slate-900" />
          {Array.from({ length: teams }, (_, t) => (
            <div key={t} className={`truncate bg-slate-900 px-1.5 py-2 text-center text-[11px] font-semibold ${t === userTeam ? "text-emerald-400" : "text-slate-400"}`} title={bots[t]?.style}>
              {teamName(t)}
            </div>
          ))}
          {Array.from({ length: rounds }, (_, r) => (
            <div key={r} className="contents">
              <div className="flex items-center justify-center border-t border-slate-800 bg-slate-900 text-[11px] text-slate-500">R{r + 1}</div>
              {Array.from({ length: teams }, (_, t) => {
                const idx = r % 2 === 0 ? r * teams + t : r * teams + (teams - 1 - t);
                const p = picks[idx] ? byId.get(picks[idx]) : null;
                const current = idx === pickIdx && phase === "live";
                return (
                  <div key={t}
                    className={`h-12 border-l border-t border-slate-800 p-1 text-[11px] leading-tight ${p ? POS_CELL[p.pos] : ""} ${current ? "ring-2 ring-inset ring-emerald-400" : ""} ${t === userTeam && !p ? "bg-emerald-500/5" : ""}`}>
                    {p ? (
                      <>
                        <div className="truncate font-semibold text-white">{p.name}</div>
                        <div className="text-slate-300/80">{p.pos} · {roundPick(idx + 1, teams)}</div>
                      </>
                    ) : <div className="text-slate-700">{roundPick(idx + 1, teams)}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
