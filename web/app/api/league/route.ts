import type { NextRequest } from "next/server";
import { ImportError, importLeague } from "@/lib/leagueImport";

// GET /api/league?provider=sleeper|espn&id=<league id>&season=<year>
// Proxies the platform's public API server-side (ESPN blocks browser requests from other sites).
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const provider = (q.get("provider") ?? "").toLowerCase();
  const id = (q.get("id") ?? "").trim();
  const season = Number(q.get("season")) || new Date().getFullYear();
  try {
    const league = await importLeague(provider, id, season);
    return Response.json(league, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    const status = e instanceof ImportError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Import failed";
    return Response.json({ error: message }, { status });
  }
}
