import { ImageResponse } from "next/og";
import { SITE_URL } from "@/lib/season";
import { decodeLuck } from "@/lib/share";

export const alt = "Fantasy league luck meter";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const host = SITE_URL.replace(/^https?:\/\//, "");

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const l = decodeLuck((await params).code);
  const rows = l?.t ?? [];
  const me = l?.me ? rows.find((r) => r[0] === l.me) : null;
  const focus = me ?? [...rows].sort((a, b) => a[6] - b[6])[0];
  const x = focus ? focus[6] / 10 : 0;
  const head = !focus ? "Luck meter" : Math.abs(x) < 0.5 ? `${focus[0]}: right where they should be` : `${focus[0]} is ${Math.abs(x).toFixed(1)} wins ${x > 0 ? "lucky" : "unlucky"}`;
  const sub = focus ? `${focus[1]}-${focus[2]} record · ${focus[3]}-${focus[4]} all-play · scores earned ${(focus[5] / 10).toFixed(1)} wins` : "";
  // Show the extremes: the three luckiest and three unluckiest
  let shown = rows.length > 6 ? [...rows.slice(0, 3), ...rows.slice(-3)] : rows;
  // The sharer's team always makes the card
  if (me && !shown.includes(me)) {
    const i = rows.indexOf(me);
    shown = i < rows.length / 2 ? [...rows.slice(0, 2), me, ...rows.slice(-3)] : [...rows.slice(0, 3), me, ...rows.slice(-2)];
  }
  const max = Math.max(10, ...rows.map((r) => Math.abs(r[6])));

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "48px 56px", fontFamily: "sans-serif", color: "white", background: "radial-gradient(circle at 15% 0%, #064e3b 0%, #020617 55%)" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 22, letterSpacing: 4, color: "#34d399" }}>
          <div style={{ display: "flex", width: 34, height: 34, borderRadius: 8, background: "#10b981", marginRight: 14 }} />
          {`FUTURE FANTASY · LUCK METER · ${l ? `THROUGH ${l.wk} WEEKS` : ""}`}
        </div>
        <div style={{ display: "flex", fontSize: 54, fontWeight: 800, marginTop: 22, lineHeight: 1.1 }}>{head}</div>
        <div style={{ display: "flex", fontSize: 26, color: "#94a3b8", marginTop: 10 }}>{`${l?.lg ?? ""}${sub ? ` · ${sub}` : ""}`}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 28, gap: 10 }}>
          {shown.map((r) => {
            const luck = r[6];
            const w = Math.round((Math.abs(luck) / max) * 220);
            const mine = r[0] === l?.me;
            return (
              <div key={r[0]} style={{ display: "flex", alignItems: "center", fontSize: 28, padding: "6px 14px", borderRadius: 12, background: mine ? "rgba(16,185,129,0.18)" : "rgba(15,23,42,0.7)" }}>
                <div style={{ display: "flex", flex: 1 }}>{r[0]}</div>
                <div style={{ display: "flex", width: 130, color: "#94a3b8" }}>{`${r[1]}-${r[2]}`}</div>
                <div style={{ display: "flex", width: 460, height: 14, position: "relative", borderRadius: 7, background: "#1e293b" }}>
                  <div style={{ display: "flex", position: "absolute", left: 229, top: 0, width: 2, height: 14, background: "#475569" }} />
                  <div style={{ display: "flex", position: "absolute", top: 0, height: 14, borderRadius: 7, width: w, left: luck >= 0 ? 230 : 230 - w, background: luck >= 0 ? "#34d399" : "#fb7185" }} />
                </div>
                <div style={{ display: "flex", width: 110, justifyContent: "flex-end", fontWeight: 800, color: luck >= 5 ? "#6ee7b7" : luck <= -5 ? "#fda4af" : "#94a3b8" }}>{`${luck >= 0 ? "+" : "−"}${(Math.abs(luck) / 10).toFixed(1)}`}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 24, color: "#64748b" }}>{`Check your league's luck at ${host}`}</div>
      </div>
    ),
    size,
  );
}
