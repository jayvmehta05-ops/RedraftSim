"use client";

import { useState } from "react";

const BURST = 16;

/**
 * Headline with a clickable year. Each click rolls the year forward with a burst and a new line,
 * then snaps back to the season we actually project.
 */
export default function HeroHeadline({ target, source }: { target: number; source: number }) {
  const lines = [
    `Next-season fantasy football projections tuned to your exact scoring and roster, mock drafts against bots that draft like your leaguemates, and the trade and waiver tools to win ${source} along the way.`,
    `${target + 1}? Bold. Your waiver-wire stash is a weekly starter by then.`,
    `${target + 2}: someone in your league still drafts a kicker in round 9.`,
    `${target + 3}: the rookie you're ignoring today is a first-round pick.`,
    `${target + 4}: okay, time traveler. Even we don't project that far.`,
  ];
  const [step, setStep] = useState(0);
  const [bursts, setBursts] = useState(0);
  const year = target + step;
  const next = () => {
    setStep((s) => (s + 1) % lines.length);
    setBursts((b) => b + 1);
  };

  return (
    <>
      <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
        Your league&apos;s{" "}
        <button type="button" onClick={next} aria-label={`Year ${year}. Click to look further ahead`}
          className="group relative inline-block cursor-pointer rounded-xl px-1 align-baseline [perspective:600px] focus-visible:outline-emerald-400">
          <span key={year} className="ff-roll bg-gradient-to-br from-emerald-300 via-emerald-400 to-cyan-300 bg-clip-text text-transparent">
            {year}
          </span>
          {/* burst of sparks on every click */}
          {bursts > 0 && (
            <span key={bursts} aria-hidden className="pointer-events-none absolute top-1/2 left-1/2">
              {Array.from({ length: BURST }, (_, i) => {
                const a = ((i / BURST) * 360 + bursts * 23) * (Math.PI / 180);
                const r = 60 + ((i * 37 + bursts * 11) % 50);
                return (
                  <span key={i} className={`ff-burst absolute h-2 w-2 rounded-full ${i % 3 === 0 ? "bg-cyan-300" : i % 3 === 1 ? "bg-emerald-400" : "bg-amber-300"}`}
                    style={{ "--dx": `${Math.cos(a) * r}px`, "--dy": `${Math.sin(a) * r}px`, "--rot": `${i * 40}deg` } as React.CSSProperties} />
                );
              })}
            </span>
          )}
          {step === 0 && bursts === 0 && (
            <span aria-hidden className="absolute -top-3 -right-4 flex h-4 w-4 sm:-right-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-[9px] font-black text-slate-950">✦</span>
            </span>
          )}
        </button>{" "}
        board, <br className="hidden sm:block" />built today.
      </h1>
      <p key={step} className="ff-rise mt-5 min-h-[6.5rem] max-w-xl text-base leading-relaxed text-slate-400 sm:min-h-[4.5rem] sm:text-lg" aria-live="polite">
        {lines[step]}
        {step > 0 && (
          <button onClick={() => setStep(0)} className="ml-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300">Back to {target} ↺</button>
        )}
      </p>
      {step === 0 && bursts === 0 && <p className="mt-2 text-xs text-slate-500">Psst: tap the year ✦</p>}
    </>
  );
}
