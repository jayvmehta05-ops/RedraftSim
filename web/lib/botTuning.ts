/**
 * Mock draft bots learn from your end-of-draft feedback.
 *
 *  - Site-wide tuning (every bot): "QBs went too early", "bots reached too much"… each answer nudges every bot
 *    the next time you draft. Stored in localStorage (redraft27.botTuning) and synced with your account.
 *  - Per leaguemate: "Alex takes RBs earlier than that" edits that manager's profile override, the same one the
 *    Describe leaguemates editor shows (lib/profiles.ts), so you can see and undo it there.
 */
import type { BotProfile } from "./draft";
import type { ProfileOverride } from "./profiles";
import type { Pos } from "./types";
import { POSITIONS } from "./types";

export const BOT_TUNING_KEY = "redraft27.botTuning";

export interface BotTuning {
  /** extra early-round lean per position, in "picks" (mid rounds get half, late rounds a fifth) */
  lean: Record<Pos, number>;
  /** added to every bot's randomness (negative = closer to the rankings) */
  noise: number;
  /** added to run-following */
  runs: number;
  /** added to rookie appetite */
  rookies: number;
  /** how many surveys have shaped this */
  surveys: number;
}

export const blankBotTuning = (): BotTuning => ({ lean: { QB: 0, RB: 0, WR: 0, TE: 0 }, noise: 0, runs: 0, rookies: 0, surveys: 0 });

/** Things that felt off about the bots as a group. Each says which way to nudge them next time. */
export const BOT_ISSUES: { id: string; label: string; effect: string; apply: (t: BotTuning) => void }[] = [
  { id: "reach", label: "Bots reached too much", effect: "bots stick closer to the rankings", apply: (t) => { t.noise -= 0.6; } },
  { id: "predictable", label: "Too predictable", effect: "bots take more chances", apply: (t) => { t.noise += 0.6; } },
  ...POSITIONS.flatMap((pos) => [
    { id: `${pos}_early`, label: `${pos}s went too early`, effect: `${pos}s go a bit later`, apply: (t: BotTuning) => { t.lean[pos] -= 1.5; } },
    { id: `${pos}_late`, label: `${pos}s went too late`, effect: `${pos}s go a bit earlier`, apply: (t: BotTuning) => { t.lean[pos] += 1.5; } },
  ]),
  { id: "rookies_early", label: "Rookies went too early", effect: "rookies go later", apply: (t) => { t.rookies -= 2; } },
  { id: "rookies_late", label: "Rookies went too late", effect: "rookies go earlier", apply: (t) => { t.rookies += 2; } },
  { id: "runs_more", label: "Too many position runs", effect: "bots chase runs less", apply: (t) => { t.runs -= 0.3; } },
  { id: "runs_less", label: "Not enough runs", effect: "bots react more to runs", apply: (t) => { t.runs += 0.3; } },
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function applyBotIssues(t: BotTuning | null, ids: string[]): BotTuning {
  const next: BotTuning = t ? { ...t, lean: { ...t.lean } } : blankBotTuning();
  for (const id of ids) BOT_ISSUES.find((x) => x.id === id)?.apply(next);
  for (const pos of POSITIONS) next.lean[pos] = clamp(next.lean[pos], -6, 6);
  next.noise = clamp(next.noise, -2, 3);
  next.runs = clamp(next.runs, -0.9, 0.9);
  next.rookies = clamp(next.rookies, -6, 6);
  next.surveys += ids.length ? 1 : 0;
  return next;
}

/** A bot with the site-wide tuning layered on top of its own personality. */
export function tuneBot<T extends BotProfile>(b: T, t: BotTuning | null): T {
  if (!t) return b;
  const scaled = (m: number) => Object.fromEntries(POSITIONS.map((p) => [p, t.lean[p] * m])) as Record<Pos, number>;
  const add = (base: Partial<Record<Pos, number>> | undefined, extra: Record<Pos, number>) =>
    Object.fromEntries(POSITIONS.map((p) => [p, (base?.[p] ?? 0) + extra[p]])) as Partial<Record<Pos, number>>;
  return {
    ...b,
    noise: clamp(b.noise + t.noise, 0.4, 9),
    runSensitivity: clamp(b.runSensitivity + t.runs, 0, 2.8),
    rookieBias: clamp(b.rookieBias + t.rookies, -10, 10),
    ...(b.posBiasByPhase
      ? { posBiasByPhase: { early: add(b.posBiasByPhase.early, scaled(1)), mid: add(b.posBiasByPhase.mid, scaled(0.5)), late: add(b.posBiasByPhase.late, scaled(0.2)) } }
      : { posBias: add(b.posBias, scaled(1)) }),
  };
}

/** Plain-English summary of the site-wide tuning (empty when nothing has changed). */
export function describeBotTuning(t: BotTuning | null): string[] {
  if (!t) return [];
  const out: string[] = [];
  for (const pos of POSITIONS) {
    const v = t.lean[pos];
    if (Math.abs(v) >= 0.5) out.push(`${pos}s go ${v < 0 ? "later" : "earlier"} (${v > 0 ? "+" : ""}${v.toFixed(1)} picks)`);
  }
  if (t.noise <= -0.5) out.push("bots stick closer to the rankings");
  if (t.noise >= 0.5) out.push("bots take more chances");
  if (t.rookies <= -1) out.push("rookies go later");
  if (t.rookies >= 1) out.push("rookies go earlier");
  if (t.runs <= -0.2) out.push("bots chase runs less");
  if (t.runs >= 0.2) out.push("bots react more to runs");
  return out;
}

export function loadBotTuning(): BotTuning | null {
  try {
    const raw = localStorage.getItem(BOT_TUNING_KEY);
    return raw ? { ...blankBotTuning(), ...JSON.parse(raw) } : null;
  } catch { return null; }
}
export function saveBotTuning(t: BotTuning | null) {
  try {
    if (t) localStorage.setItem(BOT_TUNING_KEY, JSON.stringify(t)); else localStorage.removeItem(BOT_TUNING_KEY);
  } catch { /* storage unavailable */ }
}

/** How a real leaguemate drafts differently from their bot. Applied to their profile override. */
export const MATE_ISSUES: { id: string; label: string; apply: (o: ProfileOverride) => void }[] = [
  ...POSITIONS.flatMap((pos) => [
    { id: `${pos}_earlier`, label: `Takes ${pos}s earlier`, apply: (o: ProfileOverride) => { o.lean[pos] = clamp((o.lean[pos] ?? 0) + 2, -8, 8); } },
    { id: `${pos}_later`, label: `Takes ${pos}s later`, apply: (o: ProfileOverride) => { o.lean[pos] = clamp((o.lean[pos] ?? 0) - 2, -8, 8); } },
  ]),
  { id: "rookies_more", label: "Loves rookies more", apply: (o) => { o.rookieBias = clamp(o.rookieBias + 3, -8, 8); } },
  { id: "rookies_less", label: "Likes rookies less", apply: (o) => { o.rookieBias = clamp(o.rookieBias - 3, -8, 8); } },
  { id: "reaches", label: "Reaches more", apply: (o) => { o.noise = clamp(o.noise + 1.5, 0.5, 8); } },
  { id: "by_book", label: "Sticks to rankings more", apply: (o) => { o.noise = clamp(o.noise - 1, 0.5, 8); } },
];

export function applyMateIssues(o: ProfileOverride, ids: string[]): ProfileOverride {
  const next: ProfileOverride = { ...o, lean: { ...o.lean }, preset: o.preset === "learned" || o.preset === "custom" ? o.preset : "custom" };
  for (const id of ids) MATE_ISSUES.find((x) => x.id === id)?.apply(next);
  return next;
}
