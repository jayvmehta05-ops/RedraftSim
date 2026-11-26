/**
 * 1-week trades ("loans"): a player you lent out still belongs to you for the rest of the season, and one you
 * borrowed goes back. The trade assistant values rosters as they'll be after loans end, while Start/Sit and the
 * live points use who's actually on each roster this week.
 *
 * Loans live on league.rules.loans (saved and synced with the league). After a roster refresh, a swap between
 * you and another team is noticed (league.rules.pendingTrades) so you can say whether it was a 1-week trade.
 */
import type { Valued } from "./trade";
import type { ImportedLeague, Loan, PendingTrade } from "./types";

/** Rosters as they'll be once every loan ends: each loaned player moves back to his owner. */
export function afterLoans<T extends { id: string; roster: Valued[] }>(teams: T[], loans: Loan[] | undefined): T[] {
  if (!loans?.length) return teams;
  const next = teams.map((t) => ({ ...t, roster: [...t.roster] }));
  const byId = new Map(next.map((t) => [t.id, t]));
  for (const l of loans) {
    const holder = byId.get(l.holder);
    const owner = byId.get(l.owner);
    if (!holder || !owner) continue;
    const i = holder.roster.findIndex((x) => x.p.id === l.playerId);
    if (i < 0) continue; // already back (or never arrived)
    const [x] = holder.roster.splice(i, 1);
    if (!owner.roster.some((y) => y.p.id === x.p.id)) owner.roster.push(x);
  }
  return next;
}

/** Who a player on `teamId` really belongs to, if he's on loan (for the "LOAN" tags on Rosters). */
export function loanOf(loans: Loan[] | undefined, playerId: string, teamId: string): Loan | null {
  return loans?.find((l) => l.playerId === playerId && l.holder === teamId) ?? null;
}

/**
 * A swap between you and one other team since the last refresh: players that left your roster for theirs and
 * players that arrived from theirs. Loans coming back (players returning to their owners) don't count.
 */
export function detectSwaps(prev: ImportedLeague | null, next: ImportedLeague, me: string | null, week: number): PendingTrade[] {
  const before = prev?.rosters?.find((r) => r.managerId === me);
  const after = next.rosters?.find((r) => r.managerId === me);
  if (!before || !after || before.idType !== after.idType) return [];
  const returning = new Set((prev?.rules?.loans ?? []).map((l) => l.pid).filter(Boolean) as string[]);
  const prevIds = new Set(before.playerIds);
  const nextIds = new Set(after.playerIds);
  const sent = before.playerIds.filter((id) => !nextIds.has(id) && !returning.has(id));
  const got = after.playerIds.filter((id) => !prevIds.has(id) && !returning.has(id));
  const holderNow = (id: string) => next.rosters?.find((r) => r.managerId !== me && r.playerIds.includes(id))?.managerId;
  const holderBefore = (id: string) => prev?.rosters?.find((r) => r.managerId !== me && r.playerIds.includes(id))?.managerId;
  const byPartner = new Map<string, PendingTrade>();
  for (const id of sent) {
    const t = holderNow(id);
    if (!t) continue; // dropped, not traded
    if (!byPartner.has(t)) byPartner.set(t, { partner: t, sent: [], got: [], week });
    byPartner.get(t)!.sent.push(id);
  }
  for (const id of got) {
    const t = holderBefore(id);
    if (!t) continue; // picked up off waivers
    if (!byPartner.has(t)) byPartner.set(t, { partner: t, sent: [], got: [], week });
    byPartner.get(t)!.got.push(id);
  }
  return [...byPartner.values()].filter((p) => p.sent.length && p.got.length);
}

/** Loans still in effect: the player is still on the borrower's roster (or, for hand-marked loans, the week isn't over). */
export function activeLoans(league: ImportedLeague, week: number): Loan[] {
  return (league.rules?.loans ?? []).filter((l) => {
    if (!l.pid) return week <= l.week + 1;
    return league.rosters?.find((r) => r.managerId === l.holder)?.playerIds.includes(l.pid) ?? false;
  });
}
