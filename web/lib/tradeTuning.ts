/**
 * Your trade ratings tune the trade assistant for that league. A thumbs-down comes with a reason, and each
 * reason nudges one setting: how much a trade must add to your lineup, how much backups count, and how hard
 * a sell each manager is. Saved on the league (league.rules.tradeTuning), so it syncs with your account.
 */
import type { TradeTuning } from "./types";

export type RateReason = "overpay" | "thin" | "unrealistic" | "keep";
export interface Rating { vote: "up" | "down"; reason?: RateReason; note?: string; keepId?: string }

export const REASONS: { id: RateReason; label: string; effect: string }[] = [
  { id: "overpay", label: "I'd give up too much", effect: "ideas now need to add more to your lineup" },
  { id: "thin", label: "Leaves me too thin", effect: "your backups now count for more" },
  { id: "unrealistic", label: "They'd never accept", effect: "this manager is now treated as a harder sell" },
  { id: "keep", label: "I'm keeping a player", effect: "he won't appear in trade ideas (unlock him on Rosters any time)" },
];

export const DEFAULT_MIN_GAIN = 0.004;
export const DEFAULT_MIN_ACCEPT = 0.35;

/** The league's tuning after one more rating. */
export function applyRating(t: TradeTuning | undefined, r: Rating, partnerId: string): TradeTuning {
  const next: TradeTuning = { ...t, partnerPenalty: { ...t?.partnerPenalty }, votes: { up: t?.votes?.up ?? 0, down: t?.votes?.down ?? 0 } };
  if (r.vote === "up") { next.votes!.up += 1; return next; }
  next.votes!.down += 1;
  if (r.reason === "overpay") next.minGainPct = Math.min(0.03, (t?.minGainPct ?? DEFAULT_MIN_GAIN) + 0.005);
  if (r.reason === "thin") {
    next.depthBoost = Math.min(2.5, (t?.depthBoost ?? 1) * 1.35);
    next.thinVotes = (t?.thinVotes ?? 0) + 1;
    if (next.thinVotes >= 2) next.hideThin = true;
  }
  if (r.reason === "unrealistic") {
    next.partnerPenalty![partnerId] = Math.min(3, (t?.partnerPenalty?.[partnerId] ?? 0) + 0.75);
    next.minAccept = Math.min(0.6, (t?.minAccept ?? DEFAULT_MIN_ACCEPT) + 0.04);
  }
  return next;
}

/** Plain-English lines for what your ratings have changed (empty when nothing has). */
export function describeTuning(t: TradeTuning | undefined): string[] {
  if (!t) return [];
  const out: string[] = [];
  if ((t.minGainPct ?? DEFAULT_MIN_GAIN) > DEFAULT_MIN_GAIN) out.push(`ideas must add at least ${((t.minGainPct ?? 0) * 100).toFixed(1)}% to your lineup`);
  if ((t.depthBoost ?? 1) > 1) out.push(`backups count ${(t.depthBoost ?? 1).toFixed(1)}× as much`);
  if (t.hideThin) out.push("trades that leave a hole are hidden");
  const tough = Object.values(t.partnerPenalty ?? {}).filter((v) => v > 0).length;
  if (tough) out.push(`${tough} manager${tough === 1 ? " is" : "s are"} treated as a harder sell`);
  if ((t.minAccept ?? DEFAULT_MIN_ACCEPT) > DEFAULT_MIN_ACCEPT) out.push(`only trades with a ${Math.round((t.minAccept ?? 0) * 100)}%+ chance of a yes`);
  return out;
}
