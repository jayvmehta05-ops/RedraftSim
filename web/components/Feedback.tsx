"use client";

import { useState } from "react";

type Kind = "general" | "bug" | "idea" | "projections" | "mock_realism";

export async function sendFeedback(payload: {
  kind: Kind; score?: number | null; message?: string; email?: string; context?: Record<string, string>; website?: string;
}) {
  const r = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, context: { path: window.location.pathname, width: String(window.innerWidth), ...payload.context } }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Couldn't send feedback");
}

const KINDS: { v: Kind; label: string }[] = [
  { v: "general", label: "General" },
  { v: "idea", label: "Feature idea" },
  { v: "bug", label: "Something broke" },
  { v: "projections", label: "A projection looks wrong" },
];

/** Floating "Feedback" button + form: 0-10 recommend score, category, comment, optional email. */
export default function FeedbackButton({ context, inline = false }: { context?: Record<string, string>; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [kind, setKind] = useState<Kind>("general");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: hidden from people, bots fill it in
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async () => {
    setState("sending");
    try {
      await sendFeedback({ kind, score, message, email, website, context });
      setState("sent");
      setMessage("");
      setScore(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send feedback");
      setState("error");
    }
  };

  return (
    <>
      {inline ? (
        <button onClick={() => { setOpen(true); setState("idle"); }} aria-label="Send feedback"
          className="flex shrink-0 items-center rounded-lg bg-slate-900 p-2 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" />
          </svg>
        </button>
      ) : (
        <button onClick={() => { setOpen(true); setState("idle"); }}
          className="fixed bottom-5 right-5 z-30 hidden rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-950/50 hover:bg-emerald-400 lg:block">
          Feedback
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-slate-900 p-5 ring-1 ring-slate-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Help make this better</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" aria-label="Close feedback">✕</button>
            </div>
            {state === "sent" ? (
              <p className="mt-4 text-sm text-emerald-300">Thanks! Every note gets read.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1 text-xs text-slate-400">How likely are you to recommend this site to a leaguemate? (0–10)</div>
                  <div className="grid grid-cols-11 gap-1">
                    {Array.from({ length: 11 }, (_, i) => (
                      <button key={i} onClick={() => setScore(i)}
                        className={`rounded py-1.5 text-xs font-semibold ${score === i ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{i}</button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {KINDS.map((k) => (
                    <button key={k.v} onClick={() => setKind(k.v)}
                      className={`rounded-full px-3 py-1 text-xs ${kind === k.v ? "bg-slate-600 text-white" : "bg-slate-800 text-slate-400"}`}>{k.label}</button>
                  ))}
                </div>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2000}
                  placeholder={kind === "projections" ? "Which player, and what do you think we're missing?" : "What would make this more useful for your draft?"}
                  className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-emerald-500" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email (optional, for a reply or launch news)"
                  className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-slate-700 placeholder:text-slate-500" />
                <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden
                  className="hidden" name="website" />
                {state === "error" && <p className="text-xs text-rose-300">{error}</p>}
                <button disabled={state === "sending" || (score == null && !message.trim())} onClick={submit}
                  className="w-full rounded-lg bg-emerald-500 py-2 text-sm font-bold text-slate-950 disabled:bg-slate-800 disabled:text-slate-600">
                  {state === "sending" ? "Sending…" : "Send feedback"}
                </button>
                <p className="text-[10px] text-slate-500">Your email is only used to reply to you and is never shown publicly.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** One-tap realism rating shown when a mock draft finishes. */
export function MockSurvey({ context }: { context: Record<string, string> }) {
  const [score, setScore] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  if (done) return <div className="rounded-xl bg-slate-900/60 px-4 py-3 text-sm text-emerald-300 ring-1 ring-slate-800">Thanks, that helps tune the bots.</div>;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900/60 px-4 py-3 ring-1 ring-slate-800">
      <span className="text-sm text-slate-300">How realistic did the bots draft?</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setScore(n)}
            className={`h-8 w-8 rounded-md text-sm font-semibold ${score === n ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{n}</button>
        ))}
      </div>
      {score != null && (
        <>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything that felt off? (optional)"
            className="min-w-0 flex-1 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white ring-1 ring-slate-700 placeholder:text-slate-500" />
          <button onClick={() => { sendFeedback({ kind: "mock_realism", score, message: note, context }).catch(() => {}); setDone(true); }}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950">Send</button>
        </>
      )}
    </div>
  );
}
