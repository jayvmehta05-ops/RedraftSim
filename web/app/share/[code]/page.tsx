import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { decodeMock } from "@/lib/share";
import { SITE_NAME, TARGET } from "@/lib/season";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = decodeMock((await params).code);
  if (!m) return { title: SITE_NAME };
  const title = `${m.g} mock draft from 1.${String(m.s).padStart(2, "0")} — ${SITE_NAME}`;
  const description = `Finished #${m.r} of ${m.t} with ${m.p.slice(0, 3).map((x) => x[0]).join(", ")}. Run your own ${TARGET} mock draft.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

async function SharedCard({ params }: Props) {
  const m = decodeMock((await params).code);
  if (!m) return <p className="text-slate-400">This share link is invalid or was cut off.</p>;
  return (
    <div className="w-full max-w-lg rounded-2xl bg-slate-900 p-6 ring-1 ring-slate-800">
      <div className="text-xs uppercase tracking-widest text-emerald-400">{TARGET} mock draft{m.lg ? ` · ${m.lg}` : ""}</div>
      <div className="mt-2 flex items-end gap-4">
        <div className="text-6xl font-black text-white">{m.g}</div>
        <div className="pb-2 text-sm text-slate-400">
          Pick 1.{String(m.s).padStart(2, "0")} · finished #{m.r} of {m.t}
          <div>{m.pts.toLocaleString()} projected starter points</div>
        </div>
      </div>
      <ol className="mt-5 space-y-1">
        {m.p.map(([name, pos, rp]) => (
          <li key={rp} className="flex items-center gap-3 text-sm">
            <span className="w-10 tabular-nums text-slate-500">{rp}</span>
            <span className="flex-1 text-white">{name}</span>
            <span className="text-xs text-slate-400">{pos}</span>
          </li>
        ))}
      </ol>
      <Link href="/app" className="mt-6 block rounded-xl bg-emerald-500 py-3 text-center text-sm font-bold text-slate-950 hover:bg-emerald-400">
        Run your own {TARGET} mock draft
      </Link>
    </div>
  );
}

export default function SharePage(props: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <Suspense fallback={<div className="text-slate-500">Loading…</div>}>
        <SharedCard {...props} />
      </Suspense>
    </main>
  );
}
