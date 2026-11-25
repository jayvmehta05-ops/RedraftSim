import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHeader from "@/components/PageHeader";
import { SITE_NAME } from "@/lib/season";
import { decodeOdds, pctLabel } from "@/lib/share";

type Props = { params: Promise<{ code: string }> };

function headline(o: NonNullable<ReturnType<typeof decodeOdds>>) {
  const me = o.me ? o.t.find((r) => r[0] === o.me) : null;
  return me ? `${me[0]}: ${pctLabel(me[3])} playoff odds` : `${o.t[0]?.[0] ?? "Every team"} leads the playoff race`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = decodeOdds((await params).code);
  if (!o) return { title: SITE_NAME };
  const title = `${headline(o)} · ${o.lg}`;
  const description = o.st
    ? `Win vs ${o.st[0]}: ${pctLabel(o.st[1])}. Lose: ${pctLabel(o.st[2])}. 10,000 simulated finishes to the season.`
    : `Playoff and title odds for every team in ${o.lg}, from 10,000 simulated finishes.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

const tone = (x: number) => (x >= 750 ? "text-emerald-300" : x >= 400 ? "text-amber-300" : x >= 100 ? "text-orange-300" : "text-rose-300");

async function Odds({ params }: Props) {
  const { code } = await params;
  const o = decodeOdds(code);
  if (!o) return <p className="text-slate-400">This link is invalid or was cut off.</p>;
  return (
    <div className="w-full max-w-2xl">
      <div className="text-xs tracking-widest text-emerald-400 uppercase">Playoff odds · Week {o.wk} · top {o.p} make it</div>
      <h1 className="mt-1 text-2xl font-bold text-white">{headline(o)}</h1>
      <div className="text-sm text-slate-400">{o.lg}</div>
      {o.st && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-emerald-500/10 px-4 py-3 ring-1 ring-emerald-500/25">
            <div className="text-xs text-emerald-300">Beat {o.st[0]}</div>
            <div className="text-2xl font-black tabular-nums text-white">{pctLabel(o.st[1])}</div>
          </div>
          <div className="rounded-xl bg-rose-500/10 px-4 py-3 ring-1 ring-rose-500/25">
            <div className="text-xs text-rose-300">Lose to {o.st[0]}</div>
            <div className="text-2xl font-black tabular-nums text-white">{pctLabel(o.st[2])}</div>
          </div>
        </div>
      )}
      <div className="mt-5 overflow-hidden rounded-xl ring-1 ring-slate-800">
        {o.t.map(([name, w, l, po, title], i) => (
          <div key={name} className={`flex items-center gap-3 border-b border-slate-800/70 px-4 py-3 last:border-0 ${name === o.me ? "bg-emerald-500/10" : "bg-slate-950"} ${i === o.p ? "border-t-2 border-t-slate-600" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-white">{name}</div>
              <div className="text-[11px] text-slate-500">{w}-{l} · title {pctLabel(title)}</div>
            </div>
            <div className={`text-lg font-black tabular-nums ${tone(po)}`}>{pctLabel(po)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">From 10,000 simulated finishes using each roster&apos;s projections and actual scoring.</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Link href="/app" className="rounded-xl bg-emerald-500 py-3 text-center text-sm font-bold text-slate-950 hover:bg-emerald-400">Get your league&apos;s odds</Link>
        <a href={`/odds/${code}/opengraph-image`} download="playoff-odds.png" className="rounded-xl py-3 text-center text-sm font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-900">Download image</a>
      </div>
    </div>
  );
}

export default function OddsSharePage(props: Props) {
  return (
    <>
      <PageHeader />
      <main className="flex justify-center px-4 py-8">
        <Suspense fallback={<div className="text-slate-500">Loading…</div>}>
          <Odds {...props} />
        </Suspense>
      </main>
    </>
  );
}
