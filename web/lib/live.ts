"use client";
/**
 * This week's live fantasy points: /api/live returns each player's box score so far and every game's status;
 * points are scored here with the league's own rules (so a full-PPR ESPN league sees ESPN's number).
 */
import { useEffect, useState } from "react";
import { pointsPerGame } from "./engine";
import type { LeagueConfig, RankedPlayer, StatLine } from "./types";
import { STAT_KEYS } from "./types";

/** Response of GET /api/live */
export interface LiveData {
  season: number;
  week: number;
  generatedAt?: string;
  /** keyed by team abbreviation (board style): game state, ESPN's short status ("7:20 - 4th", "Final") and kickoff */
  games: Record<string, { state: "pre" | "in" | "post"; detail: string; kickoff: number }>;
  /** keyed by ESPN player id: this week's stats so far, in STAT_KEYS order */
  players: Record<string, number[]>;
}

export interface LivePlayer {
  /** points so far this week (null before kickoff or if he has no stats) */
  pts: number | null;
  state: "pre" | "in" | "post" | "bye";
  /** short label: "7:20 - 4th", "Final", "Sun 1:00 PM", "Bye" */
  label: string;
}

const kickoffLabel = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

export function livePoints(p: RankedPlayer, live: LiveData, cfg: LeagueConfig): LivePlayer {
  const g = live.games[p.team];
  if (!g) return { pts: null, state: "bye", label: "Bye" };
  const raw = p.espnId != null ? live.players[String(p.espnId)] : undefined;
  const pts = raw && g.state !== "pre"
    ? Math.round(pointsPerGame(Object.fromEntries(STAT_KEYS.map((k, i) => [k, raw[i] ?? 0])) as StatLine, p.pos, cfg.scoring) * 10) / 10
    : g.state === "pre" ? null : 0;
  const label = g.state === "pre" ? kickoffLabel(g.kickoff) : g.state === "post" ? "Final" : g.detail;
  return { pts, state: g.state, label };
}

/**
 * Fetch live scores and keep them fresh: every minute while any game is on (or about to start), every
 * 15 minutes otherwise, and right away when you come back to the tab. Pauses while the tab is hidden.
 */
export function useLiveWeek(enabled = true): LiveData | null {
  const [data, setData] = useState<LiveData | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last: LiveData | null = null;
    const busy = (d: LiveData | null) =>
      !!d && Object.values(d.games).some((g) => g.state === "in" || (g.state === "pre" && g.kickoff - Date.now() < 15 * 60_000));
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, busy(last) ? 60_000 : 15 * 60_000);
    };
    const load = async () => {
      if (stop || document.visibilityState !== "visible") { schedule(); return; }
      try {
        const r = await fetch("/api/live");
        if (r.ok) { last = (await r.json()) as LiveData; if (!stop) setData(last); }
      } catch { /* keep the last good data */ }
      schedule();
    };
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => { stop = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [enabled]);
  return data;
}
