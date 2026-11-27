"use client";

import { useState } from "react";
import type { TradeEval } from "@/lib/trade";
import { REASONS, type RateReason, type Rating, applyRating } from "@/lib/tradeTuning";
import { lockedSet, toggleLock } from "@/lib/rosters";
import type { ImportedLeague } from "@/lib/types";
import { sendFeedback } from "./Feedback";

/** The league after a rating: the tuning nudged by the reason, and a kept player locked out of trade ideas. */
export function applyTradeRating(league: ImportedLeague, t: TradeEval, r: Rating): ImportedLeague {
  let lg = league;
  if (r.reason === "keep" && r.keepId && !lockedSet(lg).has(r.keepId)) lg = toggleLock(lg, r.keepId);
  return { ...lg, rules: { ...lg.rules, tradeTuning: applyRating(lg.rules?.tradeTuning, r, t.partnerId) } };
}

/** Also send the rating to the site's feedback channel so the defaults improve for everyone. Players only:
 *  leaguemates' names and the league's name are never included. */
export function reportTradeRating(t: TradeEval, r: Rating, provider: string) {
  const reason = REASONS.find((x) => x.id === r.reason)?.label;
  sendFeedback({
    kind: "trade_rating",
    score: r.vote === "up" ? 1 : 0,
    message: [reason, r.note?.trim()].filter(Boolean).join(" — "),
    context: {
      give: t.give.map((p) => p.name).join(", "),
      get: t.get.map((p) => p.name).join(", "),
      gain: `${((t.myGain / Math.max(t.myBefore, 1)) * 100).toFixed(1)}%`,
      accept: `${Math.round(t.accept * 100)}%`,
      thin: t.warnings.length ? "yes" : "no",
      league: provider,
    },
  }).catch(() => {});
}

/** 👍 / 👎 under a trade idea. A thumbs-down asks why (one tap), then an optional note. */
export default function RateTrade({ t, onRate }: { t: TradeEval; onRate: (r: Rating) => void }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [reason, setReason] = useState<RateReason | undefined>();
  const [keepId, setKeepId] = useState<string | undefined>();
  const [step, setStep] = useState<"idle" | "why" | "keep" | "note" | "done">("idle");
  const [note, setNote] = useState("");

  const chip = "rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 ring-1 ring-slate-700 hover:bg-slate-700";
  if (step === "done") {
    const effect = REASONS.find((x) => x.id === reason)?.effect;
    return <p className="ff-fade mt-3 text-[11px] text-emerald-300">{vote === "up" ? "Thanks, noted." : effect ? `Got it: ${effect}.` : "Got it, thanks."}</p>;
  }
  return (
    <div className="mt-3 border-t border-slate-800 pt-2.5">
      {step === "idle" && (
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          Good idea?
          <button onClick={() => { setVote("up"); setStep("note"); }} aria-label="Good trade idea" className="rounded-full px-2 py-0.5 text-sm hover:bg-slate-800">👍</button>
          <button onClick={() => { setVote("down"); setStep("why"); }} aria-label="Bad trade idea" className="rounded-full px-2 py-0.5 text-sm hover:bg-slate-800">👎</button>
        </div>
      )}
      {step === "why" && (
        <div className="ff-fade">
          <div className="mb-1.5 text-[11px] text-slate-400">What&apos;s wrong with it? Your answer tunes the ideas you see.</div>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((x) => (
              <button key={x.id} className={chip} onClick={() => { setReason(x.id); setStep(x.id === "keep" || x.id === "undersell" ? "keep" : "note"); }}>{x.label}</button>
            ))}
            <button className={chip} onClick={() => { setReason(undefined); setStep("note"); }}>Something else</button>
          </div>
        </div>
      )}
      {step === "keep" && (
        <div className="ff-fade">
          <div className="mb-1.5 text-[11px] text-slate-400">{reason === "undersell" ? "Who's worth more than this?" : "Who are you keeping?"}</div>
          <div className="flex flex-wrap gap-1.5">
            {t.give.map((p) => (
              <button key={p.id} className={chip} onClick={() => { setKeepId(p.id); setStep("note"); }}>{reason === "undersell" ? p.name : `Keep ${p.name}`}</button>
            ))}
          </div>
        </div>
      )}
      {step === "note" && (
        <form className="ff-fade flex gap-2" onSubmit={(e) => { e.preventDefault(); onRate({ vote: vote!, reason, keepId, note: note.trim() || undefined }); setStep("done"); }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
            placeholder={vote === "up" ? "What do you like about it? (optional)" : "Anything else? (optional)"}
            className="min-w-0 flex-1 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs text-white ring-1 ring-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-emerald-500" />
          <button type="submit" className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400">Send</button>
        </form>
      )}
    </div>
  );
}
