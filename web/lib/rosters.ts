import type { ImportedLeague, RankedPlayer } from "./types";

type Roster = NonNullable<ImportedLeague["rosters"]>[number];

/** A team's roster on the board: imported players (Sleeper or ESPN ids) minus hand-removed, plus hand-added. */
export function resolveRoster(r: Roster, byId: Map<string, RankedPlayer>, byEspn: Map<string, RankedPlayer>): RankedPlayer[] {
  const removed = new Set(r.removedIds ?? []);
  const out: RankedPlayer[] = [];
  const seen = new Set<string>();
  for (const id of r.playerIds) {
    const p = r.idType === "espn" ? byEspn.get(id) : byId.get(id);
    if (p && !removed.has(p.id) && !seen.has(p.id)) { out.push(p); seen.add(p.id); }
  }
  for (const id of r.manualIds ?? []) {
    const p = byId.get(id);
    if (p && !seen.has(p.id)) { out.push(p); seen.add(p.id); }
  }
  return out;
}

/** Imported players that don't match anything on the board (kickers, defenses, deep reserves). */
export function unmatchedCount(r: Roster, byId: Map<string, RankedPlayer>, byEspn: Map<string, RankedPlayer>): number {
  return r.playerIds.filter((id) => !(r.idType === "espn" ? byEspn.get(id) : byId.get(id))).length;
}

/** Carry hand edits (added / removed players) over when a league is re-imported. */
export function keepRosterEdits(prev: ImportedLeague | null, next: ImportedLeague): ImportedLeague {
  if (!prev?.rosters || !next.rosters) return next;
  const edits = new Map(prev.rosters.map((r) => [r.managerId, r]));
  return {
    ...next,
    rosters: next.rosters.map((r) => {
      const e = edits.get(r.managerId);
      return e ? { ...r, manualIds: e.manualIds, removedIds: e.removedIds } : r;
    }),
  };
}

export function boardMaps(board: RankedPlayer[]) {
  return {
    byId: new Map(board.map((p) => [p.id, p])),
    byEspn: new Map(board.filter((p) => p.espnId).map((p) => [String(p.espnId), p])),
  };
}
