"use client";

import type { LeagueConfig, Replacement, Toggles } from "@/lib/types";
import { POSITIONS } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  toggles: Toggles;
  defaults: Toggles;
  onChange: (t: Toggles) => void;
  cfg: LeagueConfig;
  replacement: Replacement;
}

function Seg<T extends number>({ label, hint, value, options, onPick }: {
  label: string; hint: string; value: T; options: { v: T; label: string }[]; onPick: (v: T) => void;
}) {
  return (
    <div className="py-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className="text-[11px] text-slate-500">{hint}</span>
      </div>
      <div className="grid grid-flow-col gap-1 rounded-lg bg-slate-800/70 p-1">
        {options.map((o) => (
          <button
            key={o.v}
            onClick={() => onPick(o.v)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${value === o.v ? "bg-emerald-500 font-semibold text-slate-950" : "text-slate-300 hover:bg-slate-700"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsDrawer({ open, onClose, toggles, defaults, onChange, cfg, replacement }: Props) {
  const set = (patch: Partial<Toggles>) => onChange({ ...toggles, ...patch });
  const r = cfg.roster;
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-slate-800 bg-slate-900 shadow-2xl transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">League settings</h2>
            <p className="text-xs text-slate-400">Rankings, VORP, tiers and ADP recalculate instantly.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close settings">✕</button>
        </div>
        <div className="flex-1 divide-y divide-slate-800 overflow-y-auto px-5">
          <Seg label="FLEX spots" hint="RB / WR / TE" value={toggles.flexCount}
            options={[{ v: 1, label: "1 FLEX" }, { v: 2, label: "2 FLEX" }]} onPick={(v) => set({ flexCount: v })} />
          <Seg label="Reception scoring" hint="points per catch" value={toggles.ppr}
            options={[{ v: 1, label: "Full PPR" }, { v: 0.5, label: "Half PPR" }]} onPick={(v) => set({ ppr: v })} />
          <Seg label="Passing TD" hint="points" value={toggles.passTd}
            options={[{ v: 4, label: "4 pts" }, { v: 6, label: "6 pts" }]} onPick={(v) => set({ passTd: v })} />
          <Seg label="TE Premium" hint="bonus per TE catch" value={toggles.tePremium}
            options={[{ v: 0, label: "Off" }, { v: 0.5, label: "+0.5" }]} onPick={(v) => set({ tePremium: v })} />

          <div className="py-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Active league</h3>
            <p className="text-sm text-slate-300">
              {cfg.teams} teams · {r.QB} QB · {r.RB} RB · {r.WR} WR · {r.TE} TE · {toggles.flexCount} FLEX{r.K ? ` · ${r.K} K` : ""}{r.DST ? ` · ${r.DST} D/ST` : ""} · {r.BENCH} BN · {cfg.draft_rounds} rounds
            </p>
            <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Replacement level (season pts)</h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              {POSITIONS.map((p) => (
                <div key={p} className="rounded-lg bg-slate-800/70 px-2 py-2">
                  <div className="text-[11px] text-slate-400">{p}{replacement.starters[p]}</div>
                  <div className="text-sm font-semibold tabular-nums text-white">{replacement.points[p].toFixed(0)}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Replacement = average of the 3 players just after the last projected starter at each position
              (dedicated slots × teams, plus FLEX spots allocated to the best remaining RB/WR/TE).
            </p>
          </div>
        </div>
        <div className="border-t border-slate-800 p-4">
          <button
            onClick={() => onChange(defaults)}
            className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Reset to league_settings.json defaults
          </button>
        </div>
      </aside>
    </>
  );
}
