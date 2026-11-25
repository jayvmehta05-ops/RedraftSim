/**
 * Re-import a league's latest rosters/records from its platform, from the user's own browser.
 * ESPN private leagues use the cookies remembered on this device (never stored on our server).
 */
import type { ImportedLeague } from "./types";

export const ESPN_AUTH_KEY = "redraft27.espnAuth";
export const AUTO_REFRESH_MS = 12 * 60 * 60 * 1000;

export interface EspnAuth {
  espnS2: string;
  swid: string;
}

export function savedEspnAuth(): EspnAuth | null {
  try {
    const a = JSON.parse(localStorage.getItem(ESPN_AUTH_KEY) ?? "null");
    return a?.espnS2 && a?.swid ? a : null;
  } catch {
    return null;
  }
}

export function rememberEspnAuth(a: EspnAuth | null) {
  try {
    if (a) localStorage.setItem(ESPN_AUTH_KEY, JSON.stringify(a));
    else localStorage.removeItem(ESPN_AUTH_KEY);
  } catch {
    /* storage unavailable */
  }
}

export interface RefreshResult {
  league?: ImportedLeague;
  error?: string;
  /** ESPN needs (fresh) login cookies for this private league */
  needsLogin?: boolean;
}

export async function fetchLatest(league: ImportedLeague, auth?: EspnAuth | null): Promise<RefreshResult> {
  if (league.provider === "manual") return { error: "Hand-made leagues have nothing to refresh." };
  const creds = league.provider === "espn" ? auth ?? savedEspnAuth() : null;
  try {
    const r = await fetch("/api/league", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: league.provider, id: league.leagueId, season: Number(league.season), ...(creds ?? {}) }),
    });
    const body = await r.json();
    if (r.ok) return { league: body as ImportedLeague };
    return { error: body.error ?? `Refresh failed (${r.status})`, needsLogin: league.provider === "espn" && (r.status === 401 || r.status === 403) };
  } catch {
    return { error: "Couldn't reach the server. Check your connection and try again." };
  }
}

export function isStale(league: ImportedLeague | null, now: number): boolean {
  if (!league || league.provider === "manual") return false;
  const t = league.fetchedAt ? Date.parse(league.fetchedAt) : 0;
  return !t || now - t > AUTO_REFRESH_MS;
}
