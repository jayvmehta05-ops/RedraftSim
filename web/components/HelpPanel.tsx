"use client";

import { useEffect, useState } from "react";
import { LEAGUE_GROUPS, LEAGUE_HELP, MAIN_HELP, type MainTab, START_STEPS } from "@/lib/help";
import { IconClose } from "./icons";

const SEEN_KEY = "redraft.helpSeen";

/** "How it works": where to start, what every tab does, and what each My League tool is for. */
export function HelpButton({ onClick }: { onClick: () => void }) {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(SEEN_KEY)) setFresh(true);
    } catch { /* storage unavailable */ }
  }, []);
  return (
    <button onClick={() => { setFresh(false); try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ } onClick(); }}
      aria-label="How it works" title="How it works: what each tab does"
      className="relative flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-2 text-sm font-semibold text-slate-200 ring-1 ring-slate-700 transition hover:bg-slate-800">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" /><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.8M12 17.2h.01" />
      </svg>
      <span className="hidden xl:inline">How it works</span>
      {fresh && (
        <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
        </span>
      )}
    </button>
  );
}

export default function HelpPanel({ open, onClose, onGo, hasLeague, hasTeam, keeper, onOpenSettings }: {
  open: boolean; onClose: () => void; onGo: (tab: MainTab) => void; hasLeague: boolean; hasTeam: boolean; keeper: boolean; onOpenSettings: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;

  const tabs = (Object.keys(MAIN_HELP) as MainTab[]).filter((t) => t !== "keepers" || keeper);
  const done = [hasLeague, hasTeam, false];
  return (
    <div className="ff-fade fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="How it works" onClick={(e) => e.stopPropagation()}
        className="ff-sheet-right flex h-full w-full max-w-md flex-col bg-slate-950 ring-1 ring-slate-800">
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white">How it works</h2>
            <p className="text-xs text-slate-400">What each part of the site does, in plain English.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close"><IconClose className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-5 text-sm">
          <section>
            <h3 className="text-xs font-bold tracking-wider text-emerald-400 uppercase">Where to start</h3>
            <ol className="mt-2 space-y-2">
              {START_STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3 rounded-xl bg-slate-900 p-3 ring-1 ring-slate-800">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${done[i] ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}>{done[i] ? "✓" : i + 1}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{s.title}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{s.body}</div>
                    {i === 0 && !hasLeague && (
                      <button onClick={() => { onClose(); onOpenSettings(); }} className="mt-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400">Import my league</button>
                    )}
                    {i === 2 && hasLeague && (
                      <button onClick={() => { onClose(); onGo("trades"); }} className="mt-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400">Open My League</button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="text-xs font-bold tracking-wider text-emerald-400 uppercase">The tabs at the top</h3>
            <ul className="mt-2 divide-y divide-slate-800 overflow-hidden rounded-xl ring-1 ring-slate-800">
              {tabs.map((t) => (
                <li key={t} className="flex items-start gap-3 bg-slate-900 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white">{MAIN_HELP[t].name}</div>
                    <div className="text-xs text-slate-400">{MAIN_HELP[t].what}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">Best for: {MAIN_HELP[t].when}</div>
                  </div>
                  <button onClick={() => { onClose(); onGo(t); }} className="shrink-0 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-slate-700">Go</button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-bold tracking-wider text-emerald-400 uppercase">Inside My League</h3>
            {!hasLeague && <p className="mt-1 text-xs text-slate-500">These need your league imported first.</p>}
            <div className="mt-2 space-y-3">
              {LEAGUE_GROUPS.map((g) => (
                <div key={g.label}>
                  <div className="text-[11px] font-semibold text-slate-400">{g.label}</div>
                  <ul className="mt-1 space-y-1">
                    {g.ids.map((id) => (
                      <li key={id} className="rounded-lg bg-slate-900 px-3 py-2 ring-1 ring-slate-800">
                        <span className="font-semibold text-white">{LEAGUE_HELP[id].name}:</span> <span className="text-xs text-slate-400">{LEAGUE_HELP[id].what}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl bg-slate-900/60 p-3 text-xs text-slate-400 ring-1 ring-slate-800">
            Want the details? Read the <a href="/guide" className="font-semibold text-emerald-400 hover:underline">full guide</a> or see{" "}
            <a href="/accuracy" className="font-semibold text-emerald-400 hover:underline">how accurate the projections are</a>.
            Still confused? Tell us with the Feedback button: every message is read.
          </section>
        </div>
      </aside>
    </div>
  );
}
