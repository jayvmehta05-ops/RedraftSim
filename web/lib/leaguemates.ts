/**
 * Turn a league's past drafts into bot personalities that draft like the real managers.
 *
 * For each manager we compare how often they took each position in the early (1-5), middle (6-10)
 * and late (11+) rounds against the league as a whole. A manager who took WRs in 70% of early picks
 * when the league average was 45% gets a WR lean in the early rounds, and so on.
 */
import type { BotProfile } from "./draft";
import type { ImportedLeague, Pos } from "./types";
import { POSITIONS } from "./types";

export type Phase = "early" | "mid" | "late";
export const phaseOf = (round: number): Phase => (round <= 5 ? "early" : round <= 10 ? "mid" : "late");

const BIAS_SCALE = 30; // +10 percentage points of positional share ≈ +3 picks of draft-board preference
const MAX_BIAS = 8;

export interface LeaguemateProfile extends BotProfile {
  managerId: string;
  picksSeen: number;
  /** -2 (never trades) .. +2 (trades anything); set manually in the leaguemate editor */
  tradeOpenness?: number;
  /** -2 (happy with a fair deal) .. +2 (only takes trades they clearly win) */
  tradeWin?: number;
  /** 0 (only cares about lineup points) .. 2 (sold on big names / draft position); 1 = typical */
  nameValue?: number;
  /** positions they're looking for (+) or trying to move (-) in trades, -2..+2 */
  tradeWants?: Partial<Record<"QB" | "RB" | "WR" | "TE", number>>;
  /** -1 (wants depth: more players back) .. +1 (likes consolidating into fewer, better players) */
  packages?: number;
  /** only does even trades (1-for-1, 2-for-2) so nobody has to drop a player */
  evenOnly?: boolean;
}

export function buildLeaguemateBots(league: ImportedLeague): LeaguemateProfile[] {
  type Tally = Record<Phase, Record<Pos | "other", number>>;
  const blank = (): Tally => ({
    early: { QB: 0, RB: 0, WR: 0, TE: 0, other: 0 },
    mid: { QB: 0, RB: 0, WR: 0, TE: 0, other: 0 },
    late: { QB: 0, RB: 0, WR: 0, TE: 0, other: 0 },
  });
  const all = blank();
  const by = new Map<string, Tally>();
  for (const d of league.drafts) {
    for (const p of d.picks) {
      const ph = phaseOf(p.round);
      const pos = (POSITIONS as string[]).includes(p.pos) ? (p.pos as Pos) : "other";
      if (!by.has(p.managerId)) by.set(p.managerId, blank());
      by.get(p.managerId)![ph][pos] += 1;
      all[ph][pos] += 1;
    }
  }
  const share = (t: Tally, ph: Phase, pos: Pos) => {
    const n = Object.values(t[ph]).reduce((a, b) => a + b, 0);
    return n ? t[ph][pos] / n : 0;
  };
  return league.managers.map((m) => {
    const t = by.get(m.id);
    const picksSeen = t ? Object.values(t).reduce((s, ph) => s + Object.values(ph).reduce((a, b) => a + b, 0), 0) : 0;
    const posBiasByPhase: Record<Phase, Partial<Record<Pos, number>>> = { early: {}, mid: {}, late: {} };
    const leans: string[] = [];
    if (t) {
      // Shrink toward the league average when we've only seen a draft or two
      const conf = Math.min(1, picksSeen / 30);
      for (const ph of ["early", "mid", "late"] as Phase[]) {
        for (const pos of POSITIONS) {
          const diff = share(t, ph, pos) - share(all, ph, pos);
          const bias = Math.max(-MAX_BIAS, Math.min(MAX_BIAS, diff * BIAS_SCALE * conf));
          if (Math.abs(bias) >= 0.5) posBiasByPhase[ph][pos] = Math.round(bias * 10) / 10;
          if (ph === "early" && Math.abs(diff) >= 0.12 && conf >= 0.5) {
            leans.push(`${diff > 0 ? "loves" : "fades"} early ${pos}s`);
          }
        }
      }
    }
    return {
      managerId: m.id,
      name: m.name,
      style: picksSeen ? (leans.slice(0, 2).join(", ") || "balanced drafter") + ` · ${picksSeen} past picks` : "no draft history (balanced)",
      noise: 2.5,
      posBias: {},
      posBiasByPhase,
      runSensitivity: 1,
      rookieBias: 0,
      vorpWeight: 1,
      picksSeen,
    };
  });
}
