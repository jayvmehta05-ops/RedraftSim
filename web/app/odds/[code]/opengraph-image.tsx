import { ImageResponse } from "next/og";
import { SITE_URL } from "@/lib/season";
import { decodeOdds, pctLabel } from "@/lib/share";

export const alt = "Fantasy playoff odds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const host = SITE_URL.replace(/^https?:\/\//, "");
const color = (x: number) => (x >= 750 ? "#6ee7b7" : x >= 400 ? "#fcd34d" : x >= 100 ? "#fdba74" : "#fda4af");

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const o = decodeOdds((await params).code);
  const rows = o?.t ?? [];
  const me = o?.me ? rows.find((r) => r[0] === o.me) : null;
  const head = me ? `${me[0]}: ${pctLabel(me[3])} playoff odds` : `${rows[0]?.[0] ?? "Your league"} leads the playoff race`;
  // Top of the race, plus the sharer's team if it's further down
  let shown = rows.slice(0, me && rows.indexOf(me) >= 5 ? 4 : 5);
  if (me && !shown.includes(me)) shown = [...shown, me];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "48px 56px", fontFamily: "sans-serif", color: "white", background: "radial-gradient(circle at 85% 0%, #064e3b 0%, #020617 55%)" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 22, letterSpacing: 4, color: "#34d399" }}>
          <div style={{ display: "flex", width: 34, height: 34, borderRadius: 8, background: "#10b981", marginRight: 14 }} />
          {`FUTURE FANTASY · PLAYOFF ODDS · ${o ? `WEEK ${o.wk}` : ""}`}
        </div>
        <div style={{ display: "flex", fontSize: 56, fontWeight: 800, marginTop: 22, lineHeight: 1.1 }}>{head}</div>
        <div style={{ display: "flex", fontSize: 26, color: "#94a3b8", marginTop: 8 }}>{`${o?.lg ?? ""} · top ${o?.p ?? 6} make the playoffs · 10,000 simulated finishes`}</div>
        <div style={{ display: "flex", marginTop: 26, gap: 28 }}>
          {o?.st ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 330 }}>
              <div style={{ display: "flex", flexDirection: "column", padding: "14px 20px", borderRadius: 16, background: "rgba(16,185,129,0.16)", border: "2px solid rgba(16,185,129,0.4)" }}>
                <div style={{ display: "flex", fontSize: 22, color: "#6ee7b7" }}>{`Beat ${o.st[0]}`}</div>
                <div style={{ display: "flex", fontSize: 54, fontWeight: 900 }}>{pctLabel(o.st[1])}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", padding: "14px 20px", borderRadius: 16, background: "rgba(244,63,94,0.14)", border: "2px solid rgba(244,63,94,0.4)" }}>
                <div style={{ display: "flex", fontSize: 22, color: "#fda4af" }}>{`Lose to ${o.st[0]}`}</div>
                <div style={{ display: "flex", fontSize: 54, fontWeight: 900 }}>{pctLabel(o.st[2])}</div>
              </div>
            </div>
          ) : <div style={{ display: "flex" }} />}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 8 }}>
            {shown.map((r) => (
              <div key={r[0]} style={{ display: "flex", alignItems: "center", fontSize: 27, padding: "6px 14px", borderRadius: 12, background: r[0] === o?.me ? "rgba(16,185,129,0.18)" : "rgba(15,23,42,0.7)" }}>
                <div style={{ display: "flex", flex: 1 }}>{r[0]}</div>
                <div style={{ display: "flex", width: 90, color: "#94a3b8" }}>{`${r[1]}-${r[2]}`}</div>
                <div style={{ display: "flex", width: 110, justifyContent: "flex-end", fontWeight: 900, color: color(r[3]) }}>{pctLabel(r[3])}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 24, color: "#64748b" }}>{`Get your league's odds at ${host}`}</div>
      </div>
    ),
    size,
  );
}
