"use client";

import Glide from "./Glide";
import { useEffect, useState } from "react";
import type { ImportedLeague, LeagueConfig, Replacement, Toggles } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { PRIOR, SOURCE } from "@/lib/season";

interface Props {
  open: boolean;
  onClose: () => void;
  toggles: Toggles;
  defaults: Toggles;
  onChange: (t: Toggles) => void;
  cfg: LeagueConfig;
  replacement: Replacement;
  league: ImportedLeague | null;
  onImport: (league: ImportedLeague | null) => void;
  myManager: string | null;
  onChooseManager: (id: string | null) => void;
  onOpenEditor: () => void;
  savedLeagues: { key: string; name: string; provider: string }[];
  activeKey: string | null;
  onSwitchLeague: (key: string) => void;
  keeper: boolean;
  onKeeper: (on: boolean) => void;
}

const ESPN_AUTH_KEY = "redraft27.espnAuth";

/** Download / restore everything this site keeps in the browser (leagues, leaguemate edits, keepers, settings).
 *  ESPN login cookies are deliberately left out of the file. */
function BackupRestore() {
  const [msg, setMsg] = useState<string | null>(null);
  const backup = (stamp: number) => {
    try {
      const data: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("redraft") && k !== ESPN_AUTH_KEY) data[k] = localStorage.getItem(k) ?? "";
      }
      const blob = new Blob([JSON.stringify({ app: "future-fantasy", version: 1, exportedAt: new Date(stamp).toISOString(), data }, null, 1)],
        { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `future-fantasy-backup-${new Date(stamp).toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg(`Saved ${Object.keys(data).length} items to your downloads.`);
    } catch {
      setMsg("Couldn't read this browser's storage.");
    }
  };
  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!["future-fantasy", "redraft-sim"].includes(parsed?.app) || typeof parsed.data !== "object") throw new Error("not a backup");
      const entries = Object.entries(parsed.data as Record<string, string>).filter(([k, v]) => k.startsWith("redraft") && typeof v === "string");
      entries.forEach(([k, v]) => localStorage.setItem(k, v));
      setMsg(`Restored ${entries.length} items. Reloading…`);
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setMsg("That file isn't a Future Fantasy backup.");
    }
  };
  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <div className="flex gap-2">
        <button onClick={(e) => backup(e.timeStamp + performance.timeOrigin)}
          className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700">Back up my data</button>
        <label className="flex-1 cursor-pointer rounded-lg bg-slate-800 px-3 py-2 text-center text-xs font-semibold text-slate-200 hover:bg-slate-700">
          Restore backup
          <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
        </label>
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
        {msg ?? "Your leagues, leaguemate notes and settings live in this browser. Sign in to sync them across devices, or back them up to a file."}
      </p>
    </div>
  );
}

function LeagueImport({ league, onImport, myManager, onChooseManager, onOpenEditor, savedLeagues, activeKey, onSwitchLeague }:
  Pick<Props, "league" | "onImport" | "myManager" | "onChooseManager" | "onOpenEditor" | "savedLeagues" | "activeKey" | "onSwitchLeague">) {
  const [addingAnother, setAddingAnother] = useState(false);
  const [provider, setProvider] = useState<"sleeper" | "espn">("sleeper");
  const [id, setId] = useState("");
  const [season, setSeason] = useState(SOURCE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrivate, setShowPrivate] = useState(false);
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [remember, setRemember] = useState(false);

  // ESPN cookies stay in this browser only (and only if the user asks us to remember them).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ESPN_AUTH_KEY) ?? "null");
      if (saved?.espnS2) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEspnS2(saved.espnS2);
        setShowPrivate(true);
        setSwid(saved.swid ?? "");
        setRemember(true);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Accept a bare ID or a pasted league link (ESPN ...?leagueId=123, Sleeper .../league/123)
  const parsedId = (() => {
    const t = id.trim();
    const m = t.match(/leagueId=(\d+)/i) ?? t.match(/\/league\/(\d+)/i) ?? t.match(/^([A-Za-z0-9_-]{3,40})$/) ?? t.match(/(\d{5,})/);
    return m ? m[1] : "";
  })();
  const halfCookies = provider === "espn" && !!espnS2.trim() !== !!swid.trim();
  const canImport = !busy && !!parsedId && !halfCookies;

  const run = async () => {
    setBusy(true);
    setError(null);
    const usePrivate = provider === "espn" && espnS2.trim() && swid.trim();
    try {
      if (usePrivate && remember) localStorage.setItem(ESPN_AUTH_KEY, JSON.stringify({ espnS2: espnS2.trim(), swid: swid.trim() }));
      if (!remember) localStorage.removeItem(ESPN_AUTH_KEY);
    } catch {
      /* ignore */
    }
    try {
      const r = await fetch("/api/league", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider, id: parsedId, season,
          ...(usePrivate ? { espnS2: espnS2.trim(), swid: swid.trim() } : {}),
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `Import failed (${r.status})`);
      onImport(body as ImportedLeague);
      setId("");
      setAddingAnother(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  if (league && !addingAnother) {
    const picks = league.drafts.reduce((s, d) => s + d.picks.length, 0);
    return (
      <div className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Your league</h3>
          <button onClick={() => setAddingAnother(true)} className="text-[11px] font-semibold text-emerald-400 hover:underline">+ Add another league</button>
        </div>
        {savedLeagues.length > 1 && (
          <select value={activeKey ?? ""} onChange={(e) => onSwitchLeague(e.target.value)} aria-label="Switch league"
            className="mb-2 w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm text-slate-200 ring-1 ring-slate-700">
            {savedLeagues.map((l) => (
              <option key={l.key} value={l.key}>{l.name} ({l.provider === "manual" ? "by hand" : l.provider === "espn" ? "ESPN" : "Sleeper"})</option>
            ))}
          </select>
        )}
        <div className="rounded-lg bg-emerald-500/10 p-3 ring-1 ring-emerald-500/30">
          <div className="text-sm font-semibold text-white">{league.name}</div>
          <div className="text-xs text-slate-400">
            {league.provider === "sleeper" ? "Sleeper" : league.provider === "espn" ? "ESPN" : "Set up by hand"} · {league.season} · {league.teams} teams · {league.drafts.length} past draft{league.drafts.length === 1 ? "" : "s"} ({picks} picks)
          </div>
        </div>
        {league.managers.length > 0 && (
          <label className="mt-3 block text-xs text-slate-400">
            Which team is yours? (the others become mock-draft bots)
            <select value={myManager ?? ""} onChange={(e) => onChooseManager(e.target.value || null)}
              className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm text-slate-200 ring-1 ring-slate-700">
              <option value="">Not set</option>
              {league.managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
        {league.notes.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-[11px] text-amber-300/80">
            {league.notes.map((n) => <li key={n}>• {n}</li>)}
          </ul>
        )}
        <button onClick={onOpenEditor} className="mt-3 w-full rounded-lg bg-slate-800 py-2 text-sm font-semibold text-slate-200 ring-1 ring-slate-700 hover:bg-slate-700">
          Describe leaguemates &amp; edit rosters
        </button>
        <button onClick={() => onImport(null)} className="mt-3 block text-xs text-slate-400 underline hover:text-white">
          {savedLeagues.length > 1 ? "Remove this league" : "Remove league and go back to the site defaults"}
        </button>
      </div>
    );
  }
  return (
    <div className="py-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{league ? "Add another league" : "Import your league"}</h3>
        {league && <button onClick={() => setAddingAnother(false)} className="text-[11px] text-slate-400 hover:text-white">Cancel</button>}
      </div>
      <p className="mb-2 text-[11px] text-slate-500">Loads your roster slots, scoring and past drafts. Sleeper works for any league; ESPN leagues must be public.</p>
      <div className="flex gap-1 rounded-lg bg-slate-800/70 p-1">
        {(["sleeper", "espn"] as const).map((p) => (
          <button key={p} onClick={() => setProvider(p)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm ${provider === p ? "bg-slate-600 font-semibold text-white" : "text-slate-300"}`}>
            {p === "sleeper" ? "Sleeper" : "ESPN"}
          </button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (canImport) run(); }}>
      <label className="mt-2 block text-[11px] text-slate-400">
        League ID or the league&apos;s web address
        <div className="mt-1 flex gap-2">
          <input value={id} onChange={(e) => setId(e.target.value)} inputMode="url"
            placeholder={provider === "espn" ? "e.g. 1198249072 or the ESPN league link" : "e.g. 1180208789911158784 or the Sleeper league link"}
            className="min-w-0 flex-1 rounded-md bg-slate-800 px-2 py-1.5 text-sm text-white ring-1 ring-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-emerald-500" />
          {provider === "espn" && (
            <select value={season} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season"
              className="rounded-md bg-slate-800 px-2 py-1.5 text-sm text-slate-200 ring-1 ring-slate-700">
              {[SOURCE, PRIOR].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
        {id.trim() && parsedId !== id.trim() && parsedId && <span className="mt-1 block text-[10px] text-emerald-400">Found league ID {parsedId}</span>}
      </label>
      {provider === "espn" && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowPrivate((v) => !v)} className="text-xs text-emerald-400 hover:underline">
            {showPrivate ? "▾" : "▸"} Private league? Use your ESPN login
          </button>
          {showPrivate && (
            <div className="mt-2 space-y-2 rounded-lg bg-slate-800/50 p-3 text-[11px] text-slate-400">
              <p>
                ESPN doesn&apos;t offer &quot;Sign in with ESPN&quot; to other sites, so private leagues need two cookies from your
                own logged-in browser. On a computer: open <b>fantasy.espn.com</b> while logged in → press F12 → Application
                (Chrome) or Storage (Firefox) → Cookies → espn.com → copy <b>espn_s2</b> and <b>SWID</b>.
              </p>
              <input value={espnS2} onChange={(e) => setEspnS2(e.target.value)} placeholder="espn_s2" type="password" autoComplete="off"
                className="w-full rounded-md bg-slate-900 px-2 py-1.5 text-xs text-white ring-1 ring-slate-700 placeholder:text-slate-500" />
              <input value={swid} onChange={(e) => setSwid(e.target.value)} placeholder="SWID, like {XXXXXXXX-XXXX-...}" autoComplete="off"
                className="w-full rounded-md bg-slate-900 px-2 py-1.5 text-xs text-white ring-1 ring-slate-700 placeholder:text-slate-500" />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-emerald-500" />
                Remember on this device (stored only in this browser)
              </label>
              <p className="text-slate-500">
                These cookies are sent to ESPN once to read your league and are never stored on our server. They work like a
                password for your ESPN account: only paste them here on your own device, and log out of ESPN to revoke them.
              </p>
            </div>
          )}
        </div>
      )}
      <button type="submit" disabled={!canImport}
        className="mt-3 w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 disabled:bg-slate-800 disabled:text-slate-500">
        {busy ? "Importing…" : !parsedId ? "Enter your league ID above" : halfCookies ? "Add both espn_s2 and SWID" : "Import league"}
      </button>
      </form>
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      <button onClick={onOpenEditor} className="mt-3 text-xs text-emerald-400 hover:underline">
        No import? Set up your league and leaguemates by hand →
      </button>
    </div>
  );
}

function Seg({ label, hint, value, options: preset, onPick }: {
  label: string; hint: string; value: number; options: { v: number; label: string }[]; onPick: (v: number) => void;
}) {
  // An imported league can carry a value outside the presets (e.g. 0.25 PPR); show it as its own option.
  const options = preset.some((o) => o.v === value) ? preset : [...preset, { v: value, label: `${value} (league)` }];
  return (
    <div className="py-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className="text-[11px] text-slate-500">{hint}</span>
      </div>
      <Glide pill="rounded-md bg-emerald-500" className="grid grid-flow-col gap-1 rounded-lg bg-slate-800/70 p-1">
        {options.map((o) => (
          <button
            key={o.v}
            onClick={() => onPick(o.v)}
            data-active={value === o.v}
            className={`rounded-md px-3 py-1.5 text-sm ${value === o.v ? "font-semibold text-slate-950" : "text-slate-300 hover:bg-slate-700/60"}`}
          >
            {o.label}
          </button>
        ))}
      </Glide>
    </div>
  );
}

export default function SettingsDrawer({ open, onClose, toggles, defaults, onChange, cfg, replacement, league, onImport, myManager, onChooseManager, onOpenEditor, savedLeagues, activeKey, onSwitchLeague, keeper, onKeeper }: Props) {
  const set = (patch: Partial<Toggles>) => onChange({ ...toggles, ...patch });
  const r = cfg.roster;
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-slate-800 bg-slate-900 shadow-2xl transition-transform duration-500 ease-[var(--ease-sheet)] ${open ? "translate-x-0" : "translate-x-full"}`}
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
          <LeagueImport league={league} onImport={onImport} myManager={myManager} onChooseManager={onChooseManager} onOpenEditor={onOpenEditor}
            savedLeagues={savedLeagues} activeKey={activeKey} onSwitchLeague={onSwitchLeague} />
          <Seg label="League type" hint="keeper adds next-season value" value={keeper ? 1 : 0}
            options={[{ v: 0, label: "Redraft" }, { v: 1, label: "Keeper" }]} onPick={(v) => onKeeper(v === 1)} />
          <Seg label="FLEX spots" hint="RB / WR / TE" value={toggles.flexCount}
            options={[{ v: 1, label: "1 FLEX" }, { v: 2, label: "2 FLEX" }]} onPick={(v) => set({ flexCount: v })} />
          <Seg label="Superflex" hint="flex spot a QB can fill" value={toggles.superflex}
            options={[{ v: 0, label: "Off" }, { v: 1, label: "On" }]} onPick={(v) => set({ superflex: v })} />
          <Seg label="Reception scoring" hint="points per catch" value={toggles.ppr}
            options={[{ v: 1, label: "Full PPR" }, { v: 0.5, label: "Half PPR" }]} onPick={(v) => set({ ppr: v })} />
          <Seg label="Passing TD" hint="points" value={toggles.passTd}
            options={[{ v: 4, label: "4 pts" }, { v: 6, label: "6 pts" }]} onPick={(v) => set({ passTd: v })} />
          <Seg label="TE Premium" hint="bonus per TE catch" value={toggles.tePremium}
            options={[{ v: 0, label: "Off" }, { v: 0.5, label: "+0.5" }]} onPick={(v) => set({ tePremium: v })} />

          <div className="py-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Active league</h3>
            <p className="text-sm text-slate-300">
              {cfg.teams} teams · {r.QB} QB · {r.RB} RB · {r.WR} WR · {r.TE} TE · {toggles.flexCount} FLEX{r.SUPERFLEX ? ` · ${r.SUPERFLEX} SFLEX` : ""}{r.K ? ` · ${r.K} K` : ""}{r.DST ? ` · ${r.DST} D/ST` : ""} · {r.BENCH} BN · {cfg.draft_rounds} rounds
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
            {league ? `Reset to ${league.name} settings` : "Reset to site defaults"}
          </button>
          <BackupRestore />
        </div>
      </aside>
    </>
  );
}
