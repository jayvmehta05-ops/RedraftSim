import App from "@/components/App";
import boardJson from "@/data/board.json";
import trendsJson from "@/data/trends.json";
import configJson from "@/data/league_settings.json";
import type { BoardData, LeagueConfig, TrendData } from "@/lib/types";

// Data files are written by scripts/project_2027.py and committed by the weekly GitHub Action,
// so every Vercel deploy is a fully static page with the latest projections baked in.
export default function Page() {
  return (
    <App
      data={boardJson as unknown as BoardData}
      trends={trendsJson as unknown as TrendData}
      config={configJson as unknown as LeagueConfig}
    />
  );
}
