"use client";

import { useMemo, useState } from "react";
import type { LeaguemateProfile } from "@/lib/leaguemates";
import {
  PRESETS, type ProfileOverride, applyDescription, applyPreset, overrideFromLearned,
} from "@/lib/profiles";
import { boardMaps, resolveRoster } from "@/lib/rosters";
import { SOURCE } from "@/lib/season";
import type { ImportedLeague, LeagueConfig, Pos, RankedPlayer } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { IconClose } from "./icons";
import { PosBadge } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  board: RankedPlayer[];
  cfg: LeagueConfig;
  league: ImportedLeague | null;
  learned: LeaguemateProfile[];
  overrides: Record<string, ProfileOverride>;
  onOverrides: (o: Record<string, ProfileOverride>) => void;
  onLeagueChange: (l: ImportedLeague) => void;
  myManager: string | null;
}

function Slider({ label, value, min, max, step, onChange, left, right }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; left: string; right: string;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-[11px]"><span className="text-slate-300">{label}</span><span className="tabular-nums text-slate-500">{value > 0 && min < 0 ? "+" : ""}{value}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-emerald-500" />
      <div className="flex justify-between text-[10px] text-slate-600"><span>{left}</span><span>{right}</span></div>
    </label>
  );
}

function ManualSetup({ cfg, onCreate }: { cfg: LeagueConfig; onCreate: (l: ImportedLeague) => void }) {
  const [name, setName] = useState("My league");
  const [teams, setTeams] = useState(Array.from({ length: cfg.teams }, (_, i) => (i === 0 ? "Me" : `Team ${i + 1}`)).join("\n"));
  const create = () => {
    const names = teams.split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 20);
    const managers = names.map((n, i) => ({ id: `m${i + 1}`, name: n }));
    onCreate({
      provider: "manual", leagueId: `manual-${names.length}`, season: String(SOURCE), name: name.trim() || "My league",
      teams: managers.length, roster: { ...cfg.roster }, scoring: { ...cfg.scoring }, draftRounds: cfg.draft_rounds,
      notes: [], managers, drafts: [], rosters: managers.map((m) => ({ managerId: m.id, playerIds: [], idType: "sleeper", manualIds: [] })),
      fetchedAt: new Date().toISOString(),
    });
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        No Sleeper or ESPN import? Set your league up by hand. It uses your current scoring and roster settings; then describe each
        leaguemate below and, for the trade assistant, add their players.
      </p>
      <label className="block text-xs text-slate-400">League name
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-slate-700" />
      </label>
      <label className="block text-xs text-slate-400">Teams, one per line (put yours first)
        <textarea value={teams} onChange={(e) => setTeams(e.target.value)} rows={8} className="mt-1 w-full rounded-md bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-slate-700" />
      </label>
      <button onClick={create} className="w-full rounded-lg bg-emerald-500 py-2 text-sm font-bold text-slate-950">Create league</button>
    </div>
  );
}

function ManagerCard({ name, learned, override, onOverride, onReset, roster, onRosterEdit, board, isMe, editableName, onRename }: {
  name: string; learned?: LeaguemateProfile; override?: ProfileOverride;
  onOverride: (o: ProfileOverride) => void; onReset: () => void;
  roster: RankedPlayer[] | null; onRosterEdit: (add?: string, remove?: string) => void; board: RankedPlayer[];
  isMe: boolean; editableName: boolean; onRename: (n: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState(override?.note ?? "");
  const [understood, setUnderstood] = useState<string[] | null>(null);
  const [q, setQ] = useState("");
  const o = override ?? overrideFromLearned(learned);
  const set = (patch: Partial<ProfileOverride>) => onOverride({ ...o, ...patch, preset: patch.preset ?? "custom" });
  const setLean = (pos: Pos, v: number) => onOverride({ ...o, lean: { ...o.lean, [pos]: v }, preset: "custom" });
  const matches = q.trim().length >= 2
    ? board.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()) && !roster?.some((r) => r.id === p.id)).slice(0, 6)
    : [];
  const leans = POSITIONS.filter((p) => Math.abs(o.lean[p]) >= 1).map((p) => `${o.lean[p] > 0 ? "+" : ""}${o.lean[p]} ${p}`);

  return (
    <div className={`rounded-xl ring-1 ${override ? "bg-emerald-500/5 ring-emerald-500/30" : "bg-slate-900/60 ring-slate-800"}`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">{name}</span>
            {isMe && <span className="rounded bg-emerald-500/20 px-1.5 text-[10px] font-bold text-emerald-300">YOU</span>}
            {override && <span className="rounded bg-slate-700 px-1.5 text-[10px] font-semibold text-slate-200">EDITED</span>}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {override ? (leans.join(" · ") || "balanced") + (o.tradeOpenness ? ` · trades ${o.tradeOpenness > 0 ? "often" : "rarely"}` : "")
              : learned?.picksSeen ? learned.style : "no draft history yet (balanced)"}
            {roster ? ` · ${roster.length} players` : ""}
          </div>
        </div>
        <span className="text-slate-500">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-800 px-4 py-3">
          {editableName && (
            <input value={name} onChange={(e) => onRename(e.target.value)} className="w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm text-white ring-1 ring-slate-700" aria-label="Team name" />
          )}
          {!isMe && (
            <>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Describe how they draft and trade</div>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
                  placeholder="e.g. takes a QB early, loves rookies, reaches a lot, never trades"
                  className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-slate-700 placeholder:text-slate-500" />
                <div className="mt-1 flex items-center gap-2">
                  <button onClick={() => { const r = applyDescription(o, desc); onOverride(r.override); setUnderstood(r.understood); }}
                    disabled={!desc.trim()} className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-bold text-slate-950 disabled:bg-slate-800 disabled:text-slate-600">Apply description</button>
                  {understood && <span className="text-[11px] text-slate-400">{understood.length ? `Understood: ${understood.join(", ")}` : "Didn't recognize anything. Try words like “early QB”, “loves RBs”, “rookies”, “never trades”."}</span>}
                </div>
              </div>
              <label className="block text-[11px] text-slate-400">Style preset
                <select value={PRESETS.some((p) => p.id === o.preset) ? o.preset : ""} onChange={(e) => onOverride(applyPreset(o, e.target.value))}
                  className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm text-slate-200 ring-1 ring-slate-700">
                  <option value="">{o.preset === "learned" ? "Learned from past drafts" : "Custom"}</option>
                  {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {POSITIONS.map((pos) => (
                  <Slider key={pos} label={`${pos} lean (early rounds)`} value={o.lean[pos]} min={-8} max={8} step={0.5}
                    onChange={(v) => setLean(pos, v)} left="avoids" right="reaches for" />
                ))}
                <Slider label="Randomness" value={o.noise} min={0.5} max={8} step={0.5} onChange={(v) => set({ noise: v })} left="by the book" right="chaos" />
                <Slider label="Rookies vs veterans" value={o.rookieBias} min={-8} max={8} step={1} onChange={(v) => set({ rookieBias: v })} left="vets only" right="loves rookies" />
                <Slider label="Follows positional runs" value={o.runSensitivity} min={0} max={2.5} step={0.1} onChange={(v) => set({ runSensitivity: v })} left="ignores" right="herd" />
                <Slider label="Trade openness" value={o.tradeOpenness} min={-2} max={2} step={0.5} onChange={(v) => set({ tradeOpenness: v })} left="never trades" right="trades anything" />
              </div>
              {override && <button onClick={() => { onReset(); setDesc(""); setUnderstood(null); }} className="text-xs text-slate-400 underline hover:text-white">Reset to {learned?.picksSeen ? "what was learned from past drafts" : "balanced"}</button>}
            </>
          )}
          {roster && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Roster (for the trade assistant)</div>
              <div className="flex flex-wrap gap-1">
                {roster.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-slate-800 py-0.5 pl-1 pr-2 text-xs text-slate-200">
                    <PosBadge pos={p.pos} />{p.name}
                    <button onClick={() => onRosterEdit(undefined, p.id)} aria-label={`Remove ${p.name}`} className="ml-0.5 text-slate-500 hover:text-rose-300">×</button>
                  </span>
                ))}
                {roster.length === 0 && <span className="text-xs text-slate-500">No players yet.</span>}
              </div>
              <div className="relative mt-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a player…"
                  className="w-full rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white ring-1 ring-slate-700 placeholder:text-slate-500" />
                {matches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md bg-slate-800 ring-1 ring-slate-700">
                    {matches.map((p) => (
                      <button key={p.id} onClick={() => { onRosterEdit(p.id); setQ(""); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-700">
                        <PosBadge pos={p.pos} /><span className="flex-1 text-white">{p.name}</span><span className="text-xs text-slate-400">{p.team}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LeagueEditor({ open, onClose, board, cfg, league, learned, overrides, onOverrides, onLeagueChange, myManager }: Props) {
  const { byId, byEspn } = useMemo(() => boardMaps(board), [board]);
  const learnedBy = useMemo(() => new Map(learned.map((l) => [l.managerId, l])), [learned]);
  if (!open) return null;

  const editRoster = (managerId: string, add?: string, remove?: string) => {
    if (!league?.rosters) return;
    onLeagueChange({
      ...league,
      rosters: league.rosters.map((r) => {
        if (r.managerId !== managerId) return r;
        const manual = new Set(r.manualIds ?? []);
        const removed = new Set(r.removedIds ?? []);
        if (add) { manual.add(add); removed.delete(add); }
        if (remove) { if (manual.has(remove)) manual.delete(remove); else removed.add(remove); }
        return { ...r, manualIds: [...manual], removedIds: [...removed] };
      }),
    });
  };
  const rename = (managerId: string, name: string) => {
    if (!league) return;
    onLeagueChange({ ...league, managers: league.managers.map((m) => (m.id === managerId ? { ...m, name } : m)) });
  };
  const addTeam = () => {
    if (!league) return;
    const used = new Set(league.managers.map((m) => m.id));
    let n = league.managers.length + 1;
    while (used.has(`m${n}`)) n += 1;
    const id = `m${n}`;
    onLeagueChange({
      ...league, teams: league.teams + 1, managers: [...league.managers, { id, name: `Team ${league.managers.length + 1}` }],
      rosters: [...(league.rosters ?? []), { managerId: id, playerIds: [], idType: "sleeper", manualIds: [] }],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="flex h-full w-full max-w-2xl flex-col bg-slate-950 ring-1 ring-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white">{league ? `Leaguemates · ${league.name}` : "Set up your league"}</h2>
            <p className="text-xs text-slate-400">Your edits override anything learned automatically, for the mock draft bots and the trade assistant.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close"><IconClose className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-5">
          {!league ? <ManualSetup cfg={cfg} onCreate={onLeagueChange} /> : (
            <>
              <div className="rounded-xl bg-slate-900 p-4 ring-1 ring-slate-800">
                <div className="text-sm font-semibold text-white">League rules</div>
                <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-sm text-slate-300">
                  <input type="checkbox" checked={!!league.rules?.weekTrades} className="mt-0.5 accent-emerald-500"
                    onChange={(e) => onLeagueChange({ ...league, rules: { ...league.rules, weekTrades: e.target.checked } })} />
                  <span>
                    This league allows 1-week trades
                    <span className="block text-xs text-slate-500">Players swap for one week, then go back. Adds a &quot;1-week trade&quot; option when you click a player in My League.</span>
                  </span>
                </label>
              </div>
              {league.managers.map((m) => {
                const r = league.rosters?.find((x) => x.managerId === m.id);
                return (
                  <ManagerCard key={m.id} name={m.name} learned={learnedBy.get(m.id)} override={overrides[m.id]}
                    onOverride={(o) => onOverrides({ ...overrides, [m.id]: o })}
                    onReset={() => { const n = { ...overrides }; delete n[m.id]; onOverrides(n); }}
                    roster={r ? resolveRoster(r, byId, byEspn) : null} onRosterEdit={(a, rm) => editRoster(m.id, a, rm)}
                    board={board} isMe={m.id === myManager} editableName={league.provider === "manual"} onRename={(n) => rename(m.id, n)} />
                );
              })}
              {league.provider === "manual" && (
                <button onClick={addTeam} className="w-full rounded-lg border border-dashed border-slate-700 py-2 text-sm text-slate-400 hover:text-white">+ Add a team</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
