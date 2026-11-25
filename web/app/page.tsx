import type { Metadata } from "next";
import Link from "next/link";
import AccountButton from "@/components/AccountButton";
import ContinueButton from "@/components/ContinueButton";
import { Logo } from "@/components/icons";
import Counters from "@/components/landing/Counters";
import FeatureTour from "@/components/landing/FeatureTour";
import HeroHeadline from "@/components/landing/HeroHeadline";
import TopCard, { type TopRow } from "@/components/landing/TopCard";
import { thumb } from "@/components/ui";
import boardJson from "@/data/board.json";
import { SITE_NAME, SOURCE, TARGET } from "@/lib/season";
import type { BoardData, Pos, RawPlayer } from "@/lib/types";

const board = boardJson as unknown as BoardData;

export const metadata: Metadata = {
  title: `${SITE_NAME}: ${TARGET} fantasy football projections, mock drafts & league tools`,
  description: `Next season's fantasy football board today, re-ranked for your league's exact rules. Mock drafts against bots that draft like your leaguemates, plus trade, waiver and luck tools for ${SOURCE}.`,
};

const STEPS = [
  { n: "1", title: "Bring your league", body: "Import from Sleeper or ESPN (private leagues too) or set it up by hand. No account needed." },
  { n: "2", title: "Everything re-ranks", body: "Scoring, roster slots and team count flow into every projection, ranking and suggestion." },
  { n: "3", title: "Plan your moves", body: "Mock your draft, find trades and work the waiver wire with numbers built for your league." },
];

const FAQ = [
  ["Is this for redraft or dynasty?", "Redraft first. In-season tools (rosters, trades, waivers) look at the rest of this season only. Keeper leagues can switch League type to Keeper in settings. Dynasty isn't modeled yet."],
  ["Why a board for next season already?", `Because the best time to plan is before everyone else does. The ${TARGET} board updates every Tuesday from this season's games, so you can watch values move all year.`],
  ["Are the projections guaranteed?", "No. They're model estimates from public data and they will miss sometimes. How they've done on past seasons is published on the Accuracy page, good and bad."],
  ["How current are my league's rosters?", "They refresh from Sleeper or ESPN every 10 minutes while you're using My League, and there's a Refresh now button. A trade stuck in your platform's review period appears once it goes through."],
  ["Why does it ask for my ESPN cookies?", "Only for private ESPN leagues, which ESPN won't share without your login. The cookies stay on your device and are never stored on our servers or in your account."],
  ["What isn't covered?", "Kickers and defenses aren't projected, and some bonus scoring rules aren't modeled. The app tells you which of your league's rules it approximates."],
  ["Does it cost anything?", "No. Free, no ads, no gambling. Sign in with Google only if you want your leagues on every device."],
];

function toRow(p: RawPlayer): TopRow {
  return { id: p.id, name: p.name, team: p.team, pos: p.pos, posRank: p.posRank, ppg: p.ppg, img: thumb(p.headshot, 64) };
}

export default function Landing() {
  const players = [...board.players].sort((a, b) => a.rank - b.rank);
  const pick = (pos?: Pos) => players.filter((p) => !pos || p.pos === pos).slice(0, 5).map(toRow);
  const lists = { ALL: pick(), QB: pick("QB"), RB: pick("RB"), WR: pick("WR"), TE: pick("TE") };
  const m = board.meta;
  const updated = m.lastIngest
    ? new Date(m.lastIngest).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : null;
  // This week's biggest movers among relevant players, for the ticker
  const relevant = players.filter((p) => p.rank <= 200 && p.rankDelta != null && Math.abs(p.rankDelta) >= 3);
  const risers = [...relevant].sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0)).slice(0, 8);
  const fallers = [...relevant].sort((a, b) => (a.rankDelta ?? 0) - (b.rankDelta ?? 0)).slice(0, 8);
  const ticker = risers.flatMap((r, i) => [r, fallers[i]].filter(Boolean));
  const names = players.slice(0, 20).map((p) => p.name);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <Logo className="h-8 w-8 transition group-hover:rotate-[-8deg] group-hover:scale-110" />
            <span className="whitespace-nowrap text-sm font-bold text-white sm:text-base">Future <span className="text-emerald-400">Fantasy</span></span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 text-sm font-semibold md:flex">
            <a href="#tour" className="rounded-md px-3 py-2 text-slate-400 hover:bg-slate-900 hover:text-white">Features</a>
            <Link href="/accuracy" className="rounded-md px-3 py-2 text-slate-400 hover:bg-slate-900 hover:text-white">Accuracy</Link>
            <a href="#faq" className="rounded-md px-3 py-2 text-slate-400 hover:bg-slate-900 hover:text-white">FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-2">
            <AccountButton />
            <Link href="/app" className="relative overflow-hidden whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400">
              <span aria-hidden className="ff-shimmer absolute inset-0" />
              <span className="relative">Open app</span>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="ff-grid absolute inset-0" />
            <div className="ff-float absolute -top-32 -left-24 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="ff-float-2 absolute top-10 right-0 h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl" />
            <div className="ff-float absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl" style={{ animationDelay: "-6s" }} />
          </div>
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 pb-14 md:grid-cols-[1.15fr_1fr] md:pt-20 md:pb-20">
            <div>
              {updated && (
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  Live · updated {updated} · through {m.sourceSeason} Week {m.throughWeek}
                </div>
              )}
              <HeroHeadline target={TARGET} source={SOURCE} />
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <ContinueButton newLabel={`See the ${TARGET} board`}
                  className="ff-glow relative inline-flex items-center gap-1 overflow-hidden rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:scale-[1.03] hover:bg-emerald-400" />
                <a href="#tour" className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-900 hover:text-white">
                  Take the tour ↓
                </a>
              </div>
              <p className="mt-4 text-xs text-slate-500">Free. No ads. No account needed. Sign in only to sync your leagues across devices.</p>
            </div>
            <TopCard lists={lists} target={TARGET} />
          </div>
        </section>

        {/* Movers ticker */}
        {ticker.length > 0 && (
          <section aria-label="This week's biggest movers" className="ff-marquee-wrap relative overflow-hidden border-y border-slate-800/70 bg-slate-900/40 py-3">
            <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-slate-950 to-transparent" />
            <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-slate-950 to-transparent" />
            <div className="ff-marquee flex w-max gap-8 whitespace-nowrap text-sm">
              {[...ticker, ...ticker].map((p, i) => {
                const up = (p.rankDelta ?? 0) > 0;
                return (
                  <Link key={`${p.id}-${i}`} href="/risers" className="flex items-center gap-2 text-slate-300 hover:text-white">
                    <span className={`font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>{up ? "▲" : "▼"} {Math.abs(p.rankDelta ?? 0)}</span>
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-xs text-slate-500">{p.pos} · now #{p.rank}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Counters */}
        <section className="mx-auto max-w-6xl px-4 pt-14">
          <Counters items={[
            { value: board.players.length, label: `players projected for ${TARGET}` },
            { value: m.throughWeek, label: `weeks of ${SOURCE} games in the model` },
            { value: 10, suffix: " min", label: "league roster refresh" },
            { value: 0, prefix: "$", label: "to use. No ads, no gambling" },
          ]} />
        </section>

        {/* Feature tour */}
        <section id="tour" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Everything for your league, in one place</h2>
            <p className="mt-2 max-w-2xl text-slate-400">Most sites wake up for next season in August. This one keeps your plan current all year. Click around:</p>
            <div className="mt-10">
              <FeatureTour names={names} target={TARGET} source={SOURCE} />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-slate-800/70">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Three steps to your league&apos;s board</h2>
            <div className="relative mt-10 grid gap-6 md:grid-cols-3">
              <div aria-hidden className="absolute top-[18px] right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0 md:block" />
              {STEPS.map((s) => (
                <div key={s.n} className="group relative flex gap-4 md:flex-col md:items-center md:text-center">
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm font-black text-slate-950 transition group-hover:scale-110">
                    <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40 [animation-duration:2.4s]" />
                    <span className="relative">{s.n}</span>
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-12 grid gap-3 sm:grid-cols-3">
              {[
                ["Tested on past seasons", "Accuracy is published, good and bad.", "/accuracy"],
                ["Not gambling", "A planning tool for season-long leagues. No bets, no odds.", "/terms"],
                ["Your data stays yours", "Each account sees only its own leagues. ESPN logins never leave your device.", "/privacy"],
              ].map(([t, b, href]) => (
                <Link key={t} href={href} className="rounded-xl bg-slate-900/50 p-4 ring-1 ring-slate-800 transition hover:-translate-y-0.5 hover:ring-emerald-500/40">
                  <div className="text-sm font-semibold text-white">{t}</div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-400">{b}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Good to know */}
        <section id="faq" className="scroll-mt-20 border-t border-slate-800/70">
          <div className="mx-auto max-w-3xl px-4 py-16 md:py-20">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Good to know</h2>
            <div className="mt-8 space-y-2">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group rounded-xl bg-slate-900/60 ring-1 ring-slate-800 open:ring-emerald-500/30">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 font-semibold text-white">
                    <span className="flex-1">{q}</span>
                    <span aria-hidden className="text-emerald-400 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="px-4 pb-4 text-sm leading-relaxed text-slate-400">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="relative overflow-hidden border-t border-slate-800/70">
          <div aria-hidden className="ff-float pointer-events-none absolute top-0 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-4 py-20 text-center">
            <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Get a head start on {TARGET}</h2>
            <p className="mx-auto mt-3 max-w-lg text-slate-400">Import your league in under a minute and see where your team stands.</p>
            <ContinueButton newLabel="Open the app"
              className="ff-glow mt-8 inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-7 py-3.5 text-base font-bold text-slate-950 transition hover:scale-[1.03] hover:bg-emerald-400" />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-xs text-slate-500">
          <span className="font-semibold text-slate-400">{SITE_NAME}</span>
          <Link href="/about" className="hover:text-slate-300">About</Link>
          <Link href="/guide" className="hover:text-slate-300">How it works</Link>
          <Link href="/accuracy" className="hover:text-slate-300">Accuracy</Link>
          <Link href="/privacy" className="hover:text-slate-300">Privacy</Link>
          <Link href="/terms" className="hover:text-slate-300">Terms</Link>
          <span className="w-full text-slate-600 sm:ml-auto sm:w-auto">Not affiliated with or endorsed by the NFL, ESPN, Sleeper or Yahoo.</span>
        </div>
      </footer>
    </div>
  );
}
