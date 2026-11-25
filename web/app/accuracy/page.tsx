import type { Metadata } from "next";
import backtestJson from "@/data/backtest.json";
import { SITE_NAME, TARGET } from "@/lib/season";
import PageHeader from "@/components/PageHeader";

interface MethodMetrics {
  n: number;
  spearman_points: number;
  mae_points: number | null;
  spearman_vorp: number;
  spearman_by_pos: Record<string, number>;
  top_n_hit_rate: Record<string, number>;
}
interface Miss { name: string; position: string; model_points: number; espn_points: number | null; actual_points: number; actual_games: number }
interface Result {
  target: number;
  data_seasons: number[];
  pool: number;
  rookies_excluded: number;
  metrics: Record<"model" | "espn" | "espn_rank" | "naive", MethodMetrics>;
  metrics_with_rookies?: Record<"model" | "espn" | "espn_rank" | "naive", MethodMetrics>;
  rookies?: { n: number; model: number | null; espn: number | null; espn_rank: number | null };
  misses: { beat_projection: Miss[]; missed_projection: Miss[] };
}
const bt = backtestJson as unknown as { generatedAt: string; poolDefinition: string; results: Result[] };

export const metadata: Metadata = {
  title: `Projection accuracy — ${SITE_NAME}`,
  description: "Out-of-sample backtest of the Redraft Sim projection model against ESPN preseason projections, ESPN rankings and a last-year baseline.",
};

const METHODS: { key: keyof Result["metrics"]; label: string }[] = [
  { key: "model", label: "Redraft Sim model" },
  { key: "espn", label: "ESPN preseason projections" },
  { key: "espn_rank", label: "ESPN preseason PPR rankings" },
  { key: "naive", label: "Same as last year" },
];

function best(r: Result, f: (m: MethodMetrics) => number | null, lowWins = false) {
  const vals = METHODS.map((m) => f(r.metrics[m.key])).filter((v): v is number => v != null);
  return lowWins ? Math.min(...vals) : Math.max(...vals);
}

function Cell({ v, b, d = 2 }: { v: number | null; b: number; d?: number }) {
  if (v == null) return <td className="px-3 py-2 text-slate-600">—</td>;
  return <td className={`px-3 py-2 tabular-nums ${v === b ? "font-bold text-emerald-300" : "text-slate-300"}`}>{v.toFixed(d)}</td>;
}

export default function AccuracyPage() {
  return (
    <>
    <PageHeader />
    <main className="mx-auto max-w-5xl px-4 py-8 text-slate-200">
      <h1 className="mt-3 text-2xl font-bold text-white">How accurate are the projections?</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
        Each season below was projected using only the two seasons before it, with the same engine that builds the {TARGET} board,
        then scored against what actually happened. Players: {bt.poolDefinition} (rookies are projected from
        draft-slot history and reported separately below each table). Higher correlation is better; lower average miss is better. Best value per column in green.
      </p>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500">
        Fair-comparison note: ESPN&apos;s preseason numbers include offseason news (trades, depth charts, injuries) that this
        backtest deliberately leaves out of our model, because the historical versions of those feeds aren&apos;t available.
      </p>

      {bt.results.map((r) => (
        <section key={r.target} className="mt-8">
          <h2 className="text-lg font-semibold text-white">{r.target} season <span className="text-sm font-normal text-slate-500">· projected from {r.data_seasons.join(" + ")} · {r.pool} players</span></h2>
          <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-slate-800">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-900 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2" title="Spearman rank correlation of projected vs actual season points">Rank correlation</th>
                  <th className="px-3 py-2" title="Rank correlation of value over replacement (what drives draft order)">Draft-value correlation</th>
                  <th className="px-3 py-2" title="Average absolute miss in season fantasy points">Avg miss (pts)</th>
                  <th className="px-3 py-2">Top-12 QB</th><th className="px-3 py-2">Top-24 RB</th>
                  <th className="px-3 py-2">Top-24 WR</th><th className="px-3 py-2">Top-12 TE</th>
                </tr>
              </thead>
              <tbody>
                {METHODS.map(({ key, label }) => {
                  const m = r.metrics[key];
                  return (
                    <tr key={key} className={`border-t border-slate-800 ${key === "model" ? "bg-emerald-500/5" : ""}`}>
                      <td className="px-3 py-2 font-medium text-white">{label}</td>
                      <Cell v={m.spearman_points} b={best(r, (x) => x.spearman_points)} />
                      <Cell v={m.spearman_vorp} b={best(r, (x) => x.spearman_vorp)} />
                      <Cell v={m.mae_points} b={best(r, (x) => x.mae_points, true)} d={1} />
                      {(["QB", "RB", "WR", "TE"] as const).map((p) => (
                        <Cell key={p} v={m.top_n_hit_rate[p] ?? null} b={best(r, (x) => x.top_n_hit_rate[p] ?? null)} />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {r.rookies && r.metrics_with_rookies && (
            <div className="mt-3 rounded-xl bg-slate-900/60 p-3 text-xs text-slate-400 ring-1 ring-slate-800">
              <span className="font-semibold text-slate-200">Rookies ({r.rookies.n}):</span> rank correlation — model{" "}
              <b className="text-slate-200">{r.rookies.model?.toFixed(2)}</b> (draft-slot history only), ESPN projections{" "}
              <b className="text-slate-200">{r.rookies.espn?.toFixed(2)}</b>, ESPN rankings <b className="text-slate-200">{r.rookies.espn_rank?.toFixed(2)}</b>.
              {" "}Whole pool including rookies: model {r.metrics_with_rookies.model.spearman_points.toFixed(2)}, ESPN{" "}
              {r.metrics_with_rookies.espn.spearman_points.toFixed(2)}, ESPN rankings {r.metrics_with_rookies.espn_rank.spearman_points.toFixed(2)}.
            </div>
          )}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {([["Beat their projection", r.misses.beat_projection], ["Fell short of their projection", r.misses.missed_projection]] as const).map(([t, rows]) => (
              <div key={t} className="rounded-xl bg-slate-900/60 p-3 text-xs ring-1 ring-slate-800">
                <div className="mb-1 font-semibold text-slate-300">{t}</div>
                {rows.slice(0, 5).map((x) => (
                  <div key={x.name} className="flex gap-2 py-0.5 text-slate-400">
                    <span className="flex-1 text-slate-200">{x.name} <span className="text-slate-500">{x.position}</span></span>
                    <span className="tabular-nums">proj {Math.round(x.model_points)} → actual {Math.round(x.actual_points)} ({x.actual_games} G)</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="mt-8 text-xs text-slate-500">Top-N columns: share of each method&apos;s top-N at the position who actually finished top-N. Backtest generated {new Date(bt.generatedAt).toLocaleDateString()}.</p>
    </main>
    </>
  );
}
