"use client";

import { useState } from "react";
import { BOT_ISSUES, MATE_ISSUES } from "@/lib/botTuning";
import { sendFeedback } from "./Feedback";

/** The opposite answer, so "QBs went too early" and "QBs went too late" can't both be picked. */
const opposite = (id: string) => {
  const pairs: [string, string][] = [["reach", "predictable"], ["rookies_early", "rookies_late"], ["runs_more", "runs_less"],
    ["rookies_more", "rookies_less"], ["reaches", "by_book"]];
  for (const [a, b] of pairs) { if (id === a) return b; if (id === b) return a; }
  return id.replace(/_(early|late|earlier|later)$/, (_, w: string) => `_${{ early: "late", late: "early", earlier: "later", later: "earlier" }[w]}`);
};
const toggle = (s: Set<string>, id: string) => {
  const n = new Set(s);
  if (n.has(id)) n.delete(id); else { n.add(id); n.delete(opposite(id)); }
  return n;
};

/**
 * End-of-draft check-in. How realistic was it, what felt off about the bots, and (when you drafted against your
 * leaguemates) who drafted unlike the real person. The answers tune the bots for your next mock.
 */
export default function MockSurvey({ context, mates, onTune, onTuneMate }: {
  context: Record<string, string>;
  /** leaguemates who were in this draft (empty for AI personalities) */
  mates: { id: string; name: string }[];
  onTune: (issueIds: string[]) => void;
  onTuneMate?: (managerId: string, issueIds: string[]) => void;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [issues, setIssues] = useState<Set<string>>(new Set());
  const [mate, setMate] = useState<string | null>(null);
  const [mateIssues, setMateIssues] = useState<Record<string, Set<string>>>({});
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string[] | null>(null);

  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${on
    ? "bg-emerald-500 text-slate-950 ring-emerald-400" : "bg-slate-800 text-slate-300 ring-slate-700 hover:bg-slate-700"}`;
  const nameOf = (id: string) => mates.find((m) => m.id === id)?.name ?? "Leaguemate";
  // "Takes RBs earlier" -> "takes RBs earlier" (keep position names capitalized)
  const mateLabels = (s: Set<string>) => [...s].map((x) => MATE_ISSUES.find((m) => m.id === x)?.label ?? "").map((l) => l.charAt(0).toLowerCase() + l.slice(1)).join(", ");

  const send = () => {
    const ids = [...issues];
    if (ids.length) onTune(ids);
    const mateChanges = Object.entries(mateIssues).filter(([, s]) => s.size);
    for (const [id, s] of mateChanges) onTuneMate?.(id, [...s]);
    const effects = [
      ...ids.map((id) => BOT_ISSUES.find((x) => x.id === id)?.effect).filter(Boolean) as string[],
      ...mateChanges.map(([id, s]) => `${nameOf(id)}: ${mateLabels(s)}`),
    ];
    // Feedback for improving the defaults: what felt off, never leaguemates' names
    const message = [
      ...ids.map((id) => BOT_ISSUES.find((x) => x.id === id)?.label),
      ...mateChanges.map(([, s]) => `a leaguemate: ${mateLabels(s)}`),
      note.trim(),
    ].filter(Boolean).join(" · ");
    sendFeedback({ kind: "mock_realism", score, message, context }).catch(() => {});
    setDone(effects);
  };

  if (done) {
    return (
      <div className="ff-pop rounded-xl bg-emerald-500/5 px-4 py-3 text-sm ring-1 ring-emerald-500/20">
        <div className="font-semibold text-emerald-300">Thanks! {done.length ? "Your next mock is tuned:" : "Glad it felt right."}</div>
        {done.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-slate-300">{done.map((e) => <li key={e}>• {e}</li>)}</ul>}
        {done.length > 0 && <p className="mt-2 text-[11px] text-slate-500">Change it any time: Reset on the mock draft setup screen, and leaguemate changes are in Describe leaguemates.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-slate-900/60 px-4 py-3 ring-1 ring-slate-800">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-300">How realistic did the bots draft?</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setScore(n)}
              className={`h-8 w-8 rounded-md text-sm font-semibold ${score === n ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{n}</button>
          ))}
        </div>
      </div>
      {score != null && (
        <div className="ff-fade space-y-3">
          <div>
            <div className="mb-1.5 text-xs text-slate-400">What felt off? Tap any, and the bots adjust for next time.</div>
            <div className="flex flex-wrap gap-1.5">
              {BOT_ISSUES.map((x) => <button key={x.id} onClick={() => setIssues((cur) => toggle(cur, x.id))} className={chip(issues.has(x.id))}>{x.label}</button>)}
            </div>
          </div>
          {mates.length > 0 && onTuneMate && (
            <div>
              <div className="mb-1.5 text-xs text-slate-400">Did anyone draft unlike the real person? Tap a name.</div>
              <div className="flex flex-wrap gap-1.5">
                {mates.map((m) => {
                  const n = mateIssues[m.id]?.size ?? 0;
                  return (
                    <button key={m.id} onClick={() => setMate(mate === m.id ? null : m.id)} className={chip(mate === m.id)}>
                      {m.name}{n ? ` · ${n}` : ""}
                    </button>
                  );
                })}
              </div>
              {mate && (
                <div className="ff-fade mt-2 rounded-lg bg-slate-950/60 p-2.5 ring-1 ring-slate-800">
                  <div className="mb-1.5 text-[11px] text-slate-400">In real life, {nameOf(mate)}…</div>
                  <div className="flex flex-wrap gap-1.5">
                    {MATE_ISSUES.map((x) => {
                      const on = mateIssues[mate]?.has(x.id) ?? false;
                      return (
                        <button key={x.id} className={chip(on)}
                          onClick={() => setMateIssues((cur) => ({ ...cur, [mate]: toggle(cur[mate] ?? new Set(), x.id) }))}>{x.label}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Anything else? (optional)"
              className="min-w-0 flex-1 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white ring-1 ring-slate-700 placeholder:text-slate-500" />
            <button onClick={send} className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400">Send</button>
          </div>
        </div>
      )}
    </div>
  );
}
