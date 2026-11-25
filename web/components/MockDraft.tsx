"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LeagueConfig, Pos, RankedPlayer } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { roundPick } from "@/lib/engine";
import {
  BOT_PROFILES, type BotProfile, botPick, countPositions, letterGrade, mulberry32, optimalLineup,
  scoreCandidates, teamOnClock, teamPickIndices,
} from "@/lib/draft";
import type { LeaguemateProfile } from "@/lib/leaguemates";
import { encodeMock } from "@/lib/share";
import { MockSurvey } from "./Feedback";
import { Flags, POS_CELL, PosBadge, TierBadge, fmt } from "./ui";
import { TARGET, yy } from "@/lib/season";

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

export default function MockDraft({ board, cfg, leaguemates = [], myManager = null, leagueName = null }: {
  board: RankedPlayer[]; cfg: LeagueConfig; leaguemates?: LeaguemateProfile[]; myManager?: string | null; leagueName?: string | null;
}) {
  const teams = cfg.teams;
  // K and D/ST aren't projected: simulate the skill-position rounds and reserve the last rounds for them.
  const reserved: { slot: string; n: number }[] = [
    { slot: "K", n: cfg.roster.K ?? 0 },
    { slot: "D/ST", n: cfg.roster.DST ?? 0 },
  ].filter((x) => x.n > 0);
  const reservedRounds = reserved.reduce((s, x) => s + x.n, 0);
  const rounds = Math.max(1, cfg.draft_rounds - reservedRounds);
  const total = teams * rounds;

  const [rawPhase, setPhase] = useState<Phase>("setup");
  const [slot, setSlot] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [autoMe, setAutoMe] = useState(false);
  const [useLeague, setUseLeague] = useState(true);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const opponents = leaguemates.filter((m) => m.managerId !== myManager);
  const leagueMode = useLeague && opponents.length > 0;
  const [paused, setPaused] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [locked, setLocked] = useState<{ board: RankedPlayer[]; cfg: LeagueConfig; userTeam: number; leagueName: string | null } | null>(null);
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

  // Seeded from the click's timestamp, so every mock plays out differently.
  const start = (startSlot: number, entropy: number) => {
    const seed = Math.floor(entropy * 1000) % 2 ** 31;
    const rng = mulberry32(seed);
    rngRef.current = rng;
    // Leaguemates first (their real tendencies), topped up with stock personalities if the league is short.
    const order: BotProfile[] = leagueMode
      ? [...shuffle(opponents, rng), ...shuffle(BOT_PROFILES, rng)]
      : shuffle(BOT_PROFILES, rng);
    const b: (BotProfile | null)[] = [];
    let k = 0;
    for (let t = 0; t < teams; t++) b.push(t === startSlot - 1 ? null : order[k++ % order.length]);
    setBots(b);
    setLocked({ board, cfg, userTeam: startSlot - 1, leagueName: leagueMode ? leagueName : null });
    setShareMsg(null);
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
        <h2 className="text-lg font-semibold text-white">{teams}-Team Mock Draft Room</h2>
        <p className="mt-1 text-sm text-slate-400">
          {cfg.draft_rounds}-round snake draft vs. {teams - 1} AI bots drafting from the live {TARGET} ADP + VORP board with roster-need logic for
          {" "}{cfg.roster.QB} QB · {cfg.roster.RB} RB · {cfg.roster.WR} WR · {cfg.roster.TE} TE · {cfg.roster.FLEX} FLEX.
          {reservedRounds > 0 && ` Rounds ${rounds + 1}–${cfg.draft_rounds} are reserved for ${reserved.map((x) => x.slot).join(" and ")} (not projected).`}
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
          {opponents.length > 0 && (
            <div className="mb-2 flex rounded-lg bg-slate-900 p-1">
              <button onClick={() => setUseLeague(true)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${leagueMode ? "bg-emerald-500 text-slate-950" : "text-slate-400"}`}>
                My leaguemates{leagueName ? ` (${leagueName})` : ""}
              </button>
              <button onClick={() => setUseLeague(false)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${!leagueMode ? "bg-slate-600 text-white" : "text-slate-400"}`}>
                AI personalities
              </button>
            </div>
          )}
          <div className="mb-1 font-semibold text-slate-300">Your opponents</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {(leagueMode ? opponents : BOT_PROFILES).map((b) => (
              <div key={b.name} className="rounded-md bg-slate-900/70 px-2 py-1.5" title={b.style}>
                <div className="truncate text-[12px] font-medium text-slate-200">{b.name}</div>
                <div className="truncate text-[10px] text-slate-500">{b.style}</div>
              </div>
            ))}
          </div>
          {leagueMode && !myManager && (
            <p className="mt-2 text-amber-300/80">Tip: pick your own team in Settings → Your league so you aren&apos;t also drafting against yourself.</p>
          )}
        </div>
        <button onClick={(e) => start(slot, e.timeStamp + performance.timeOrigin)}
          className="sticky bottom-20 mt-6 w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-slate-950/60 hover:bg-emerald-400 lg:static lg:shadow-none">
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
  const share = async () => {
    const mine = results[userTeam];
    const myPickIdx = teamPickIndices(userTeam, teams, rounds);
    const code = encodeMock({
      v: 1, t: teams, s: userTeam + 1, r: ranked.findIndex((r) => r.t === userTeam) + 1,
      g: letterGrade((mine.starterPoints - mean) / sd), pts: Math.round(mine.starterPoints),
      lg: locked?.leagueName ?? undefined,
      p: myPickIdx.slice(0, 9).map((i) => {
        const pl = byId.get(picks[i]);
        return [pl?.name ?? "?", pl?.pos ?? "", roundPick(i + 1, teams)] as [string, string, string];
      }),
    });
    const url = `${window.location.origin}/share/${code}`;
    try {
      const canShare = typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;
      if (canShare) await navigator.share({ title: `My ${TARGET} mock draft`, url });
      else await navigator.clipboard.writeText(url);
      setShareMsg(canShare ? "Shared!" : "Link copied!");
    } catch {
      window.prompt("Copy your share link:", url);
    }
  };
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
          {phase === "done" && (
            <button onClick={share} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400">
              {shareMsg ?? "Share result"}
            </button>
          )}
          <button onClick={() => setPhase("setup")} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">New mock</button>
        </div>
      </div>

      {phase === "done" && (
        <MockSurvey context={{ opponents: locked?.leagueName ? "leaguemates" : "personalities", teams: String(teams), slot: String(userTeam + 1) }} />
      )}
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
            <div className="flex max-w-full overflow-x-auto rounded-lg bg-slate-900 p-1 ring-1 ring-slate-800">
              {(["ALL", ...POSITIONS] as const).map((f) => (
                <button key={f} onClick={() => setPosFilter(f)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${posFilter === f ? "bg-slate-700 text-white" : "text-slate-400"}`}>{f}</button>
              ))}
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
              className="min-w-0 flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white ring-1 ring-slate-800 placeholder:text-slate-500 focus:outline-none" />
            {userOnClock && <span className="w-full text-xs font-semibold text-emerald-400 sm:w-auto">You&apos;re on the clock — pick a player</span>}
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900 text-[11px] uppercase tracking-wide text-slate-400">
                <tr><th className="hidden px-2 py-1.5 text-left sm:table-cell">ADP</th><th className="px-2 py-1.5 text-left">Player</th><th className="hidden px-2 py-1.5 text-left sm:table-cell">Pos</th><th className="hidden px-2 py-1.5 text-left sm:table-cell">Tier</th><th className="px-2 py-1.5 text-left">PPG</th><th className="hidden px-2 py-1.5 text-left sm:table-cell">VORP</th><th /></tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className={`border-t border-slate-800/70 ${suggestedIds.has(p.id) ? "bg-emerald-500/10" : ""}`}>
                    <td className="hidden px-2 py-1.5 tabular-nums text-slate-400 sm:table-cell">{p.cur.adp}</td>
                    <td className="px-2 py-1.5">
                      <span className="font-medium text-white">{p.name}</span>
                      <span className="ml-1.5 text-[11px] text-slate-500">{p.rookie ? `R${yy(TARGET)}` : p.team}</span>
                      <span className="ml-1.5"><Flags flags={p.flags.filter((f) => f !== "rookie")} notes={p.notes} /></span>
                      {suggestedIds.has(p.id) && <span className="ml-1.5 rounded bg-emerald-500/20 px-1 text-[10px] font-semibold text-emerald-300">SUGGESTED</span>}
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500 sm:hidden">
                        <PosBadge pos={p.pos} rank={p.cur.posRank} /><TierBadge tier={p.cur.tier} /> ADP {p.cur.adp} · VORP {fmt(p.cur.vorp, 0)}
                      </div>
                    </td>
                    <td className="hidden px-2 py-1.5 sm:table-cell"><PosBadge pos={p.pos} rank={p.cur.posRank} /></td>
                    <td className="hidden px-2 py-1.5 sm:table-cell"><TierBadge tier={p.cur.tier} /></td>
                    <td className="px-2 py-1.5 tabular-nums text-slate-200">{fmt(p.cur.ppg)}</td>
                    <td className="hidden px-2 py-1.5 tabular-nums text-slate-300 sm:table-cell">{fmt(p.cur.vorp, 0)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button disabled={!userOnClock} onClick={() => draft(p.id)}
                        className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600">
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
            {reserved.flatMap((x) => Array.from({ length: x.n }, () => x.slot)).map((slot, i) => (
              <div key={`r${i}`} className="flex items-center gap-2 rounded-md bg-slate-800/30 px-2 py-1.5 text-sm" title="Drafted in the reserved final rounds; not projected">
                <span className="w-10 text-[11px] font-semibold text-slate-500">{slot}</span>
                <span className="flex-1 text-xs text-slate-600">Late-round pick (not projected)</span>
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
          {reservedRounds > 0 && (
            <>
              <div className="flex items-center justify-center border-t border-slate-800 bg-slate-900 text-[10px] text-slate-500">R{rounds + 1}{reservedRounds > 1 ? `–${cfg.draft_rounds}` : ""}</div>
              <div className="border-l border-t border-slate-800 px-2 py-2 text-[11px] text-slate-500" style={{ gridColumn: `span ${teams}` }}>
                Reserved for {reserved.map((x) => x.slot).join(" and ")}: every team fills these slots late; kickers and defenses aren&apos;t projected.
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
