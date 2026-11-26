/**
 * Manual leaguemate profiles. Anything learned automatically from past drafts (lib/leaguemates.ts) can be
 * overridden by hand: a style preset, per-position leans, randomness, rookie appetite, run-following and
 * trade openness, or a plain-English description that fills those in. Overrides always win.
 */
import type { LeaguemateProfile } from "./leaguemates";
import type { Pos } from "./types";
import { POSITIONS } from "./types";

export interface ProfileOverride {
  preset: string;
  /** early-round lean per position, in "picks" (-8..+8); mid rounds get half, late rounds a fifth */
  lean: Record<Pos, number>;
  noise: number;           // 0.5 (by the book) .. 8 (chaos)
  rookieBias: number;      // -8 .. +8
  runSensitivity: number;  // 0 .. 2.5
  tradeOpenness: number;   // -2 (never trades) .. +2 (trades anything)
  note: string;            // the user's own description, kept for reference
  // How they trade (optional, so older saved profiles still load)
  tradeWin?: number;       // -2 (fair deals are fine) .. +2 (must clearly win)
  nameValue?: number;      // 0 (lineup points only) .. 2 (big names sell); 1 = typical
  tradeWants?: Partial<Record<Pos, number>>; // + looking for that position, - trying to move it
  packages?: number;       // -1 wants depth back .. +1 likes 2-for-1 consolidation
  tradeNote?: string;      // the user's own description of how they trade
}

const zero = (): Record<Pos, number> => ({ QB: 0, RB: 0, WR: 0, TE: 0 });

type PresetApply = Partial<Omit<ProfileOverride, "lean">> & { lean?: Partial<Record<Pos, number>> };
export const PRESETS: { id: string; label: string; apply: PresetApply }[] = [
  { id: "balanced", label: "Balanced", apply: { lean: {}, noise: 2.5, rookieBias: 0, runSensitivity: 1 } },
  { id: "adp", label: "Follows ADP / rankings", apply: { lean: {}, noise: 1.2, runSensitivity: 0.6 } },
  { id: "zero_rb", label: "Zero RB (WR/TE early)", apply: { lean: { RB: -5, WR: 4, TE: 2 } } },
  { id: "hero_rb", label: "Hero RB / RB-heavy", apply: { lean: { RB: 5, WR: 1 } } },
  { id: "early_qb", label: "Takes a QB early", apply: { lean: { QB: 7 } } },
  { id: "late_qb", label: "Waits on QB", apply: { lean: { QB: -4 } } },
  { id: "te_premium", label: "Pays up for an elite TE", apply: { lean: { TE: 6 } } },
  { id: "rookies", label: "Loves rookies / upside", apply: { rookieBias: 6 } },
  { id: "vets", label: "Proven veterans only", apply: { rookieBias: -7 } },
  { id: "chaos", label: "Reaches / unpredictable", apply: { noise: 7, runSensitivity: 1.3 } },
  { id: "runs", label: "Follows positional runs", apply: { runSensitivity: 2.2 } },
];

export function blankOverride(): ProfileOverride {
  return { preset: "balanced", lean: zero(), noise: 2.5, rookieBias: 0, runSensitivity: 1, tradeOpenness: 0, note: "" };
}

/** Start an override from what was learned, so editing tweaks the learned profile instead of resetting it. */
export function overrideFromLearned(p?: LeaguemateProfile): ProfileOverride {
  const o = blankOverride();
  if (!p) return o;
  const early = p.posBiasByPhase?.early ?? p.posBias ?? {};
  for (const pos of POSITIONS) o.lean[pos] = Math.round((early[pos] ?? 0) * 10) / 10;
  o.preset = "learned";
  o.noise = p.noise;
  o.rookieBias = p.rookieBias;
  o.runSensitivity = p.runSensitivity;
  return o;
}

export function applyPreset(o: ProfileOverride, id: string): ProfileOverride {
  const pr = PRESETS.find((p) => p.id === id);
  if (!pr) return o;
  const lean = { ...zero(), ...(pr.apply.lean ?? {}) } as Record<Pos, number>;
  return {
    ...o, preset: id, lean: pr.apply.lean ? lean : o.lean,
    noise: pr.apply.noise ?? o.noise, rookieBias: pr.apply.rookieBias ?? o.rookieBias,
    runSensitivity: pr.apply.runSensitivity ?? o.runSensitivity,
  };
}

// Plain-English description → settings. Transparent keyword rules; matched rules are shown to the user.
const POS_WORDS: Record<Pos, string> = {
  QB: "(?:qbs?|quarterbacks?)", RB: "(?:rbs?|running ?backs?)", WR: "(?:wrs?|wide ?receivers?|receivers?)", TE: "(?:tes?|tight ?ends?)",
};
const EARLY = "(?:early|first|1st|2nd|second|round (?:1|2|one|two)|top|high|reach(?:es)? for|loves?|prioriti[sz]es?|hammers?)";
const LATE = "(?:late|waits?|last|streams?|punts?|ignores?|fades?|avoids?|never takes?|doesn'?t take)";
/** "early QB", "QB early", "takes a QB in the 2nd round" … position and context word within ~30 characters. */
const near = (pos: Pos, ctx: string) =>
  new RegExp(`${ctx}[^.,;!?]{0,30}\\b${POS_WORDS[pos]}\\b|\\b${POS_WORDS[pos]}\\b[^.,;!?]{0,30}${ctx}`);

const RULES: { re: RegExp; label: string; apply: (o: ProfileOverride) => void }[] = [
  { re: /zero[\s-]?rb|rb[\s-]?light/, label: "zero RB (avoids early RBs)", apply: (o) => { o.lean.RB = -5; o.lean.WR = Math.max(o.lean.WR, 3); } },
  { re: /hero[\s-]?rb|robust[\s-]?rb|rb[\s-]heavy/, label: "RB-heavy", apply: (o) => { o.lean.RB = 5; } },
  ...(["QB", "RB", "WR", "TE"] as Pos[]).flatMap((pos) => [
    { re: near(pos, LATE), label: `waits on ${pos}`, apply: (o: ProfileOverride) => { o.lean[pos] = pos === "QB" ? -4 : -3; } },
    { re: near(pos, EARLY), label: `takes ${pos}s early`, apply: (o: ProfileOverride) => { o.lean[pos] = pos === "QB" ? 7 : pos === "TE" ? 6 : 5; } },
  ]),
  { re: /rookies?|upside|young (players|guys)|sleepers?|breakouts?/, label: "chases rookies / upside", apply: (o) => { o.rookieBias = 6; } },
  { re: /veterans?|vets?|proven|safe floor|old guys|avoids? rookies/, label: "prefers proven veterans", apply: (o) => { o.rookieBias = -6; } },
  { re: /reach(es|y)?(?! for)|unpredictable|chaos|random|wild(card)?|drafts? on (a )?whim/, label: "reaches / unpredictable", apply: (o) => { o.noise = 7; } },
  { re: /adp|by the book|follows? (the )?rankings|consensus|autodraft|auto[\s-]?pick/, label: "sticks to ADP", apply: (o) => { o.noise = 1.2; } },
  { re: /follows? (the )?runs?|panics?|herd|jumps? on runs?/, label: "follows positional runs", apply: (o) => { o.runSensitivity = 2.2; } },
  { re: /never trades?|won'?t trade|hates? trad|stubborn|hard to trade|doesn'?t trade|inactive/, label: "rarely trades", apply: (o) => { o.tradeOpenness = -2; } },
  { re: /trades? (a lot|often|anything|everything)|loves? trad|active trader|easy to trade|trade happy|always trading/, label: "trades often", apply: (o) => { o.tradeOpenness = 2; } },
];

/** Plain-English description of how someone trades -> trade settings. Matched rules are shown to the user. */
const TRADE_RULES: { re: RegExp; label: string; apply: (o: ProfileOverride) => void }[] = [
  { re: /never trades?|won'?t trade|hates? trad|doesn'?t trade|inactive|hard to trade|stubborn/, label: "rarely trades", apply: (o) => { o.tradeOpenness = -2; } },
  { re: /trades? (a lot|often|anything|everything|constantly)|loves? trad|active trader|easy to trade|trade[\s-]happy|always trading/, label: "trades often", apply: (o) => { o.tradeOpenness = 2; } },
  { re: /fleece|lopsided|has to win|needs? to win|wants? to win|hard bargain|lowball|rip(s)? (you|people) off|shark/, label: "needs to win the trade", apply: (o) => { o.tradeWin = 2; } },
  { re: /\bfair\b|reasonable|win[\s-]win|easy going|easygoing|generous|nice guy/, label: "takes fair deals", apply: (o) => { o.tradeWin = -1; } },
  { re: /big names?|stars?|name value|brand|loves? (big|famous)|adp|draft (spot|position|capital)/, label: "sold on big names", apply: (o) => { o.nameValue = 2; } },
  { re: /only cares about (the )?(lineup|points|stats|numbers)|analytics|spreadsheet|by the numbers|sharp/, label: "only cares about lineup points", apply: (o) => { o.nameValue = 0.3; } },
  { re: /2[\s-]?for[\s-]?1|two[\s-]for[\s-]one|consolidat|package|quality over quantity/, label: "likes consolidating (2-for-1s)", apply: (o) => { o.packages = 1; } },
  { re: /\bdepth\b|quantity|more players|bodies/, label: "wants depth back", apply: (o) => { o.packages = -1; } },
  ...(["QB", "RB", "WR", "TE"] as Pos[]).flatMap((pos) => {
    const w = POS_WORDS[pos];
    return [
      { re: new RegExp(`(?:needs?|wants?|looking for|after|hunting|desperate for|short (?:at|on))[^.,;!?]{0,20}\\b${w}\\b`),
        label: `looking for a ${pos}`, apply: (o: ProfileOverride) => { o.tradeWants = { ...o.tradeWants, [pos]: 2 }; } },
      { re: new RegExp(`(?:selling|shopping|trading away|has too many|deep at|loaded at|surplus (?:at|of))[^.,;!?]{0,20}\\b${w}\\b`),
        label: `trying to move ${pos}s`, apply: (o: ProfileOverride) => { o.tradeWants = { ...o.tradeWants, [pos]: -1.5 }; } },
    ];
  }),
];

export function applyTradeDescription(o: ProfileOverride, text: string): { override: ProfileOverride; understood: string[] } {
  const next: ProfileOverride = { ...o, lean: { ...o.lean }, tradeWants: { ...o.tradeWants }, tradeNote: text };
  const t = text.toLowerCase();
  const understood: string[] = [];
  for (const r of TRADE_RULES) if (r.re.test(t)) { r.apply(next); understood.push(r.label); }
  return { override: next, understood };
}

/** Short summary of someone's trade habits for list rows ("trades often · needs to win · wants RB"). */
export function tradeSummary(o: ProfileOverride): string[] {
  const out: string[] = [];
  if (o.tradeOpenness) out.push(`trades ${o.tradeOpenness > 0 ? "often" : "rarely"}`);
  if ((o.tradeWin ?? 0) >= 1) out.push("needs to win");
  if ((o.tradeWin ?? 0) <= -1) out.push("takes fair deals");
  if ((o.nameValue ?? 1) >= 1.5) out.push("big names sell");
  if ((o.nameValue ?? 1) <= 0.5) out.push("points only");
  const wants = Object.entries(o.tradeWants ?? {}).filter(([, v]) => (v ?? 0) > 0).map(([p]) => p);
  if (wants.length) out.push(`wants ${wants.join("/")}`);
  if ((o.packages ?? 0) > 0) out.push("likes 2-for-1s");
  if ((o.packages ?? 0) < 0) out.push("wants depth");
  return out;
}

export function applyDescription(o: ProfileOverride, text: string): { override: ProfileOverride; understood: string[] } {
  const next: ProfileOverride = { ...o, lean: { ...o.lean }, note: text, preset: "custom" };
  const t = text.toLowerCase();
  const understood: string[] = [];
  for (const r of RULES) {
    if (r.re.test(t)) {
      r.apply(next);
      understood.push(r.label);
    }
  }
  return { override: next, understood };
}

/** Learned profile with the manual override (if any) applied on top. */
export function effectiveProfile(managerId: string, name: string, learned: LeaguemateProfile | undefined,
  o: ProfileOverride | undefined): LeaguemateProfile {
  const base: LeaguemateProfile = learned ?? {
    managerId, name, style: "no draft history (balanced)", noise: 2.5, posBias: {}, runSensitivity: 1, rookieBias: 0,
    vorpWeight: 1, picksSeen: 0,
  };
  if (!o) return { ...base, name };
  const early: Partial<Record<Pos, number>> = {};
  const mid: Partial<Record<Pos, number>> = {};
  const late: Partial<Record<Pos, number>> = {};
  for (const pos of POSITIONS) {
    const v = o.lean[pos] ?? 0;
    if (v) { early[pos] = v; mid[pos] = v * 0.5; late[pos] = v * 0.2; }
  }
  const presetLabel = PRESETS.find((p) => p.id === o.preset)?.label;
  return {
    ...base, name, posBias: {}, posBiasByPhase: { early, mid, late }, noise: o.noise, rookieBias: o.rookieBias,
    runSensitivity: o.runSensitivity, tradeOpenness: o.tradeOpenness,
    tradeWin: o.tradeWin, nameValue: o.nameValue, tradeWants: o.tradeWants, packages: o.packages,
    style: `${presetLabel ?? (o.preset === "learned" ? "learned, edited" : "custom")} · set by you`,
  };
}
