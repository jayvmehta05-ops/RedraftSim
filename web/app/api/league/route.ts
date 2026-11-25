import type { NextRequest } from "next/server";
import { ImportError, importLeague } from "@/lib/leagueImport";

// Proxies the platform's API server-side (ESPN blocks browser requests from other sites).
//   GET  /api/league?provider=sleeper|espn&id=<league id>&season=<year>     public leagues
//   POST /api/league {provider, id, season, espnS2?, swid?}                 private ESPN leagues
// ESPN cookies only ever travel in the POST body, are forwarded to ESPN for this one request,
// and are never stored or logged.

async function run(provider: string, id: string, season: number, auth?: { espnS2: string; swid: string }) {
  try {
    const league = await importLeague(provider.toLowerCase(), id.trim(), season || new Date().getFullYear(), auth);
    return Response.json(league, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const status = e instanceof ImportError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Import failed";
    return Response.json({ error: message }, { status });
  }
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  return run(q.get("provider") ?? "", q.get("id") ?? "", Number(q.get("season")));
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const espnS2 = str(body.espnS2, 2000);
  const swid = str(body.swid, 64);
  return run(str(body.provider, 20), str(body.id, 40), Number(body.season),
    espnS2 && swid ? { espnS2, swid } : undefined);
}
