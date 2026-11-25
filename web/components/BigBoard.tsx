"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { LeagueConfig, Pos, RankedPlayer } from "@/lib/types";
import { roundPick } from "@/lib/engine";
import { Delta, Flags, PosBadge, TierBadge, fmt, pct, thumb } from "./ui";
import { PRIOR, SOURCE, TARGET, yy } from "@/lib/season";

type Filter = "ALL" | Pos | "ROOKIES";
const FILTERS: Filter[] = ["ALL", "QB", "RB", "WR", "TE", "ROOKIES"];
// Rows rendered per batch; more are added as the user scrolls (keeps re-renders cheap on phones).
const PAGE = 60;
type SortKey = "rank" | "adp" | "espn" | "ppg" | "vorp" | "ppg26" | "delta";

function StatLine({ p }: { p: RankedPlayer }) {
  const s = p.proj;
  const items: [string, string][] =
    p.pos === "QB"
      ? [["Pass Yds", fmt(s.pass_yds, 0)], ["Pass TD", fmt(s.pass_td, 2)], ["INT", fmt(s.pass_int, 2)], ["Rush Yds", fmt(s.rush_yds, 1)], ["Rush TD", fmt(s.rush_td, 2)]]
      : [["Carries", fmt(s.rush_att, 1)], ["Rush Yds", fmt(s.rush_yds, 1)], ["Rush TD", fmt(s.rush_td, 2)], ["Targets", fmt(s.targets, 1)], ["Rec", fmt(s.rec, 1)], ["Rec Yds", fmt(s.rec_yds, 1)], ["Rec TD", fmt(s.rec_td, 2)]];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1">
      {items.map(([k, v]) => (
        <div key={k} className="text-xs"><span className="text-slate-500">{k}</span> <span className="tabular-nums text-slate-200">{v}</span></div>
      ))}
    </div>
  );
}

function Avatar({ p, size = 28 }: { p: RankedPlayer; size?: number }) {
  return p.headshot ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={thumb(p.headshot)!} alt="" width={size} height={size} style={{ width: size, height: size }}
      className="shrink-0 rounded-full bg-slate-800 object-cover" loading="lazy" decoding="async" />
  ) : (
    <div style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-500">{p.pos}</div>
  );
}

function PlayerDetail({ p }: { p: RankedPlayer }) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {TARGET} projected per game · {fmt(p.projGames, 1)} games
        </div>
        <StatLine p={p} />
        <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Why the model moved him</div>
        <ul className="mt-1 text-xs text-slate-300">
          {p.notes.length ? p.notes.map((n) => <li key={n}>• {n}</li>) : <li className="text-slate-500">No age / injury / role adjustments</li>}
        </ul>
      </div>
      <div className="space-y-0.5 text-xs text-slate-400 md:text-right">
        {!p.rookie && <div>{PRIOR}: {p.g25} G · {SOURCE}: {p.g26} G</div>}
        {!p.rookie && p.g26 > 0 && <div>{SOURCE}: {fmt(p.cur.ppg26)} PPG · targets {pct(p.tgtShare)} · touches {pct(p.touchShare)}</div>}
        {p.espnAdp != null && <div>ESPN ADP: {fmt(p.espnAdp)}{p.espnOwned != null ? ` · ${p.espnOwned.toFixed(1)}% rostered` : ""}</div>}
        {p.cur.espnRosPpg != null && <div>ESPN rest-of-{SOURCE} proj: {fmt(p.cur.espnRosPpg)} PPG</div>}
        {p.rookie && <div>Draft capital tier {p.draftTier}</div>}
      </div>
    </div>
  );
}

/** Phone layout: one tappable card per player. */
function PlayerCard({ p, cfg, open, onToggle }: { p: RankedPlayer; cfg: LeagueConfig; open: boolean; onToggle: () => void }) {
  return (
    <li className="border-b border-slate-800/70 last:border-0">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-slate-800/50">
        <div className="w-8 shrink-0 text-center">
          <div className="text-sm font-bold tabular-nums text-slate-200">{p.cur.rank}</div>
          <div className="text-[10px]"><Delta value={p.rankDelta} /></div>
        </div>
        <Avatar p={p} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-white">{p.name}</span>
            <Flags flags={p.flags} notes={p.notes} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <PosBadge pos={p.pos} rank={p.cur.posRank} />
            <TierBadge tier={p.cur.tier} />
            <span className="truncate">{p.rookie ? p.college ?? "Rookie" : p.team} · ADP {roundPick(p.cur.adp, cfg.teams)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-base font-bold tabular-nums text-white">{fmt(p.cur.ppg)}</div>
          <div className={`text-[10px] tabular-nums ${p.cur.vorp >= 0 ? "text-emerald-400" : "text-slate-500"}`}>VORP {fmt(p.cur.vorp, 0)}</div>
        </div>
      </button>
      {open && <div className="bg-slate-900/70 px-4 pb-3 pt-1"><PlayerDetail p={p} /></div>}
    </li>
  );
}

function Th({ k, sort, setSort, children, className = "" }: {
  k?: SortKey; sort: SortKey; setSort: (k: SortKey) => void; children: React.ReactNode; className?: string;
}) {
  return (
    <th
      onClick={k ? () => setSort(k) : undefined}
      className={`px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide ${k ? "cursor-pointer select-none hover:text-white" : ""} ${sort === k ? "text-emerald-400" : "text-slate-400"} ${className}`}
    >
      {children}
    </th>
  );
}

export default function BigBoard({ board, cfg, nonDefault, showEspn = true }: {
  board: RankedPlayer[]; cfg: LeagueConfig; nonDefault: boolean; showEspn?: boolean;
}) {
  const cols = showEspn ? 13 : 12;
  const [filter, setFilter] = useState<Filter>("ALL");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("rank");
  const [open, setOpen] = useState<string | null>(null);
  const size = cfg.projection.board_size;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = board.filter((p) => {
      if (filter === "ALL" && p.cur.rank > size && !needle) return false;
      if (filter === "ROOKIES" && !p.rookie) return false;
      if (filter !== "ALL" && filter !== "ROOKIES" && p.pos !== filter) return false;
      if (needle && !`${p.name} ${p.team} ${p.college ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const key: Record<SortKey, (p: RankedPlayer) => number> = {
      rank: (p) => p.cur.rank,
      adp: (p) => p.cur.adp,
      espn: (p) => p.espnAdp ?? 9999,
      ppg: (p) => -p.cur.ppg,
      vorp: (p) => -p.cur.vorp,
      ppg26: (p) => -p.cur.ppg26,
      delta: (p) => -(p.rankDelta ?? -999),
    };
    r = [...r].sort((a, b) => key[sort](a) - key[sort](b));
    return r;
  }, [board, filter, q, sort, size]);

  const showTierBreaks = sort === "rank" && !q;

  // Progressive rendering: the visible count resets whenever the filter / search / sort changes.
  const listKey = `${filter}|${q}|${sort}`;
  const [shown, setShown] = useState({ key: listKey, n: PAGE });
  const limit = shown.key === listKey ? shown.n : PAGE;
  const visible = rows.slice(0, limit);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= rows.length) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown({ key: listKey, n: limit + PAGE });
    }, { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, rows.length, listKey]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex max-w-full overflow-x-auto rounded-lg bg-slate-900 p-1 ring-1 ring-slate-800 [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${filter === f ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}>
              {f}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player, team, college…"
          className="order-first w-full min-w-0 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white ring-1 ring-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-emerald-500 sm:order-none sm:w-auto sm:flex-1 sm:max-w-xs"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by"
          className="rounded-lg bg-slate-900 px-2 py-2 text-xs text-slate-300 ring-1 ring-slate-800 md:hidden">
          <option value="rank">Sort: Rank</option><option value="adp">Sort: ADP</option><option value="ppg">Sort: PPG</option>
          <option value="vorp">Sort: VORP</option><option value="delta">Sort: Weekly move</option>
        </select>
        <span className="text-xs text-slate-500">{rows.length} players{filter === "ALL" && !q ? ` · Top ${size}` : ""}</span>
      </div>

      <ul className="overflow-hidden rounded-xl bg-slate-950 ring-1 ring-slate-800 md:hidden">
        {visible.map((p, i) => {
          const prev = visible[i - 1];
          const tierBreak = showTierBreaks && prev && prev.cur.tier !== p.cur.tier && filter === "ALL";
          return (
            <Fragment key={p.id}>
              {tierBreak && <li className="bg-slate-900/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Tier {p.cur.tier}</li>}
              <PlayerCard p={p} cfg={cfg} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />
            </Fragment>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl ring-1 ring-slate-800 md:block">
        <table className={`w-full ${showEspn ? "min-w-[1040px]" : "min-w-[960px]"} border-collapse text-sm`}>
          <thead className="sticky top-0 z-10 bg-slate-900">
            <tr className="border-b border-slate-800">
              <Th sort={sort} setSort={setSort} k="rank" className="w-12">Rk</Th>
              <Th sort={sort} setSort={setSort} k="delta" className="w-14">Wk Δ</Th>
              <Th sort={sort} setSort={setSort}>Player</Th>
              <Th sort={sort} setSort={setSort} className="w-16">Pos</Th>
              <Th sort={sort} setSort={setSort} className="w-12">Tier</Th>
              <Th sort={sort} setSort={setSort} k="adp" className="w-20">ADP</Th>
              {showEspn && <Th sort={sort} setSort={setSort} k="espn" className="w-20">ESPN ADP</Th>}
              <Th sort={sort} setSort={setSort} k="ppg" className="w-20">{yy(TARGET)} PPG</Th>
              <Th sort={sort} setSort={setSort} className="w-16">{yy(TARGET)} Pts</Th>
              <Th sort={sort} setSort={setSort} k="vorp" className="w-16">VORP</Th>
              <Th sort={sort} setSort={setSort} className="w-12">{yy(SOURCE)} G</Th>
              <Th sort={sort} setSort={setSort} k="ppg26" className="w-16">{yy(SOURCE)} PPG</Th>
              <Th sort={sort} setSort={setSort} className="w-20">Tgt / Tch</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p, i) => {
              const prev = visible[i - 1];
              const tierBreak = showTierBreaks && prev && prev.cur.tier !== p.cur.tier && filter === "ALL";
              return (
                <Fragment key={p.id}>
                  {tierBreak && (
                    <tr><td colSpan={cols} className="bg-slate-900/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Tier {p.cur.tier}</td></tr>
                  )}
                  <tr
                    onClick={() => setOpen(open === p.id ? null : p.id)}
                    className="cursor-pointer border-b border-slate-800/70 hover:bg-slate-800/40"
                  >
                    <td className="px-2 py-2 tabular-nums text-slate-300">{p.cur.rank}</td>
                    <td className="px-2 py-2 text-xs">
                      <Delta value={p.rankDelta} />
                      {nonDefault && p.cur.settingsDelta !== 0 && (
                        <div className="text-[10px] text-slate-500" title="Change vs. default league settings">
                          {p.cur.settingsDelta > 0 ? "+" : ""}{p.cur.settingsDelta} cfg
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar p={p} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-white">{p.name}</span>
                            <Flags flags={p.flags} notes={p.notes} />
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {p.rookie ? `${p.college ?? ""} · Rookie` : p.team}
                            {p.age != null && ` · ${p.age.toFixed(1)} yo in '${yy(TARGET)}`}
                            {p.injury && <span className="text-red-400"> · {p.injury}{p.injuryPart ? ` (${p.injuryPart})` : ""}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2"><PosBadge pos={p.pos} rank={p.cur.posRank} /></td>
                    <td className="px-2 py-2"><TierBadge tier={p.cur.tier} /></td>
                    <td className="px-2 py-2 tabular-nums text-slate-300">
                      {p.cur.adp}<span className="ml-1 text-[10px] text-slate-500">{roundPick(p.cur.adp, cfg.teams)}</span>
                    </td>
                    {showEspn && (
                      <td className="px-2 py-2 tabular-nums text-slate-300" title="ESPN average draft position · % of ESPN leagues rostered">
                        {p.espnAdp != null ? fmt(p.espnAdp) : <span className="text-slate-600">—</span>}
                        {p.espnOwned != null && <div className="text-[10px] text-slate-500">{p.espnOwned.toFixed(0)}% rost</div>}
                      </td>
                    )}
                    <td className="px-2 py-2 font-semibold tabular-nums text-white">{fmt(p.cur.ppg)}</td>
                    <td className="px-2 py-2 tabular-nums text-slate-400">{fmt(p.cur.points, 0)}</td>
                    <td className={`px-2 py-2 tabular-nums font-medium ${p.cur.vorp >= 0 ? "text-emerald-300" : "text-slate-500"}`}>{fmt(p.cur.vorp, 0)}</td>
                    <td className="px-2 py-2 tabular-nums text-slate-400">{p.rookie ? "—" : p.g26}</td>
                    <td className="px-2 py-2 tabular-nums text-slate-300">{p.rookie || !p.g26 ? "—" : fmt(p.cur.ppg26)}</td>
                    <td className="px-2 py-2 text-xs tabular-nums text-slate-400">{pct(p.tgtShare)} / {pct(p.touchShare)}</td>
                  </tr>
                  {open === p.id && (
                    <tr className="border-b border-slate-800 bg-slate-900/70">
                      <td colSpan={cols} className="px-4 py-3">
                        <PlayerDetail p={p} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {limit < rows.length && (
        <div ref={sentinel} className="py-4 text-center text-xs text-slate-500">
          Showing {limit} of {rows.length} — scroll for more
        </div>
      )}
    </section>
  );
}
