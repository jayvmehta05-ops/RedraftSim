import type { Metadata } from "next";
import Link from "next/link";
import AccountButton from "@/components/AccountButton";
import ContinueButton from "@/components/ContinueButton";
import { IconBoard, IconKeeper, IconLive, IconMock, IconSwap, IconTrend, Logo } from "@/components/icons";
import { PosBadge, thumb } from "@/components/ui";
import boardJson from "@/data/board.json";
import { SITE_NAME, SOURCE, TARGET } from "@/lib/season";
import type { BoardData } from "@/lib/types";

const board = boardJson as unknown as BoardData;

export const metadata: Metadata = {
  title: `${SITE_NAME}: ${TARGET} fantasy football projections, mock drafts & league tools`,
  description: `Next season's fantasy football board today, re-ranked for your league's exact rules. Mock drafts against bots that draft like your leaguemates, plus trade, waiver and keeper tools for ${SOURCE}.`,
};

const FEATURES = [
  { icon: IconBoard, title: `${TARGET} Big Board`, body: "Every player projected for next season and ranked by value over replacement, rebuilt every Tuesday from this season's games." },
  { icon: IconMock, title: "Mock drafts that feel real", body: "Bots learn how each of your leaguemates actually drafts. Describe them in plain words if they're new." },
  { icon: IconLive, title: "Live draft assistant", body: "Follow your real draft pick by pick, with the odds each player is still there at your next turn." },
  { icon: IconSwap, title: "My League", body: "Your best lineup, trades the other manager would actually accept, waiver pickups ranked for your roster, and power rankings." },
  { icon: IconKeeper, title: "Keeper calculator", body: "Which keepers are worth their cost, measured against where each player will really go." },
  { icon: IconTrend, title: "Trends", body: "Risers and fallers week to week, so you see value shifts before your league does." },
];

const STEPS = [
  { n: "1", title: "Bring your league", body: "Import from Sleeper or ESPN (private leagues too) or set it up by hand. No account needed." },
  { n: "2", title: "Everything re-ranks", body: "Scoring, roster slots and team count flow into every projection, ranking and suggestion." },
  { n: "3", title: "Plan your moves", body: "Mock your draft, find trades, set keepers and work the waiver wire with numbers built for your league." },
];

export default function Landing() {
  const top = [...board.players].sort((a, b) => a.rank - b.rank).slice(0, 5);
  const m = board.meta;
  const updated = m.lastIngest
    ? new Date(m.lastIngest).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="whitespace-nowrap text-sm font-bold text-white sm:text-base">{SITE_NAME}</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 text-sm font-semibold md:flex">
            <Link href="/guide" className="rounded-md px-3 py-2 text-slate-400 hover:bg-slate-900 hover:text-white">How it works</Link>
            <Link href="/accuracy" className="rounded-md px-3 py-2 text-slate-400 hover:bg-slate-900 hover:text-white">Accuracy</Link>
            <Link href="/about" className="rounded-md px-3 py-2 text-slate-400 hover:bg-slate-900 hover:text-white">About</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-2">
            <AccountButton />
            <Link href="/app" className="whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400">Open app</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.16),transparent_55%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 pb-16 md:grid-cols-[1.15fr_1fr] md:pt-20 md:pb-24">
            <div>
              {updated && (
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Updated {updated} · through {m.sourceSeason} Week {m.throughWeek}
                </div>
              )}
              <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
                Your league&apos;s <span className="text-emerald-400">{TARGET}</span> board, <br className="hidden sm:block" />built today.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
                Next-season fantasy football projections tuned to your exact scoring and roster, mock drafts against bots that draft like
                your leaguemates, and the trade, waiver and keeper tools to win {SOURCE} along the way.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ContinueButton newLabel={`See the ${TARGET} board`}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400" />
                <Link href="/guide" className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-900 hover:text-white">
                  How it works
                </Link>
              </div>
              <p className="mt-4 text-xs text-slate-500">Free. No account needed. Sign in only if you want your leagues on every device.</p>
            </div>

            {/* Live preview from the real board */}
            <div className="rounded-2xl bg-slate-900/80 p-4 shadow-2xl ring-1 ring-slate-800">
              <div className="flex items-center justify-between px-1 pb-3">
                <div className="text-sm font-bold text-white">Top 5 for {TARGET}</div>
                <div className="text-[11px] text-slate-500">12-team full PPR</div>
              </div>
              <ol className="space-y-1.5">
                {top.map((p) => {
                  const img = thumb(p.headshot, 64);
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-950/70 px-3 py-2.5 ring-1 ring-slate-800/80">
                      <span className="w-5 text-center text-sm font-black tabular-nums text-slate-500">{p.rank}</span>
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="h-9 w-9 rounded-full bg-slate-800 object-cover" />
                      ) : (
                        <span className="h-9 w-9 rounded-full bg-slate-800" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                        <div className="text-[11px] text-slate-500">{p.team}</div>
                      </div>
                      <PosBadge pos={p.pos} rank={p.posRank} />
                      <div className="w-14 text-right">
                        <div className="text-sm font-bold tabular-nums text-white">{p.ppg.toFixed(1)}</div>
                        <div className="text-[10px] text-slate-500">PPG</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <Link href="/app" className="mt-3 block rounded-xl py-2 text-center text-xs font-semibold text-emerald-300 hover:bg-slate-800">
                See the full board →
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-slate-800/70 bg-slate-950">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Everything for your league, in one place</h2>
            <p className="mt-2 max-w-2xl text-slate-400">Most sites wake up for next season in August. This one keeps your plan current all year.</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-2xl bg-slate-900/70 p-5 ring-1 ring-slate-800">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-semibold text-white">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-slate-800/70">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Three steps to your league&apos;s board</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.n} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm font-black text-slate-950">{s.n}</span>
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
                <Link key={t} href={href} className="rounded-xl bg-slate-900/50 p-4 ring-1 ring-slate-800 hover:ring-slate-700">
                  <div className="text-sm font-semibold text-white">{t}</div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-400">{b}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="border-t border-slate-800/70">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Get a head start on {TARGET}</h2>
            <p className="mx-auto mt-2 max-w-lg text-slate-400">Import your league in under a minute and see where your team stands.</p>
            <ContinueButton newLabel="Open the app"
              className="mt-6 inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400" />
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
