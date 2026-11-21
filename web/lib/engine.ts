/**
 * Browser-side mirror of the scoring / VORP / tier / ADP step in scripts/project_2027.py.
 * The Python pipeline exports per-game projected stat components, so any Settings toggle
 * (FLEX count, PPR, passing TD value, TE premium) can be re-scored here instantly.
 */
import type { LeagueConfig, Pos, RankedPlayer, RawPlayer, Replacement, Scoring, StatLine, Toggles } from "./types";
import { POSITIONS } from "./types";

export function defaultToggles(cfg: LeagueConfig): Toggles {
  return {
    flexCount: cfg.roster.FLEX === 2 ? 2 : 1,
    ppr: cfg.scoring.rec === 0.5 ? 0.5 : 1,
    passTd: cfg.scoring.pass_td === 6 ? 6 : 4,
    tePremium: cfg.scoring.te_premium === 0.5 ? 0.5 : 0,
  };
}

export function applyToggles(cfg: LeagueConfig, t: Toggles): LeagueConfig {
  return {
    ...cfg,
    roster: { ...cfg.roster, FLEX: t.flexCount },
    scoring: { ...cfg.scoring, rec: t.ppr, pass_td: t.passTd, te_premium: t.tePremium },
  };
}

export function sameToggles(a: Toggles, b: Toggles) {
  return a.flexCount === b.flexCount && a.ppr === b.ppr && a.passTd === b.passTd && a.tePremium === b.tePremium;
}

export function pointsPerGame(s: StatLine, pos: Pos, sc: Scoring): number {
  const recPts = sc.rec + (pos === "TE" ? sc.te_premium : 0);
  return (
    s.pass_yds * sc.pass_yd +
    s.pass_td * sc.pass_td +
    s.pass_int * sc.pass_int +
    s.pass_2pt * sc.pass_2pt +
    s.rush_yds * sc.rush_yd +
    s.rush_td * sc.rush_td +
    s.rush_2pt * sc.rush_2pt +
    s.rec * recPts +
    s.rec_yds * sc.rec_yd +
    s.rec_td * sc.rec_td +
    s.rec_2pt * sc.rec_2pt +
    s.fum_lost * sc.fum_lost
  );
}

/** Replacement level per position: dedicated starters + flex allocation, then the next 3 players. */
export function replacementLevels(rows: { pos: Pos; points: number }[], cfg: LeagueConfig): Replacement {
  const starters = Object.fromEntries(
    POSITIONS.map((p) => [p, cfg.teams * (cfg.roster[p] ?? 0)]),
  ) as Record<Pos, number>;
  const pools = Object.fromEntries(
    POSITIONS.map((p) => [p, rows.filter((r) => r.pos === p).map((r) => r.points).sort((a, b) => b - a)]),
  ) as Record<Pos, number[]>;

  const flexSlots = cfg.teams * cfg.roster.FLEX;
  if (flexSlots > 0) {
    const cands: { pos: Pos; pts: number }[] = [];
    for (const p of cfg.flex_eligible) pools[p].slice(starters[p]).forEach((pts) => cands.push({ pos: p, pts }));
    cands.sort((a, b) => b.pts - a.pts);
    for (const c of cands.slice(0, flexSlots)) starters[c.pos] += 1;
  }
  const points = {} as Record<Pos, number>;
  for (const p of POSITIONS) {
    const pts = pools[p];
    const n = starters[p];
    const win = pts.length > n ? pts.slice(n, n + 3) : pts.slice(-1);
    points[p] = win.length ? win.reduce((a, b) => a + b, 0) / win.length : 0;
  }
  return { points, starters };
}

export function assignTiers(vorps: number[], factor = 2.5, minSize = 5, maxSize = 20): number[] {
  const gaps = vorps.map((v, i) => (i === 0 ? 0 : Math.abs(vorps[i - 1] - v)));
  const tiers: number[] = [];
  let tier = 1;
  let size = 0;
  for (let i = 0; i < vorps.length; i++) {
    if (i > 0) {
      const lo = Math.max(1, i - 12);
      const hi = Math.min(vorps.length, i + 12);
      const win = gaps.slice(lo, hi).sort((a, b) => a - b);
      const med = win.length ? win[Math.floor(win.length / 2)] || 0.1 : 0.1;
      if ((gaps[i] > factor * med && size >= minSize) || size >= maxSize) {
        tier += 1;
        size = 0;
      }
    }
    tiers.push(tier);
    size += 1;
  }
  return tiers;
}

export function computeBoard(players: RawPlayer[], cfg: LeagueConfig): { board: RankedPlayer[]; replacement: Replacement } {
  const sc = cfg.scoring;
  const rows = players.map((p) => {
    const ppg = pointsPerGame(p.proj, p.pos, sc);
    return { p, pos: p.pos, ppg, ppg26: pointsPerGame(p.s26, p.pos, sc), points: ppg * p.projGames };
  });
  const replacement = replacementLevels(rows, cfg);
  const scored = rows
    .map((r) => ({ ...r, vorp: r.points - replacement.points[r.pos] }))
    .sort((a, b) => b.vorp - a.vorp || b.points - a.points);

  const w = cfg.projection.market_adp_weight;
  const posCount: Record<string, number> = {};
  const withRank = scored.map((r, i) => {
    posCount[r.pos] = (posCount[r.pos] ?? 0) + 1;
    const rank = i + 1;
    const blend = r.p.marketRank != null ? (1 - w) * rank + w * r.p.marketRank : rank;
    return { ...r, rank, posRank: posCount[r.pos], adpScore: r.p.adpOverride ?? blend };
  });
  const adpOrder = [...withRank].sort((a, b) => a.adpScore - b.adpScore || a.rank - b.rank);
  const adpOf = new Map(adpOrder.map((r, i) => [r.p.id, i + 1]));
  const tiers = assignTiers(withRank.map((r) => r.vorp));

  const board: RankedPlayer[] = withRank.map((r, i) => ({
    ...r.p,
    cur: {
      rank: r.rank,
      posRank: r.posRank,
      adp: adpOf.get(r.p.id)!,
      tier: tiers[i],
      ppg: r.ppg,
      ppg26: r.ppg26,
      points: r.points,
      vorp: r.vorp,
      settingsDelta: r.p.rank - r.rank,
    },
  }));
  return { board, replacement };
}

export function roundPick(overall: number, teams: number): string {
  const round = Math.ceil(overall / teams);
  const pick = ((overall - 1) % teams) + 1;
  return `${round}.${String(pick).padStart(2, "0")}`;
}
