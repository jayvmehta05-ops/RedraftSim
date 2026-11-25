import type { Pos } from "@/lib/types";

export const POS_STYLE: Record<Pos, string> = {
  QB: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  RB: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  WR: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  TE: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
};
export const POS_CELL: Record<Pos, string> = {
  QB: "bg-rose-500/20 border-rose-500/40",
  RB: "bg-emerald-500/20 border-emerald-500/40",
  WR: "bg-sky-500/20 border-sky-500/40",
  TE: "bg-amber-500/20 border-amber-500/40",
};

export function PosBadge({ pos, rank }: { pos: Pos; rank?: number }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${POS_STYLE[pos]}`}>
      {pos}
      {rank != null && <span className="ml-0.5 opacity-80">{rank}</span>}
    </span>
  );
}

const TIER_COLORS = [
  "bg-fuchsia-500/20 text-fuchsia-200",
  "bg-violet-500/20 text-violet-200",
  "bg-indigo-500/20 text-indigo-200",
  "bg-blue-500/20 text-blue-200",
  "bg-cyan-500/20 text-cyan-200",
  "bg-teal-500/20 text-teal-200",
];
export function TierBadge({ tier }: { tier: number }) {
  const c = TIER_COLORS[Math.min(tier - 1, TIER_COLORS.length - 1)] ?? "bg-slate-700 text-slate-300";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tier > 6 ? "bg-slate-700/60 text-slate-300" : c}`}>T{tier}</span>;
}

export function Delta({ value, suffix }: { value: number | null | undefined; suffix?: string }) {
  if (value == null) return <span className="text-slate-600">—</span>;
  if (value === 0) return <span className="text-slate-500">0</span>;
  const up = value > 0;
  return (
    <span className={`tabular-nums font-medium ${up ? "text-emerald-400" : "text-rose-400"}`}>
      {up ? "▲" : "▼"}
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

const FLAG_INFO: Record<string, { label: string; cls: string; title: string }> = {
  rookie: { label: "R27", cls: "bg-violet-500/20 text-violet-300", title: "2027 incoming rookie" },
  ascending: { label: "▲Yr", cls: "bg-emerald-500/15 text-emerald-300", title: "Year 2/3 ascension bump" },
  age_decline: { label: "Age", cls: "bg-orange-500/15 text-orange-300", title: "Age-curve penalty" },
  injury_recovery: { label: "INJ", cls: "bg-red-500/20 text-red-300", title: "Injury recovery flag" },
  free_agent: { label: "FA", cls: "bg-slate-600/40 text-slate-300", title: "Currently a free agent" },
  backup_qb: { label: "BU", cls: "bg-slate-600/40 text-slate-300", title: "Backup QB on depth chart" },
};
export function Flags({ flags, notes }: { flags: string[]; notes?: string[] }) {
  return (
    <span className="inline-flex gap-1">
      {flags.map((f) => {
        const info = FLAG_INFO[f];
        if (!info) return null;
        return (
          <span key={f} title={notes?.join("\n") || info.title} className={`rounded px-1 text-[10px] font-semibold ${info.cls}`}>
            {info.label}
          </span>
        );
      })}
    </span>
  );
}

export function Sparkline({ values, width = 90, height = 24, invert = true }: { values: (number | null)[]; width?: number; height?: number; invert?: boolean }) {
  const pts = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null);
  if (pts.length < 2) return <span className="text-xs text-slate-600">—</span>;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const n = values.length - 1 || 1;
  const xy = pts.map((p) => {
    const x = (p.i / n) * (width - 4) + 2;
    const norm = (p.v - min) / span;
    const y = invert ? norm * (height - 4) + 2 : (1 - norm) * (height - 4) + 2;
    return [x, y] as const;
  });
  const first = pts[0].v;
  const last = pts[pts.length - 1].v;
  const better = invert ? last < first : last > first;
  const color = last === first ? "#64748b" : better ? "#34d399" : "#fb7185";
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r={2} fill={color} />
    </svg>
  );
}

/**
 * nflverse headshots point at full-size NFL photos (~700 KB each). NFL's image CDN accepts resize
 * transforms in the URL, so request a small face-cropped thumbnail instead (~2 KB).
 */
export function thumb(url: string | null, size = 64): string | null {
  if (!url) return null;
  const t = `f_auto,q_auto,w_${size},h_${size},c_fill,g_face`;
  if (url.includes("/f_auto,q_auto/")) return url.replace("/f_auto,q_auto/", `/${t}/`);
  if (url.includes("static.www.nfl.com/image/upload/")) return url.replace("/image/upload/", `/image/upload/${t}/`);
  return url;
}

export function fmt(n: number | null | undefined, d = 1) {
  return n == null || Number.isNaN(n) ? "—" : n.toFixed(d);
}
export function pct(n: number | null | undefined) {
  return n == null ? "—" : `${(n * 100).toFixed(0)}%`;
}
