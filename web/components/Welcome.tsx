"use client";

import { useEffect, useState } from "react";
import { TARGET } from "@/lib/season";
import { IconClose, IconImport, IconLive, IconMock } from "./icons";

const KEY = "redraft.welcomeDismissed";

/** First-visit welcome: what the site is for and the three things to do first. Dismissible. */
export default function Welcome({ onImport, onMock, onLive }: { onImport: () => void; onMock: () => void; onLive: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };
  if (!show) return null;

  const actions = [
    { icon: IconImport, title: "Import your league", body: "Sleeper or ESPN. Your scoring, roster spots and leaguemates' draft habits.", onClick: onImport },
    { icon: IconMock, title: "Run a mock draft", body: "Draft against bots that behave like real people, or like your actual league.", onClick: onMock },
    { icon: IconLive, title: "Get help live", body: "Connect to your real Sleeper draft and get pick suggestions as it happens.", onClick: onLive },
  ];
  return (
    <section className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/15 via-slate-900 to-slate-900 p-4 ring-1 ring-emerald-500/20 sm:p-7">
      <button onClick={dismiss} className="absolute right-3 top-3 rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Dismiss welcome">
        <IconClose className="h-4 w-4" />
      </button>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Next season starts now</p>
      <h2 className="mt-2 max-w-2xl pr-6 text-xl font-bold tracking-tight text-white sm:text-3xl">
        Win your {TARGET} draft before anyone else is thinking about it.
      </h2>
      <p className="mt-2 hidden max-w-2xl text-sm leading-relaxed text-slate-300 sm:block">
        A {TARGET} redraft board rebuilt every Tuesday from this season&apos;s games, tuned to your league&apos;s rules,
        with mock drafts against bots that draft like your leaguemates.
      </p>
      <div className="mt-4 grid gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-3">
        {actions.map(({ icon: Icon, title, body, onClick }) => (
          <button key={title} onClick={() => { onClick(); dismiss(); }}
            className="group flex items-center gap-3 rounded-xl bg-slate-950/60 px-3 py-2.5 text-left ring-1 ring-slate-800 transition hover:ring-emerald-500/50 sm:block sm:p-4">
            <Icon className="h-5 w-5 shrink-0 text-emerald-400" />
            <div className="text-sm font-semibold text-white group-hover:text-emerald-300 sm:mt-2">{title}</div>
            <div className="mt-1 hidden text-xs leading-relaxed text-slate-400 sm:block">{body}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
