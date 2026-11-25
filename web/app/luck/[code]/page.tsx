import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHeader from "@/components/PageHeader";
import { SITE_NAME } from "@/lib/season";
import { decodeLuck } from "@/lib/share";

type Props = { params: Promise<{ code: string }> };

const luckText = (x10: number) => `${x10 >= 0 ? "+" : "−"}${(Math.abs(x10) / 10).toFixed(1)}`;
function headline(l: NonNullable<ReturnType<typeof decodeLuck>>) {
  const me = l.me ? l.t.find((r) => r[0] === l.me) : null;
  if (me) {
    const x = me[6] / 10;
    return Math.abs(x) < 0.5 ? `${me[0]}'s record matches its scoring` : `${me[0]} is ${Math.abs(x).toFixed(1)} wins ${x > 0 ? "lucky" : "unlucky"}`;
  }
  const worst = [...l.t].sort((a, b) => a[6] - b[6])[0];
  return worst ? `${worst[0]} is ${(Math.abs(worst[6]) / 10).toFixed(1)} wins unlucky` : "Luck meter";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = decodeLuck((await params).code);
  if (!l) return { title: SITE_NAME };
  const title = `${headline(l)} · ${l.lg} luck meter`;
  const description = `All-play records and schedule luck for every team in ${l.lg} through ${l.wk} weeks.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

async function Luck({ params }: Props) {
  const { code } = await params;
  const l = decodeLuck(code);
  if (!l) return <p className="text-slate-400">This link is invalid or was cut off.</p>;
  const max = Math.max(10, ...l.t.map((r) => Math.abs(r[6])));
  return (
    <div className="w-full max-w-2xl">
      <div className="text-xs tracking-widest text-emerald-400 uppercase">Luck meter · through {l.wk} weeks</div>
      <h1 className="mt-1 text-2xl font-bold text-white">{headline(l)}</h1>
      <div className="text-sm text-slate-400">{l.lg}</div>
      <div className="mt-5 overflow-hidden rounded-xl ring-1 ring-slate-800">
        {l.t.map(([name, w, lo, aw, al, exp, luck]) => (
          <div key={name} className={`flex items-center gap-3 border-b border-slate-800/70 px-4 py-3 last:border-0 ${name === l.me ? "bg-emerald-500/10" : "bg-slate-950"}`}>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-white">{name}</div>
              <div className="text-[11px] text-slate-500">{w}-{lo} · all-play {aw}-{al} · earned {(exp / 10).toFixed(1)} wins</div>
            </div>
            <div className="relative h-1.5 w-24 shrink-0 rounded-full bg-slate-800" aria-hidden>
              <span className="absolute top-0 left-1/2 h-1.5 w-px bg-slate-600" />
              <span className={`absolute top-0 h-1.5 rounded-full ${luck >= 0 ? "left-1/2 bg-emerald-400" : "right-1/2 bg-rose-400"}`} style={{ width: `${(Math.abs(luck) / max) * 50}%` }} />
            </div>
            <div className={`w-12 text-right text-sm font-bold tabular-nums ${luck >= 5 ? "text-emerald-300" : luck <= -5 ? "text-rose-300" : "text-slate-400"}`}>{luckText(luck)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Luck = actual wins minus the wins each team&apos;s weekly scores earned against the whole league.</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Link href="/app" className="rounded-xl bg-emerald-500 py-3 text-center text-sm font-bold text-slate-950 hover:bg-emerald-400">Check your league&apos;s luck</Link>
        <a href={`/luck/${code}/opengraph-image`} download="luck-meter.png" className="rounded-xl py-3 text-center text-sm font-semibold text-slate-300 ring-1 ring-slate-700 hover:bg-slate-900">Download image</a>
      </div>
    </div>
  );
}

export default function LuckSharePage(props: Props) {
  return (
    <>
      <PageHeader />
      <main className="flex justify-center px-4 py-8">
        <Suspense fallback={<div className="text-slate-500">Loading…</div>}>
          <Luck {...props} />
        </Suspense>
      </main>
    </>
  );
}
