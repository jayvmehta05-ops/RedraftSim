import { ImageResponse } from "next/og";
import { decodeMock } from "@/lib/share";
import { TARGET } from "@/lib/season";

export const alt = `${TARGET} mock draft result`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const m = decodeMock((await params).code);
  const picks = m?.p.slice(0, 6) ?? [];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#020617", color: "white", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 420 }}>
          <div style={{ fontSize: 28, color: "#34d399", letterSpacing: 4 }}>{`${TARGET} MOCK DRAFT`}</div>
          <div style={{ fontSize: 220, fontWeight: 900, lineHeight: 1 }}>{m?.g ?? "?"}</div>
          <div style={{ fontSize: 34, color: "#94a3b8", marginTop: 16 }}>
            {m ? `Pick 1.${String(m.s).padStart(2, "0")} · #${m.r} of ${m.t}` : "Future Fantasy"}
          </div>
          {m?.lg && <div style={{ fontSize: 26, color: "#64748b", marginTop: 8 }}>{m.lg}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 14 }}>
          {picks.map(([name, pos, rp]) => (
            <div key={rp} style={{ display: "flex", fontSize: 38, alignItems: "center" }}>
              <div style={{ width: 120, color: "#64748b" }}>{rp}</div>
              <div style={{ flex: 1 }}>{name}</div>
              <div style={{ color: "#94a3b8", fontSize: 30 }}>{pos}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
