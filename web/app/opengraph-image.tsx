import { ImageResponse } from "next/og";
import { TARGET } from "@/lib/season";

export const alt = "Redraft Sim: next season's fantasy football board, mock drafts and league tools";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default link preview for the homepage and any page without its own image. */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", background: "#020617", color: "white", padding: 80, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="96" height="96" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill="#10b981" />
            <path d="M9 7v9h14V7M16 16v10" stroke="#022c22" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div style={{ fontSize: 64, fontWeight: 800 }}>{`${TARGET} Redraft Sim`}</div>
        </div>
        <div style={{ fontSize: 40, color: "#cbd5e1", marginTop: 36, maxWidth: 980 }}>
          {"Next season's fantasy board, rebuilt every week. Mock drafts against your real leaguemates, trade and waiver help for your league."}
        </div>
        <div style={{ fontSize: 28, color: "#34d399", marginTop: 40 }}>{"redraftsim.vercel.app"}</div>
      </div>
    ),
    size,
  );
}
