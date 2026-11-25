"use client";

import { useEffect, useMemo, useState } from "react";
import { boardMaps, resolveRoster } from "@/lib/rosters";
import type { ImportedLeague, LeagueConfig, RankedPlayer } from "@/lib/types";
import { type WeekData, type WeeklyPlayer, planWeek, statusLabel, weeklyValue } from "@/lib/weekly";
import { PosBadge, fmt, thumb } from "./ui";

function when(kickoff: number | null) {
  if (!kickoff) return "";
  return new Date(kickoff).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function Matchup({ w }: { w: WeeklyPlayer }) {
  if (w.bye) return <span className="font-semibold text-rose-300">BYE</span>;
  if (!w.opp) return <span className="text-slate-500">no game</span>;
  return <span>{w.home ? "vs" : "@"} <b className="text-slate-200">{w.opp}</b> <span className="text-slate-500">· {when(w.kickoff)}</span></span>;
}

function Row({ slot, w, started, locked, tossUp, dim }: {
  slot: string; w: WeeklyPlayer | null; started?: boolean; locked?: boolean; tossUp?: WeeklyPlayer | null; dim?: boolean;
}) {
  if (!w) {
    return (
      <div className="flex items-center gap-3 border-b border-slate-800/70 bg-slate-950 px-4 py-2.5 last:border-0">
        <span className="w-12 text-[11px] font-bold text-slate-500">{slot}</span>
        <span className="text-sm italic text-rose-300">Empty: no one healthy and eligible for this spot</span>
      </div>
    );
  }
  const img = thumb(w.p.headshot, 64);
  const st = statusLabel(w.status);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-800/70 px-4 py-2.5 last:border-0 ${dim ? "bg-slate-950/60" : "bg-slate-950"}`}>
      <span className="w-12 text-[11px] font-bold text-slate-400">{slot}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" loading="lazy" className={`h-8 w-8 shrink-0 rounded-full bg-slate-800 object-cover ${w.source === "out" ? "opacity-40 grayscale" : ""}`} />
        ) : <span className="h-8 w-8 shrink-0 rounded-full bg-slate-800" />}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`truncate font-semibold ${dim || w.source === "out" ? "text-slate-400" : "text-white"}`}>{w.p.name}</span>
            {st && <span className={`rounded px-1 text-[10px] font-bold ${st === "Q" ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300"}`}>{st}</span>}
            {locked && <span className="rounded bg-slate-700/60 px-1 text-[10px] font-bold text-slate-300" title="His game has started, so he can't be moved">LOCKED</span>}
            {started === true && !locked && <span className="text-[10px] font-semibold text-emerald-400" title="In your lineup on your platform">✓ set</span>}
          </div>
          <div className="text-[11px] text-slate-400"><Matchup w={w} /></div>
          {tossUp && <div className="mt-0.5 text-[11px] text-amber-300">Toss-up with {tossUp.p.name} ({fmt(tossUp.pts)})</div>}
          {!dim && w.source === "out" && !locked && <div className="mt-0.5 text-[11px] font-semibold text-rose-300">{w.bye ? "On bye" : "Ruled out"} and no one on your bench can fill this spot: check Waivers</div>}
        </div>
      </div>
      <PosBadge pos={w.p.pos} />
      <div className="w-16 text-right">
        <div className={`text-base font-bold tabular-nums ${w.source === "out" ? "text-slate-600" : "text-white"}`}>{fmt(w.pts)}</div>
        <div className="text-[10px] text-slate-500">{w.source === "estimate" ? "est. pts" : "proj. pts"}</div>
      </div>
    </div>
  );
}

/** This week's best lineup for your team, compared with the lineup you've set on your platform. */
export default function StartSit({ board, cfg, league, myManager, onRefresh, refreshing }: {
  board: RankedPlayer[]; cfg: LeagueConfig; league: ImportedLeague; myManager: string; onRefresh: () => void; refreshing: boolean;
}) {
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/week")
      .then(async (r) => {
        const body = await r.json();
        if (cancelled) return;
        if (!r.ok) setError(body.error ?? "Weekly projections are unavailable right now.");
        else { setData(body as WeekData); setError(null); }
        setNow(Date.now());
      })
      .catch(() => { if (!cancelled) setError("Couldn't load this week's projections. Check your connection."); });
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => { cancelled = true; clearInterval(tick); };
  }, [reload]);

  const { byId, byEspn } = useMemo(() => boardMaps(board), [board]);
  const plan = useMemo(() => {
    if (!data || data.offseason || !now) return null;
    const r = league.rosters?.find((x) => x.managerId === myManager);
    if (!r) return null;
    const roster = resolveRoster(r, byId, byEspn).map((p) => weeklyValue(p, data, cfg));
    const starters = r.starters ? new Set(r.starters.map((id) => (r.idType === "espn" ? byEspn.get(id) : byId.get(id))?.id).filter((x): x is string => !!x)) : null;
    return { ...planWeek(roster, starters, cfg, now), hasStarters: !!r.starters };
  }, [data, now, league, myManager, byId, byEspn, cfg]);

  if (error) {
    return (
      <div className="rounded-xl bg-slate-900/60 p-6 text-sm text-slate-400 ring-1 ring-slate-800">
        {error}
        <button onClick={() => setReload((n) => n + 1)} className="ml-3 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700">Try again</button>
      </div>
    );
  }
  if (!data) return <div className="rounded-xl bg-slate-900/60 p-6 text-sm text-slate-400 ring-1 ring-slate-800">Loading this week&apos;s matchups and projections…</div>;
  if (data.offseason) return <div className="rounded-xl bg-slate-900/60 p-6 text-sm text-slate-400 ring-1 ring-slate-800">There are no regular-season games this week, so there&apos;s nothing to start or sit.</div>;
  if (!plan) return null;

  const gain = plan.currentTotal != null ? plan.bestTotal - plan.currentTotal : null;
  const updated = data.generatedAt ? Math.max(0, Math.round((now - Date.parse(data.generatedAt)) / 60_000)) : null;
  const platform = league.provider === "espn" ? "ESPN" : league.provider === "sleeper" ? "Sleeper" : null;
  const yourLineup = platform ? `Your ${platform} lineup` : "Your lineup";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 ring-1 ring-slate-800">
        <div>
          <div className="text-sm font-semibold text-white">Start/Sit · Week {data.week}</div>
          <div className="text-[11px] text-slate-500">
            ESPN weekly projections scored with your league&apos;s rules{updated != null ? ` · updated ${updated < 1 ? "just now" : `${updated} min ago`}` : ""}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-lg font-black tabular-nums text-white">{fmt(plan.bestTotal)}</div>
          <div className="text-[10px] text-slate-500">best lineup, projected</div>
        </div>
      </div>

      {plan.currentTotal != null ? (
        gain != null && gain > 0.05 ? (
          <div className="rounded-xl bg-emerald-500/10 p-4 ring-1 ring-emerald-500/30">
            <div className="text-base font-bold text-white">
              {yourLineup} projects {fmt(plan.currentTotal)}. The best one projects {fmt(plan.bestTotal)}: <span className="text-emerald-300">+{fmt(gain)} pts</span>.
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[10px] font-bold tracking-wide text-emerald-300 uppercase">Start</div>
                {plan.start.map((w) => <div key={w.p.id} className="text-sm text-white">{w.p.name} <span className="text-xs text-slate-400">({fmt(w.pts)}, <Matchup w={w} />)</span></div>)}
              </div>
              <div>
                <div className="mb-1 text-[10px] font-bold tracking-wide text-rose-300 uppercase">Bench</div>
                {plan.sit.map((w) => <div key={w.p.id} className="text-sm text-white">{w.p.name} <span className="text-xs text-slate-400">({w.bye ? "bye" : w.source === "out" ? statusLabel(w.status) ?? "out" : fmt(w.pts)})</span></div>)}
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">Make the change on {platform ?? "your platform"}, then hit Refresh now above to check it here.</p>
          </div>
        ) : (
          <div className="rounded-xl bg-slate-900/60 p-4 text-sm text-emerald-200 ring-1 ring-emerald-500/20">
            ✓ {yourLineup} is already the best projected lineup ({fmt(plan.currentTotal)} pts). Watch the toss-ups below if news breaks.
          </div>
        )
      ) : league.provider !== "manual" ? (
        <div className="rounded-xl bg-slate-900/60 p-4 text-sm text-slate-400 ring-1 ring-slate-800">
          Refresh rosters to compare this with the lineup you&apos;ve set on {platform ?? "your platform"}.
          <button onClick={onRefresh} disabled={refreshing} className="ml-3 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 disabled:bg-slate-700">
            {refreshing ? "Refreshing…" : "Refresh rosters"}
          </button>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-xs font-bold tracking-wide text-slate-400 uppercase">Best lineup this week</h3>
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-800">
          {plan.slots.map((s, i) => <Row key={`${s.slot}-${i}`} slot={s.slot} w={s.x} started={plan.hasStarters ? s.started : undefined} locked={s.locked} tossUp={s.tossUp} />)}
        </div>
      </div>
      {plan.bench.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-slate-400 uppercase">Bench</h3>
          <div className="overflow-hidden rounded-xl ring-1 ring-slate-800">
            {plan.bench.map((w) => <Row key={w.p.id} slot="BN" w={w} dim />)}
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        Projections are ESPN&apos;s for this week, scored with your league&apos;s settings; they already account for the matchup. Players without an ESPN
        weekly projection use their rest-of-season average (&quot;est.&quot;). Players on bye or ruled out score 0. Players whose game has started are locked
        where they are. Kickers and defenses aren&apos;t included. Toss-ups are within 1.5 points: go with your gut or the latest news.
      </p>
    </section>
  );
}
