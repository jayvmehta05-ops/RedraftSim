import type { Metadata } from "next";
import Link from "next/link";
import boardJson from "@/data/board.json";
import trendsJson from "@/data/trends.json";
import type { BoardData, TrendData } from "@/lib/types";
import { SITE_NAME, TARGET } from "@/lib/season";
import PageHeader from "@/components/PageHeader";

const board = boardJson as unknown as BoardData;
const trends = trendsJson as unknown as TrendData;
const week = board.meta.throughWeek;

export const metadata: Metadata = {
  title: `${TARGET} Fantasy Football Risers & Fallers after Week ${week} — ${SITE_NAME}`,
  description: `Whose ${TARGET} redraft ADP moved most after ${board.meta.sourceSeason} Week ${week}: the biggest risers and fallers in projected ${TARGET} fantasy value, updated every Tuesday.`,
};

function movers() {
  const w = trends.weeks;
  if (w.length < 2) return { risers: [], fallers: [] };
  const end = w.length - 1;
  const start = Math.max(0, end - 1);
  const rows = board.players
    .filter((p) => !p.rookie)
    .map((p) => {
      const t = trends.players[p.id];
      const from = t?.adp[start];
      const to = t?.adp[end];
      return from != null && to != null && Math.min(from, to) <= 180 ? { p, from, to, change: Math.round(from - to) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return {
    risers: rows.filter((r) => r.change > 0).sort((a, b) => b.change - a.change).slice(0, 20),
    fallers: rows.filter((r) => r.change < 0).sort((a, b) => a.change - b.change).slice(0, 20),
  };
}

function List({ title, rows, up }: { title: string; rows: ReturnType<typeof movers>["risers"]; up: boolean }) {
  return (
    <section className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800">
      <h2 className={`border-b border-slate-800 px-4 py-3 text-base font-semibold ${up ? "text-emerald-400" : "text-rose-400"}`}>{title}</h2>
      <ol>
        {rows.map((r, i) => (
          <li key={r.p.id} className="flex items-center gap-3 border-t border-slate-800/60 px-4 py-2 text-sm">
            <span className="w-5 text-slate-500">{i + 1}</span>
            <span className="flex-1"><span className="font-medium text-white">{r.p.name}</span> <span className="text-slate-500">{r.p.pos} · {r.p.team}</span></span>
            <span className="tabular-nums text-slate-400">ADP {Math.round(r.from)} → {Math.round(r.to)}</span>
            <span className={`w-12 text-right font-semibold tabular-nums ${up ? "text-emerald-400" : "text-rose-400"}`}>{up ? "▲" : "▼"}{Math.abs(r.change)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function RisersPage() {
  const { risers, fallers } = movers();
  return (
    <>
    <PageHeader />
    <main className="mx-auto max-w-5xl px-4 py-8 text-slate-200">
      <h1 className="mt-3 text-2xl font-bold text-white">{TARGET} fantasy risers &amp; fallers after Week {week}</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-400">
        Biggest week-over-week moves in projected {TARGET} redraft ADP (12-team, full PPR) after {board.meta.sourceSeason} Week {week}.
        Projections blend this season&apos;s usage and efficiency with age curves, injuries and positional scarcity, and update every Tuesday.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <List title="Risers" rows={risers} up />
        <List title="Fallers" rows={fallers} up={false} />
      </div>
      <p className="mt-6 text-sm"><Link href="/app" className="text-emerald-400 hover:underline">See the full {TARGET} big board and run a mock draft →</Link></p>
    </main>
    </>
  );
}
