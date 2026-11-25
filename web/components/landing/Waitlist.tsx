"use client";

import { useState } from "react";

/** Email sign-up for what's coming next. Posts to /api/waitlist. */
export default function Waitlist({ source = "home" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState(""); // honeypot: hidden from people, bots fill it
  const [state, setState] = useState<"idle" | "busy" | "done" | "already" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setMsg(null);
    try {
      const r = await fetch("/api/waitlist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, website: hp }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setState("error"); setMsg(body.error ?? "Something went wrong. Try again."); return; }
      setState(body.already ? "already" : "done");
    } catch {
      setState("error");
      setMsg("Couldn't reach the server. Check your connection.");
    }
  };

  if (state === "done" || state === "already") {
    return (
      <div className="ff-rise mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-emerald-500/10 px-5 py-4 text-left ring-1 ring-emerald-500/30">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-lg font-black text-slate-950">
          <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-emerald-400/50 [animation-iteration-count:2]" />
          <span className="relative">✓</span>
        </span>
        <div>
          <div className="font-semibold text-white">{state === "already" ? "You're already on the list." : "You're on the list!"}</div>
          <div className="text-sm text-slate-400">We&apos;ll email you when something new ships. No spam, unsubscribe any time.</div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-md">
      <div className="flex flex-col gap-2 rounded-2xl bg-slate-900 p-2 ring-1 ring-slate-700 focus-within:ring-emerald-500/60 sm:flex-row">
        <label htmlFor={`wl-${source}`} className="sr-only">Email address</label>
        <input id={`wl-${source}`} type="email" required autoComplete="email" inputMode="email" placeholder="you@email.com"
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2.5 text-white placeholder:text-slate-500 focus:outline-none" />
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden value={hp} onChange={(e) => setHp(e.target.value)}
          className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        <button type="submit" disabled={state === "busy" || !email.trim()}
          className="relative overflow-hidden rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold whitespace-nowrap text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
          <span aria-hidden className="ff-shimmer absolute inset-0" />
          <span className="relative">{state === "busy" ? "Joining…" : "Join the waitlist"}</span>
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-rose-300">{msg}</p>}
      <p className="mt-2 text-xs text-slate-500">Only used to tell you about new features. See our <a href="/privacy" className="underline hover:text-slate-300">Privacy Policy</a>.</p>
    </form>
  );
}
