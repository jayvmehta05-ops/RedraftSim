import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHeader from "@/components/PageHeader";
import { SITE_NAME } from "@/lib/season";
import { decodePower } from "@/lib/share";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = decodePower((await params).code);
  if (!p) return { title: SITE_NAME };
  const title = `${p.lg} power rankings — ${SITE_NAME}`;
  const description = `#1 ${p.t[0]?.[0] ?? ""}. Every team ranked by projected starting lineup (${p.h}).`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

async function Rankings({ params }: Props) {
  const p = decodePower((await params).code);
  if (!p) return <p className="text-slate-400">This link is invalid or was cut off.</p>;
  return (
    <div className="w-full max-w-2xl">
      <div className="text-xs uppercase tracking-widest text-emerald-400">Power rankings · {p.h}</div>
      <h1 className="mt-1 text-2xl font-bold text-white">{p.lg}</h1>
      <ol className="mt-5 overflow-hidden rounded-xl ring-1 ring-slate-800">
        {p.t.map(([name, rank, w, l, pts, best]) => (
          <li key={`${rank}-${name}`} className="flex items-center gap-4 border-b border-slate-800/70 bg-slate-950 px-4 py-3 last:border-0">
            <span className="w-7 text-center text-xl font-black tabular-nums text-white">{rank}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-white">{name}</span>
              <span className="text-[11px] text-slate-500">{w || l ? `${w}-${l}` : ""}{best ? `${w || l ? " · " : ""}best: ${best}` : ""}</span>
            </span>
            <span className="text-sm font-bold tabular-nums text-slate-200">{pts.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">pts</span></span>
          </li>
        ))}
      </ol>
      <Link href="/" className="mt-6 block rounded-xl bg-emerald-500 py-3 text-center text-sm font-bold text-slate-950 hover:bg-emerald-400">
        Rank your own league
      </Link>
    </div>
  );
}

export default function RankingsPage(props: Props) {
  return (
    <>
      <PageHeader />
      <main className="flex justify-center px-4 py-8">
        <Suspense fallback={<div className="text-slate-500">Loading…</div>}>
          <Rankings {...props} />
        </Suspense>
      </main>
    </>
  );
}
