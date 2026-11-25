"use client";

import { useMemo } from "react";
import { boardMaps, resolveRoster, unmatchedCount } from "@/lib/rosters";
import { type Horizon, type Valued, playerValue } from "@/lib/trade";
import type { ImportedLeague, RankedPlayer } from "@/lib/types";

export interface LeagueTeam {
  id: string;
  name: string;
  roster: Valued[];
  unmatched: number;
  record?: { wins: number; losses: number; ties: number; pointsFor: number };
  faabLeft?: number;
}

/** Every team's roster valued for the chosen horizon, plus the free-agent pool (board players nobody rosters). */
export function useLeagueTeams(board: RankedPlayer[], league: ImportedLeague | null, horizon: Horizon, weeksLeft: number) {
  return useMemo(() => {
    const { byId, byEspn } = boardMaps(board);
    const names = new Map((league?.managers ?? []).map((m) => [m.id, m.name]));
    const value = (p: RankedPlayer): Valued => ({ p, v: playerValue(p, horizon, weeksLeft) });
    const teams: LeagueTeam[] = (league?.rosters ?? []).map((r) => {
      const players = resolveRoster(r, byId, byEspn);
      return {
        id: r.managerId, name: names.get(r.managerId) ?? `Team ${r.managerId}`, roster: players.map(value),
        unmatched: unmatchedCount(r, byId, byEspn), record: r.record, faabLeft: r.faabLeft,
      };
    });
    const rostered = new Set(teams.flatMap((t) => t.roster.map((x) => x.p.id)));
    // Incoming rookies aren't in the NFL yet, so they can't be on waivers
    const freeAgents = board.filter((p) => !p.rookie && !rostered.has(p.id)).map(value);
    return { teams, freeAgents };
  }, [board, league, horizon, weeksLeft]);
}
