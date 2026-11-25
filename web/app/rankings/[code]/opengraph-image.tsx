import { ImageResponse } from "next/og";
import { decodePower } from "@/lib/share";

export const alt = "League power rankings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const p = decodePower((await params).code);
  const rows = p?.t.slice(0, 6) ?? [];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#020617", color: "white", padding: 56, fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 26, color: "#34d399", letterSpacing: 4 }}>{`POWER RANKINGS · ${(p?.h ?? "").toUpperCase()}`}</div>
        <div style={{ fontSize: 56, fontWeight: 800, marginTop: 8 }}>{p?.lg ?? "Redraft Sim"}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 28, gap: 10 }}>
          {rows.map(([name, rank, w, l, pts]) => (
            <div key={`${rank}`} style={{ display: "flex", alignItems: "center", fontSize: 34 }}>
              <div style={{ width: 70, fontWeight: 900 }}>{String(rank)}</div>
              <div style={{ flex: 1 }}>{String(name)}</div>
              <div style={{ color: "#94a3b8", width: 140 }}>{w || l ? `${w}-${l}` : " "}</div>
              <div style={{ color: "#cbd5e1" }}>{`${pts} pts`}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
