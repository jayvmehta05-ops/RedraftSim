"use client";

import { useEffect, useState } from "react";
import { IconBoard, IconKeeper, IconLive, IconMock, IconSwap, IconTrend } from "../icons";

const STEP_MS = 6000;

/** Sample names come from the real board so the previews look like the product. */
export default function FeatureTour({ names, target, source }: { names: string[]; target: number; source: number }) {
  const n = (i: number) => names[i % names.length] ?? "Player";
  const features = [
    {
      icon: IconBoard, title: `${target} Big Board`, body: "Every player projected for next season, ranked by value over replacement and rebuilt every Tuesday.",
      preview: (
        <div className="space-y-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ animationDelay: `${i * 90}ms` }} className="ff-rise flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 ring-1 ring-slate-800">
              <span className="w-4 text-xs font-black text-slate-500">{i + 1}</span>
              <span className="flex-1 truncate text-sm text-white">{n(i)}</span>
              <span className="rounded bg-fuchsia-500/20 px-1.5 text-[10px] font-bold text-fuchsia-200">T{i < 3 ? 1 : 2}</span>
              {i === 3 ? <span className="ff-blink text-xs font-bold text-emerald-400">▲ 6</span> : <span className="text-xs text-slate-600">–</span>}
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: IconMock, title: "Mock drafts that feel real", body: "Bots learn how each of your leaguemates actually drafts, or you describe them in plain words.",
      preview: (
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} style={{ animationDelay: `${i * 70}ms` }}
              className={`ff-rise rounded-lg p-2 text-[10px] ring-1 ${i === 9 ? "ff-glow bg-emerald-500/20 text-emerald-200 ring-emerald-400" : "bg-slate-900 text-slate-400 ring-slate-800"}`}>
              <div className="font-bold">{i === 9 ? "YOU" : `Team ${i + 1}`}</div>
              <div className="truncate">{i === 9 ? "On the clock…" : i < 9 ? n(i) : "—"}</div>
              {i === 4 && <div className="mt-0.5 text-[9px] text-amber-300">loves RBs</div>}
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: IconLive, title: "Live draft assistant", body: "Follow your real draft pick by pick and see the odds each player is still there at your next turn.",
      preview: (
        <div className="space-y-2.5">
          {[86, 61, 34, 12].map((pct, i) => (
            <div key={i}>
              <div className="flex justify-between text-xs"><span className="text-white">{n(i + 5)}</span><span className="tabular-nums text-slate-400">{pct}%</span></div>
              <div className="mt-1 h-2 rounded-full bg-slate-800">
                <div style={{ width: `${pct}%`, animationDelay: `${i * 120}ms` }} className={`ff-bar h-2 rounded-full ${pct > 50 ? "bg-emerald-400" : pct > 25 ? "bg-amber-400" : "bg-rose-400"}`} />
              </div>
            </div>
          ))}
          <div className="text-[11px] text-slate-500">Chance he&apos;s still there at your next pick</div>
        </div>
      ),
    },
    {
      icon: IconSwap, title: "Rosters & trades", body: "Click any player in your league to see offers his manager would actually accept, or shop your own.",
      preview: (
        <div className="rounded-xl bg-slate-900 p-3 ring-1 ring-slate-800">
          <div className="flex items-center text-xs"><span className="font-semibold text-white">with Team 7</span>
            <span className="ff-blink ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300">Likely yes · 72%</span></div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-[10px] font-bold text-rose-300">YOU GIVE</div><div className="ff-rise text-white">{n(8)}</div></div>
            <div><div className="text-[10px] font-bold text-emerald-300">YOU GET</div><div className="ff-rise text-white" style={{ animationDelay: "120ms" }}>{n(6)}</div></div>
          </div>
          <div className="mt-3 text-xs text-slate-400">Your lineup <b className="text-emerald-300">+38 pts</b> · Theirs <b className="text-emerald-300">+11 pts</b></div>
        </div>
      ),
    },
    {
      icon: IconTrend, title: "Waiver wire, ranked for you", body: "Free agents ranked by how much they improve your lineup, with who to drop and what to bid.",
      preview: (
        <div className="space-y-1.5">
          {[["+24", "Big bid"], ["+15", "Solid bid"], ["+7", "Small bid"]].map(([g, b], i) => (
            <div key={i} style={{ animationDelay: `${i * 110}ms` }} className="ff-rise flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 ring-1 ring-slate-800">
              <span className="flex-1 truncate text-sm text-white">{n(i + 12)}</span>
              <span className="text-sm font-bold tabular-nums text-emerald-300">{g} pts</span>
              <span className="w-20 text-right text-[11px] text-slate-400">{b}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: IconKeeper, title: "Luck meter", body: "Your all-play record and how many wins the schedule gave or took, for every team in your league.",
      preview: (
        <div className="rounded-xl bg-rose-500/10 p-4 ring-1 ring-rose-500/30">
          <div className="text-lg font-black text-white">You&apos;re 5-6.</div>
          <div className="text-sm text-slate-300">Your scores earned <b>7.8 wins</b>. That&apos;s <b className="text-rose-300">2.8 wins unlucky</b>.</div>
          <div className="relative mt-3 h-2 rounded-full bg-slate-800">
            <span className="absolute top-0 left-1/2 h-2 w-px bg-slate-500" />
            <span className="ff-bar absolute top-0 right-1/2 h-2 rounded-full bg-rose-400" style={{ width: "40%" }} />
          </div>
          <div className="mt-2 text-[11px] text-slate-400">All-play this {source}: 86-35, best in the league</div>
        </div>
      ),
    },
  ];

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % features.length), STEP_MS);
    return () => clearTimeout(t);
  }, [active, paused, features.length]);
  const f = features[active];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="space-y-1.5">
        {features.map((x, i) => {
          const Icon = x.icon;
          const on = i === active;
          return (
            <button key={x.title} onClick={() => setActive(i)} aria-pressed={on}
              className={`relative w-full overflow-hidden rounded-xl px-4 py-3 text-left transition ${on ? "bg-slate-900 ring-1 ring-emerald-500/40" : "hover:bg-slate-900/60"}`}>
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 transition ${on ? "bg-emerald-500 text-slate-950 ring-emerald-400" : "bg-slate-900 text-emerald-300 ring-slate-800"}`}>
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <div className={`font-semibold ${on ? "text-white" : "text-slate-300"}`}>{x.title}</div>
                  {on && <div className="ff-rise mt-0.5 text-sm text-slate-400">{x.body}</div>}
                </div>
              </div>
              {on && (
                <span key={active} aria-hidden style={{ animationDuration: `${STEP_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
                  className="ff-progress absolute bottom-0 left-0 h-0.5 w-full bg-emerald-400" />
              )}
            </button>
          );
        })}
      </div>
      <div className="relative min-h-[300px] overflow-hidden rounded-2xl bg-slate-950 p-5 ring-1 ring-slate-800">
        <div aria-hidden className="ff-float absolute -top-16 -right-16 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative mb-4 flex items-center gap-2 text-xs text-slate-500">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-2">{f.title}</span>
          <span className="ml-auto">Preview</span>
        </div>
        <div key={active} className="relative">{f.preview}</div>
      </div>
    </div>
  );
}
