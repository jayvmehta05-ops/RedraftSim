/**
 * Playoff odds by simulating the rest of the season thousands of times.
 *
 * Team strength: each team's weekly mean blends its current roster's projected starting lineup (shifted
 * by a league-wide offset, since kickers and defenses aren't projected) with how it has actually scored.
 * Uncertainty: every simulated week has normal game-to-game noise, and every simulated season also gives
 * each team its own "projections were off" shift, so results are correlated the way real seasons are.
 * Standings: wins (ties count half), then points for. The top seeds get byes when the playoff field isn't
 * a power of two, and the bracket is played out with the same scoring model.
 */
import type { ImportedLeague } from "./types";

export interface TeamOdds {
  id: string;
  name: string;
  wins: number; losses: number; ties: number;
  pointsFor: number;
  /** average simulated final wins */
  projWins: number;
  playoff: number;
  bye: number;
  topSeed: number;
  title: number;
  /** chance of finishing at each seed 1..teams */
  seeds: number[];
  /** projected points per week used in the simulation */
  mean: number;
}

export interface MyLeverage {
  odds: number;
  ifWin: number | null;
  ifLose: number | null;
  /** the same win/lose split for a first-round bye and for the title */
  bye: { now: number; ifWin: number | null; ifLose: number | null } | null;
  title: { now: number; ifWin: number | null; ifLose: number | null };
  opponent: string | null;
  /** other games this week, ordered by how much they swing your odds */
  rootFor: { winner: string; loser: string; swing: number }[];
}

export interface PlayoffOdds {
  teams: TeamOdds[];
  me: MyLeverage | null;
  weeksLeft: number;
  week: number;
  playoffTeams: number;
  sims: number;
  sd: number;
}

/** Small, fast seeded RNG so the odds don't flicker between renders. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulatePlayoffs(league: ImportedLeague, projected: Map<string, number>, myId: string | null, sims = 10000): PlayoffOdds | { error: string } {
  const names = new Map(league.managers.map((m) => [m.id, m.name]));
  const rosters = (league.rosters ?? []).filter((r) => r.opponents && r.opponents.length);
  if (rosters.length < 4) return { error: "needs-schedule" };
  const ids = rosters.map((r) => r.managerId);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const regularWeeks = Math.max(...rosters.map((r) => r.opponents!.length));
  const played = Math.min(...rosters.map((r) => r.weekly?.length ?? 0));
  const P = Math.min(n, Math.max(2, league.schedule?.playoffTeams ?? 6));

  // Team means: projection (+ league offset for K/DST and unprojected points) blended with actual scoring
  const actualMean = rosters.map((r) => (r.weekly && r.weekly.length ? r.weekly.reduce((s, x) => s + x, 0) / r.weekly.length : NaN));
  const proj = ids.map((id) => projected.get(id) ?? NaN);
  const both = ids.map((_, i) => i).filter((i) => Number.isFinite(actualMean[i]) && Number.isFinite(proj[i]));
  const offset = both.length ? both.reduce((s, i) => s + actualMean[i] - proj[i], 0) / both.length : 0;
  const wActual = played >= 6 ? 0.35 : played >= 3 ? 0.25 : 0.1;
  const leagueAvg = both.length ? both.reduce((s, i) => s + actualMean[i], 0) / both.length : 110;
  const mean = ids.map((_, i) => {
    const p = Number.isFinite(proj[i]) ? proj[i] + offset : leagueAvg;
    return Number.isFinite(actualMean[i]) ? (1 - wActual) * p + wActual * actualMean[i] : p;
  });
  // Weekly noise: pooled spread of actual scores around each team's own average
  let ss = 0, cnt = 0;
  rosters.forEach((r, i) => (r.weekly ?? []).forEach((x) => { ss += (x - actualMean[i]) ** 2; cnt++; }));
  const sd = Math.min(35, Math.max(15, cnt > n ? Math.sqrt(ss / Math.max(1, cnt - n)) : 22));
  const strengthSd = played >= 8 ? 5 : 7; // season-long uncertainty in each team's true level

  // Current standings
  const baseWins = rosters.map((r) => (r.record?.wins ?? 0) + 0.5 * (r.record?.ties ?? 0));
  const basePf = rosters.map((r) => r.record?.pointsFor ?? (r.weekly ?? []).reduce((s, x) => s + x, 0));

  // Remaining games, each listed once
  const games: { w: number; a: number; b: number }[] = [];
  for (let w = played; w < regularWeeks; w++) {
    rosters.forEach((r, i) => {
      const o = r.opponents![w];
      const j = o != null ? idx.get(o) : undefined;
      if (j != null && i < j) games.push({ w, a: i, b: j });
    });
  }
  const thisWeek = games.filter((g) => g.w === played);
  const me = myId != null ? idx.get(myId) ?? null : null;
  const myGame = me == null ? null : thisWeek.find((g) => g.a === me || g.b === me) ?? null;
  const others = thisWeek.filter((g) => g !== myGame);

  const rnd = mulberry32(0x5eed + n * 31 + played * 7 + Math.round(mean.reduce((s, x) => s + x, 0)));
  let spare: number | null = null;
  const normal = () => {
    if (spare != null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    v = rnd();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };

  const playoffCount = new Array(n).fill(0), byeCount = new Array(n).fill(0), topCount = new Array(n).fill(0), titleCount = new Array(n).fill(0);
  const seedCount = Array.from({ length: n }, () => new Array(n).fill(0));
  const winSum = new Array(n).fill(0);
  let myWinSims = 0, myWinIn = 0, myLoseSims = 0, myLoseIn = 0;
  let myWinBye = 0, myLoseBye = 0, myWinTitle = 0, myLoseTitle = 0;
  const swing = others.map(() => ({ aWin: 0, aWinIn: 0, bWin: 0, bWinIn: 0 }));
  const byes = (1 << Math.ceil(Math.log2(P))) - P;

  const wins = new Array(n), pf = new Array(n), level = new Array(n), order = new Array(n), seedOf = new Array(n);
  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) { wins[i] = baseWins[i]; pf[i] = basePf[i]; level[i] = mean[i] + normal() * strengthSd; }
    let myResult = 0;
    const otherResult = new Array(others.length);
    for (const g of games) {
      const sa = level[g.a] + normal() * sd, sb = level[g.b] + normal() * sd;
      pf[g.a] += sa; pf[g.b] += sb;
      const aWon = sa > sb;
      if (aWon) wins[g.a] += 1; else wins[g.b] += 1;
      if (g.w === played) {
        if (g === myGame) myResult = (aWon ? g.a : g.b) === me ? 1 : -1;
        else { const k = others.indexOf(g); if (k >= 0) otherResult[k] = aWon; }
      }
    }
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((x: number, y: number) => wins[y] - wins[x] || pf[y] - pf[x]);
    for (let k = 0; k < n; k++) { seedCount[order[k]][k]++; winSum[order[k]] += wins[order[k]]; }
    topCount[order[0]]++;
    for (let k = 0; k < P; k++) playoffCount[order[k]]++;
    for (let k = 0; k < byes; k++) byeCount[order[k]]++;

    // Bracket: byes for the top seeds, then the best remaining seed plays the worst, every round
    for (let k = 0; k < n; k++) seedOf[order[k]] = k;
    const playRound = (teamsIn: number[]) => {
      const list = [...teamsIn].sort((x, y) => seedOf[x] - seedOf[y]);
      const out: number[] = [];
      while (list.length > 1) {
        const hi = list.shift()!, lo = list.pop()!;
        out.push(level[hi] + normal() * sd >= level[lo] + normal() * sd ? hi : lo);
      }
      if (list.length) out.push(list[0]);
      return out;
    };
    let alive: number[] = [...order.slice(0, byes), ...playRound(order.slice(byes, P))];
    while (alive.length > 1) alive = playRound(alive);
    titleCount[alive[0]]++;

    if (me != null) {
      const inP = seedOf[me] < P;
      const gotBye = seedOf[me] < byes;
      const won = alive[0] === me;
      if (myResult === 1) { myWinSims++; if (inP) myWinIn++; if (gotBye) myWinBye++; if (won) myWinTitle++; }
      if (myResult === -1) { myLoseSims++; if (inP) myLoseIn++; if (gotBye) myLoseBye++; if (won) myLoseTitle++; }
      others.forEach((_, k) => {
        if (otherResult[k]) { swing[k].aWin++; if (inP) swing[k].aWinIn++; }
        else { swing[k].bWin++; if (inP) swing[k].bWinIn++; }
      });
    }
  }

  const teams: TeamOdds[] = rosters.map((r, i) => ({
    id: r.managerId, name: names.get(r.managerId) ?? `Team ${r.managerId}`,
    wins: r.record?.wins ?? 0, losses: r.record?.losses ?? 0, ties: r.record?.ties ?? 0, pointsFor: basePf[i],
    projWins: winSum[i] / sims, playoff: playoffCount[i] / sims, bye: byes ? byeCount[i] / sims : 0,
    topSeed: topCount[i] / sims, title: titleCount[i] / sims, seeds: seedCount[i].map((c) => c / sims), mean: mean[i],
  })).sort((a, b) => b.playoff - a.playoff || b.projWins - a.projWins);

  let mine: MyLeverage | null = null;
  if (me != null) {
    const name = (i: number) => names.get(ids[i]) ?? `Team ${ids[i]}`;
    mine = {
      odds: playoffCount[me] / sims,
      ifWin: myWinSims ? myWinIn / myWinSims : null,
      ifLose: myLoseSims ? myLoseIn / myLoseSims : null,
      bye: byes ? { now: byeCount[me] / sims, ifWin: myWinSims ? myWinBye / myWinSims : null, ifLose: myLoseSims ? myLoseBye / myLoseSims : null } : null,
      title: { now: titleCount[me] / sims, ifWin: myWinSims ? myWinTitle / myWinSims : null, ifLose: myLoseSims ? myLoseTitle / myLoseSims : null },
      opponent: myGame ? name(myGame.a === me ? myGame.b : myGame.a) : null,
      rootFor: others.map((g, k) => {
        const pa = swing[k].aWin ? swing[k].aWinIn / swing[k].aWin : 0;
        const pb = swing[k].bWin ? swing[k].bWinIn / swing[k].bWin : 0;
        return pa >= pb ? { winner: name(g.a), loser: name(g.b), swing: pa - pb } : { winner: name(g.b), loser: name(g.a), swing: pb - pa };
      }).filter((x) => x.swing >= 0.005).sort((a, b) => b.swing - a.swing),
    };
  }
  return { teams, me: mine, weeksLeft: regularWeeks - played, week: played + 1, playoffTeams: P, sims, sd };
}
