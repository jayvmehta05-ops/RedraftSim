/**
 * League-wide tools built on the imported rosters: waiver pickups and power rankings.
 * Values come from lib/trade.ts (best starting lineup under the league's slots, plus light bench depth).
 */
import { lineupValue, positionStrength, type Valued } from "./trade";
import type { LeagueConfig, Pos, RankedPlayer } from "./types";
import { POSITIONS } from "./types";

export interface Pickup {
  add: Valued;
  drop: Valued | null;
  gain: number;
  gainPct: number;
  starts: boolean;
  replaces: Valued | null;
  bid: { label: string; pct: [number, number] | null };
}

/** Roster spots that hold QB/RB/WR/TE (K, D/ST and IR aren't valued). */
export function skillRosterLimit(cfg: LeagueConfig): number {
  const r = cfg.roster;
  return r.QB + r.RB + r.WR + r.TE + r.FLEX + (r.SUPERFLEX ?? 0) + r.BENCH;
}

function bidFor(gainPct: number): Pickup["bid"] {
  if (gainPct >= 0.03) return { label: "Big bid", pct: [15, 25] };
  if (gainPct >= 0.012) return { label: "Solid bid", pct: [5, 12] };
  if (gainPct >= 0.004) return { label: "Small bid", pct: [1, 4] };
  return { label: "Min bid / low waiver priority", pct: null };
}

/** Free agents ranked by how much they improve *your* best lineup, with the best player to drop. */
export function findPickups(mine: Valued[], freeAgents: Valued[], cfg: LeagueConfig, limit = skillRosterLimit(cfg)): Pickup[] {
  const before = lineupValue(mine, cfg);
  const starterIds = new Set(before.starters.map((x) => x.p.id));
  const dropCands = [...mine].filter((x) => !starterIds.has(x.p.id)).sort((a, b) => a.v - b.v).slice(0, 4);
  const needsDrop = mine.length >= limit;
  const out: Pickup[] = [];
  for (const fa of [...freeAgents].sort((a, b) => b.v - a.v).slice(0, 80)) {
    let best: { drop: Valued | null; total: number; starters: Valued[] } | null = null;
    const options: (Valued | null)[] = needsDrop ? (dropCands.length ? dropCands : [null]) : [null];
    for (const drop of options) {
      const next = [...mine.filter((x) => x.p.id !== drop?.p.id), fa];
      const after = lineupValue(next, cfg);
      if (!best || after.total > best.total) best = { drop, total: after.total, starters: after.starters };
    }
    if (!best) continue;
    const gain = best.total - before.total;
    if (gain <= 0.5) continue;
    const starts = best.starters.some((x) => x.p.id === fa.p.id);
    // Who loses their starting spot (same position, lowest-valued current starter)
    const replaced = starts
      ? before.starters.filter((x) => x.p.pos === fa.p.pos && !best!.starters.some((y) => y.p.id === x.p.id)).sort((a, b) => a.v - b.v)[0]
        ?? before.starters.filter((x) => !best!.starters.some((y) => y.p.id === x.p.id))[0] ?? null
      : null;
    const gainPct = gain / Math.max(before.total, 1);
    out.push({ add: fa, drop: best.drop, gain, gainPct, starts, replaces: replaced, bid: bidFor(gainPct) });
  }
  return out.sort((a, b) => b.gain - a.gain).slice(0, 20);
}

export interface PowerRow {
  id: string;
  name: string;
  rank: number;
  total: number;
  starters: number;
  best: RankedPlayer | null;
  strengths: Record<Pos, number>; // vs league average, e.g. +0.12
  record?: { wins: number; losses: number; ties: number; pointsFor: number };
  recordRank?: number;
}

export function powerRankings(teams: { id: string; name: string; roster: Valued[]; record?: PowerRow["record"] }[], cfg: LeagueConfig): PowerRow[] {
  const filled = teams.filter((t) => t.roster.length > 0);
  const avg = { QB: 0, RB: 0, WR: 0, TE: 0 } as Record<Pos, number>;
  const strengthBy = new Map(filled.map((t) => [t.id, positionStrength(t.roster, cfg)]));
  for (const s of strengthBy.values()) POSITIONS.forEach((p) => (avg[p] += s[p] / filled.length));
  const rows: PowerRow[] = filled.map((t) => {
    const lv = lineupValue(t.roster, cfg);
    const s = strengthBy.get(t.id)!;
    const strengths = Object.fromEntries(POSITIONS.map((p) => [p, avg[p] > 0 ? s[p] / avg[p] - 1 : 0])) as Record<Pos, number>;
    const best = [...t.roster].sort((a, b) => b.v - a.v)[0]?.p ?? null;
    return { id: t.id, name: t.name, rank: 0, total: lv.total, starters: lv.starters.reduce((x, y) => x + y.v, 0), best, strengths, record: t.record };
  });
  rows.sort((a, b) => b.total - a.total).forEach((r, i) => (r.rank = i + 1));
  const winPct = (r: PowerRow) => (r.record ? (r.record.wins + 0.5 * r.record.ties) / Math.max(1, r.record.wins + r.record.losses + r.record.ties) : 0);
  if (rows.some((r) => r.record && r.record.wins + r.record.losses > 0)) {
    [...rows].sort((a, b) => winPct(b) - winPct(a) || (b.record?.pointsFor ?? 0) - (a.record?.pointsFor ?? 0))
      .forEach((r, i) => (r.recordRank = i + 1));
  }
  return rows;
}
