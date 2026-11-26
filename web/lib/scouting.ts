/**
 * Leaguemate scouting reports: how each manager drafts, works the waiver wire, trades and manages a
 * lineup, and what that means for you (who to pitch a trade to, when, and with what).
 *
 * Everything here comes from the imported league: past drafts, this season's transactions (Sleeper) or
 * transaction totals (ESPN), weekly results, current rosters and lineups. Nothing is guessed: a section is
 * left out when the platform didn't provide the data behind it.
 */
import type { LeaguemateProfile } from "./leaguemates";
import { luckTable } from "./luck";
import { lineupValue, positionStrength, type Valued } from "./trade";
import type { ImportedLeague, LeagueConfig, Pos, RankedPlayer } from "./types";
import { POSITIONS } from "./types";

export interface ScoutTeam {
  id: string;
  name: string;
  roster: Valued[];
  record?: { wins: number; losses: number; ties: number; pointsFor: number };
}

export type Tone = "good" | "bad" | "neutral";
export interface Trait { label: string; detail: string; tone: Tone }

export interface ScoutReport {
  id: string;
  name: string;
  isMe: boolean;
  archetype: { label: string; emoji: string; blurb: string };
  record?: ScoutTeam["record"];
  recordRank: number | null;
  powerRank: number | null;
  pfRank: number | null;
  luck: number | null;
  /** most recent results first, e.g. ["L", "L", "W"] */
  recent: ("W" | "L" | "T")[];
  streak: { kind: "W" | "L"; n: number } | null;
  /** rank by starting-lineup strength at each position, 1 = best in the league */
  posRank: Record<Pos, number> | null;
  draft: {
    drafts: number;
    picks: number;
    firstQb: number | null;
    firstTe: number | null;
    leagueFirstQb: number | null;
    leagueFirstTe: number | null;
    /** share of their round 1-3 picks that were RBs, and the league's */
    earlyRb: number;
    leagueEarlyRb: number;
    earlyWr: number;
    leagueEarlyWr: number;
  } | null;
  activity: {
    adds: number;
    trades: number;
    faabSpent: number | null;
    addsRank: number;
    tradesRank: number;
    teams: number;
    leagueAvgAdds: number;
    topPartner: { name: string; n: number } | null;
    maxBid: number | null;
    /** average adds in the week after a loss vs after a win (Sleeper only, needs a few of each) */
    afterLoss: number | null;
    afterWin: number | null;
  } | null;
  /** current starters who are on bye or ruled out, and starting spots left empty */
  lineup: { dead: { p: RankedPlayer; why: string }[]; empty: number } | null;
  traits: Trait[];
  playbook: string[];
}

/** Live status for this week's lineup check: why a player can't score (bye / OUT / IR), or null if he can. */
export type DeadCheck = (p: RankedPlayer) => string | null;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Rank values high-to-low (1 = highest), ties share a rank. */
function rankOf(values: Map<string, number>, id: string): number {
  const v = values.get(id) ?? 0;
  return 1 + [...values.values()].filter((x) => x > v).length;
}

function results(league: ImportedLeague): Map<string, ("W" | "L" | "T")[]> {
  const rosters = league.rosters ?? [];
  const byId = new Map(rosters.map((r) => [r.managerId, r]));
  const out = new Map<string, ("W" | "L" | "T")[]>();
  for (const r of rosters) {
    const res: ("W" | "L" | "T")[] = [];
    (r.weekly ?? []).forEach((pts, w) => {
      const opp = r.opponents?.[w];
      const theirs = opp ? byId.get(opp)?.weekly?.[w] : undefined;
      if (theirs == null || pts == null) return;
      res[w] = pts > theirs ? "W" : pts < theirs ? "L" : "T";
    });
    out.set(r.managerId, res);
  }
  return out;
}

function draftStats(league: ImportedLeague) {
  type Row = { firstQb: number[]; firstTe: number[]; early: number; earlyRb: number; earlyWr: number; picks: number; drafts: number };
  const by = new Map<string, Row>();
  const get = (id: string) => {
    if (!by.has(id)) by.set(id, { firstQb: [], firstTe: [], early: 0, earlyRb: 0, earlyWr: 0, picks: 0, drafts: 0 });
    return by.get(id)!;
  };
  for (const d of league.drafts) {
    const seen = new Map<string, { qb: number | null; te: number | null }>();
    for (const p of d.picks) {
      const row = get(p.managerId);
      row.picks += 1;
      const s = seen.get(p.managerId) ?? { qb: null, te: null };
      if (p.pos === "QB" && s.qb == null) s.qb = p.round;
      if (p.pos === "TE" && s.te == null) s.te = p.round;
      seen.set(p.managerId, s);
      if (p.round <= 3) {
        row.early += 1;
        if (p.pos === "RB") row.earlyRb += 1;
        if (p.pos === "WR") row.earlyWr += 1;
      }
    }
    for (const [id, s] of seen) {
      const row = get(id);
      row.drafts += 1;
      if (s.qb != null) row.firstQb.push(s.qb);
      if (s.te != null) row.firstTe.push(s.te);
    }
  }
  const all = [...by.values()];
  const league_ = {
    firstQb: all.some((r) => r.firstQb.length) ? avg(all.flatMap((r) => r.firstQb)) : null,
    firstTe: all.some((r) => r.firstTe.length) ? avg(all.flatMap((r) => r.firstTe)) : null,
    earlyRb: all.reduce((s, r) => s + r.earlyRb, 0) / Math.max(1, all.reduce((s, r) => s + r.early, 0)),
    earlyWr: all.reduce((s, r) => s + r.earlyWr, 0) / Math.max(1, all.reduce((s, r) => s + r.early, 0)),
  };
  return { by, league: league_ };
}

function starterSlots(cfg: LeagueConfig): number {
  const r = cfg.roster;
  return r.QB + r.RB + r.WR + r.TE + r.FLEX + (r.SUPERFLEX ?? 0) + (r.K ?? 0) + (r.DST ?? 0);
}

export function scoutLeague(args: {
  league: ImportedLeague;
  teams: ScoutTeam[];
  cfg: LeagueConfig;
  myId: string | null;
  leaguemates?: LeaguemateProfile[];
  /** board players by Sleeper id / ESPN id, to read current starters */
  byId: Map<string, RankedPlayer>;
  byEspn: Map<string, RankedPlayer>;
  dead?: DeadCheck;
}): ScoutReport[] {
  const { league, teams, cfg, myId, byId, byEspn, dead } = args;
  const names = new Map(league.managers.map((m) => [m.id, m.name]));
  const rosters = new Map((league.rosters ?? []).map((r) => [r.managerId, r]));
  const n = teams.length;

  // Standings, points and luck
  const luck = new Map(luckTable(league).map((r) => [r.id, r]));
  const winPct = (t: ScoutTeam) => (t.record ? (t.record.wins + t.record.ties / 2) / Math.max(1, t.record.wins + t.record.losses + t.record.ties) : 0);
  const played = teams.some((t) => t.record && t.record.wins + t.record.losses + t.record.ties > 0);
  const recordRank = new Map<string, number>();
  if (played) [...teams].sort((a, b) => winPct(b) - winPct(a) || (b.record?.pointsFor ?? 0) - (a.record?.pointsFor ?? 0)).forEach((t, i) => recordRank.set(t.id, i + 1));
  const pf = new Map(teams.map((t) => [t.id, t.record?.pointsFor ?? 0]));
  const res = results(league);

  // Roster strength
  const filled = teams.filter((t) => t.roster.length > 0);
  const total = new Map(filled.map((t) => [t.id, lineupValue(t.roster, cfg).total]));
  const strength = new Map(filled.map((t) => [t.id, positionStrength(t.roster, cfg)]));
  const posRank = (id: string): Record<Pos, number> | null => {
    if (!strength.has(id)) return null;
    return Object.fromEntries(POSITIONS.map((p) => [p, rankOf(new Map([...strength].map(([k, s]) => [k, s[p]])), id)])) as Record<Pos, number>;
  };

  // Drafts
  const ds = draftStats(league);

  // Activity
  const act = new Map((league.rosters ?? []).filter((r) => r.activity).map((r) => [r.managerId, r.activity!]));
  const adds = new Map([...act].map(([k, a]) => [k, a.adds]));
  const trades = new Map([...act].map(([k, a]) => [k, a.trades]));
  const avgAdds = avg([...adds.values()]);
  const maxTrades = Math.max(0, ...trades.values());
  const maxAdds = Math.max(0, ...adds.values());
  const txns = league.transactions ?? [];
  const leagueUsesFaab = txns.some((t) => (t.bid ?? 0) > 0) || [...act.values()].some((a) => (a.faabSpent ?? 0) > 0);

  const slots = starterSlots(cfg);

  const reports: ScoutReport[] = teams.map((t) => {
    const id = t.id;
    const isMe = id === myId;
    const recent = [...(res.get(id) ?? [])].filter(Boolean).reverse();
    let streak: ScoutReport["streak"] = null;
    if (recent.length && recent[0] !== "T") {
      let k = 0;
      while (k < recent.length && recent[k] === recent[0]) k++;
      streak = { kind: recent[0] as "W" | "L", n: k };
    }
    const lk = luck.get(id);

    // Draft DNA
    const d = ds.by.get(id);
    const draft: ScoutReport["draft"] = d && d.picks >= 8 ? {
      drafts: d.drafts, picks: d.picks,
      firstQb: d.firstQb.length ? avg(d.firstQb) : null, firstTe: d.firstTe.length ? avg(d.firstTe) : null,
      leagueFirstQb: ds.league.firstQb, leagueFirstTe: ds.league.firstTe,
      earlyRb: d.early ? d.earlyRb / d.early : 0, leagueEarlyRb: ds.league.earlyRb,
      earlyWr: d.early ? d.earlyWr / d.early : 0, leagueEarlyWr: ds.league.earlyWr,
    } : null;

    // Activity
    const a = act.get(id);
    let activity: ScoutReport["activity"] = null;
    if (a) {
      const partners = new Map<string, number>();
      const bids: number[] = [];
      const addsByWeek = new Map<number, number>();
      for (const x of txns) {
        if (!x.managerIds.includes(id)) continue;
        if (x.kind === "trade") for (const o of x.managerIds) if (o !== id) partners.set(o, (partners.get(o) ?? 0) + 1);
        if (x.kind !== "trade") {
          addsByWeek.set(x.week, (addsByWeek.get(x.week) ?? 0) + x.adds);
          if ((x.bid ?? 0) > 0) bids.push(x.bid!);
        }
      }
      const top = [...partners].sort((p, q) => q[1] - p[1])[0];
      // Reaction to results: adds in week w+2 (transactions are logged to the week they apply to) after week w+1's result
      let afterLoss: number | null = null, afterWin: number | null = null;
      const r = res.get(id) ?? [];
      if (txns.length) {
        const L: number[] = [], W: number[] = [];
        r.forEach((x, w) => {
          if (!x || x === "T" || w + 2 > 18) return;
          (x === "L" ? L : W).push(addsByWeek.get(w + 2) ?? 0);
        });
        if (L.length >= 2 && W.length >= 2) { afterLoss = avg(L); afterWin = avg(W); }
      }
      activity = {
        adds: a.adds, trades: a.trades, faabSpent: leagueUsesFaab ? a.faabSpent ?? null : null,
        addsRank: rankOf(adds, id), tradesRank: rankOf(trades, id), teams: act.size, leagueAvgAdds: avgAdds,
        topPartner: top ? { name: names.get(top[0]) ?? "another team", n: top[1] } : null,
        maxBid: bids.length ? Math.max(...bids) : null, afterLoss, afterWin,
      };
    }

    // Lineup check (current starters)
    const ro = rosters.get(id);
    let lineup: ScoutReport["lineup"] = null;
    if (ro?.starters && (ro.starters.length || ro.playerIds.length)) {
      const deadOnes: { p: RankedPlayer; why: string }[] = [];
      if (dead) {
        for (const sid of ro.starters) {
          const p = ro.idType === "espn" ? byEspn.get(sid) : byId.get(sid);
          const why = p ? dead(p) : null;
          if (p && why) deadOnes.push({ p, why });
        }
      }
      lineup = { dead: deadOnes, empty: Math.max(0, slots - ro.starters.length) };
    }

    // ---------------------------------------------------------------- traits
    const traits: Trait[] = [];
    const pr = posRank(id);
    if (pr) {
      const best = POSITIONS.filter((p) => cfg.roster[p] > 0).sort((p, q) => pr[p] - pr[q])[0];
      const worst = POSITIONS.filter((p) => cfg.roster[p] > 0).sort((p, q) => pr[q] - pr[p])[0];
      if (best && pr[best] <= Math.max(1, Math.ceil(n / 4))) traits.push({ label: `Loaded at ${best}`, detail: pr[best] === 1 ? `Best ${best} group in the league` : `${ord(pr[best])}-best ${best} group in the league`, tone: "good" });
      if (worst && pr[worst] >= n - Math.floor(n / 4)) traits.push({ label: `Thin at ${worst}`, detail: `${ord(pr[worst])} of ${n} at ${worst}`, tone: "bad" });
    }
    if (activity) {
      if (activity.adds >= 6 && activity.addsRank === 1) traits.push({ label: "Waiver hawk", detail: `Most pickups in the league (${activity.adds})`, tone: "neutral" });
      else if (activity.teams >= 4 && activity.adds <= avgAdds * 0.4) traits.push({ label: "Set-and-forget", detail: `Only ${plural(activity.adds, "pickup")} all season (league avg ${avgAdds.toFixed(0)})`, tone: "neutral" });
      // "Hasn't traded" only means something in a league where others do trade
      if (activity.trades === 0 && maxTrades >= 3) traits.push({ label: "Hasn't traded", detail: "No trades this season", tone: "neutral" });
      else if (activity.trades >= 2 && activity.trades === maxTrades) traits.push({ label: "Trader", detail: `Most trades in the league (${activity.trades})`, tone: "neutral" });
      if (activity.afterLoss != null && activity.afterWin != null && activity.afterLoss >= activity.afterWin * 1.5 + 0.5)
        traits.push({ label: "Reacts to losses", detail: `${activity.afterLoss.toFixed(1)} pickups after a loss vs ${activity.afterWin.toFixed(1)} after a win`, tone: "neutral" });
      if (activity.maxBid != null && activity.maxBid >= 30) traits.push({ label: "Big FAAB bidder", detail: `Top winning bid: $${activity.maxBid}`, tone: "neutral" });
    }
    if (lineup && (lineup.dead.length || lineup.empty)) {
      const bits = [lineup.dead.length ? `starting ${lineup.dead.map((x) => `${x.p.name} (${x.why})`).join(", ")}` : "", lineup.empty ? `${plural(lineup.empty, "empty starting spot")}` : ""].filter(Boolean);
      traits.push({ label: "Lineup asleep", detail: `Right now: ${bits.join("; ")}`, tone: "bad" });
    }
    if (lk && lk.weeks >= 3) {
      if (lk.luck >= 1.5) traits.push({ label: "Lucky", detail: `About ${lk.luck.toFixed(1)} more wins than their scores earned`, tone: "neutral" });
      if (lk.luck <= -1.5) traits.push({ label: "Unlucky", detail: `About ${(-lk.luck).toFixed(1)} fewer wins than their scores earned`, tone: "neutral" });
    }
    if (streak && streak.n >= 3) traits.push({ label: `${streak.n}-game ${streak.kind === "W" ? "win" : "losing"} streak`, detail: streak.kind === "W" ? "Rolling" : "Under pressure", tone: streak.kind === "W" ? "good" : "bad" });
    if (draft) {
      if (draft.firstQb != null && draft.leagueFirstQb != null && draft.firstQb <= draft.leagueFirstQb - 2) traits.push({ label: "Drafts QB early", detail: `First QB around round ${draft.firstQb.toFixed(0)} (league: ${draft.leagueFirstQb.toFixed(0)})`, tone: "neutral" });
      if (draft.firstQb != null && draft.leagueFirstQb != null && draft.firstQb >= draft.leagueFirstQb + 2) traits.push({ label: "Waits on QB", detail: `First QB around round ${draft.firstQb.toFixed(0)} (league: ${draft.leagueFirstQb.toFixed(0)})`, tone: "neutral" });
      if (draft.firstTe != null && draft.leagueFirstTe != null && draft.firstTe <= draft.leagueFirstTe - 2) traits.push({ label: "Pays up for TE", detail: `First TE around round ${draft.firstTe.toFixed(0)} (league: ${draft.leagueFirstTe.toFixed(0)})`, tone: "neutral" });
      if (draft.earlyRb >= draft.leagueEarlyRb + 0.2) traits.push({ label: "RB-first drafter", detail: `${Math.round(draft.earlyRb * 100)}% of rounds 1-3 on RBs (league ${Math.round(draft.leagueEarlyRb * 100)}%)`, tone: "neutral" });
      if (draft.earlyWr >= draft.leagueEarlyWr + 0.2) traits.push({ label: "WR-first drafter", detail: `${Math.round(draft.earlyWr * 100)}% of rounds 1-3 on WRs (league ${Math.round(draft.leagueEarlyWr * 100)}%)`, tone: "neutral" });
    }

    // ---------------------------------------------------------------- archetype
    const power = total.has(id) ? rankOf(total, id) : null;
    const archetype = (() => {
      const deadSpots = lineup ? lineup.dead.length + lineup.empty : 0;
      if (deadSpots >= 1 && (!activity || activity.adds <= avgAdds * 0.6))
        return { label: "The Ghost", emoji: "👻", blurb: "Not paying attention. Their lineup and roster won't react to news, so you can beat them to waiver pickups and handcuffs." };
      if (activity && activity.trades >= 2 && activity.trades === maxTrades)
        return { label: "The Dealer", emoji: "🤝", blurb: "Always open for business. The easiest manager in the league to get a trade done with, so make sure you win it." };
      if (activity && activity.adds >= 6 && activity.adds === maxAdds && activity.adds >= avgAdds * 1.4)
        return { label: "The Tinkerer", emoji: "🔧", blurb: "Lives on the waiver wire and churns the bench. Expect them to grab every breakout first." };
      if (lk && lk.weeks >= 3 && lk.luck >= 1.5)
        return { label: "The Lucky One", emoji: "🍀", blurb: "Their record is better than their scores. Regression is coming, and they may not see it." };
      if (lk && lk.weeks >= 3 && lk.luck <= -1.5)
        return { label: "The Snakebit", emoji: "🐍", blurb: "Scoring well but losing anyway. A frustrated manager is often ready to shake up the roster." };
      if (power != null && power <= Math.max(1, Math.round(n / 6)))
        return { label: "The Juggernaut", emoji: "💪", blurb: "One of the best rosters on paper. Don't help them by trading them the piece they're missing." };
      if (activity && activity.trades === 0 && activity.adds <= avgAdds * 0.6)
        return { label: "The Statue", emoji: "🗿", blurb: "Rarely changes anything. Trades are a long shot, so don't spend your energy here." };
      if (power != null && power >= n - Math.round(n / 6))
        return { label: "The Rebuilder", emoji: "🧱", blurb: "Bottom of the league on paper. They need help everywhere and may sell their stars for depth." };
      return { label: "The Steady Hand", emoji: "🧘", blurb: "Balanced and hard to read. Win trades with them on value, not on their mistakes." };
    })();

    // ---------------------------------------------------------------- playbook (what to do about them)
    const playbook: string[] = [];
    if (!isMe) {
      const mineRank = myId ? posRank(myId) : null;
      const myTeam = teams.find((x) => x.id === myId);
      if (pr && mineRank && myTeam && strength.has(id)) {
        // They're thin where you're deep: sell to them
        const sell = POSITIONS.filter((p) => cfg.roster[p] > 0 && pr[p] >= Math.ceil(n * 0.6) && mineRank[p] <= Math.floor(n * 0.4)).sort((p, q) => pr[q] - pr[p])[0];
        if (sell) playbook.push(`Pitch them ${sell === "RB" ? "an" : "a"} ${sell}. They're ${ord(pr[sell])} of ${n} at ${sell} and you're ${ord(mineRank[sell])}, so your depth there is worth more to them than to you.`);
        // They're deep where you're thin: name the bench player who'd start for you
        const before = lineupValue(myTeam.roster, cfg);
        const theirStarters = new Set(lineupValue(t.roster, cfg).starters.map((x) => x.p.id));
        const target = t.roster
          .filter((x) => !theirStarters.has(x.p.id) && mineRank[x.p.pos] >= Math.ceil(n / 2))
          .map((x) => ({ x, gain: lineupValue([...myTeam.roster, x], cfg).total - before.total }))
          .filter((y) => y.gain > 1)
          .sort((p, q) => q.gain - p.gain)[0];
        if (target) playbook.push(`Ask about ${target.x.p.name} (${target.x.p.pos}). He's on their bench but would start for you, so he costs them little to move.`);
      }
      const openness = args.leaguemates?.find((l) => l.managerId === id)?.tradeOpenness;
      if (activity) {
        if (activity.trades === 0 && maxTrades >= 2 && (openness ?? 0) <= 0) playbook.push("They haven't made a trade all season. Send one clean, clearly fair offer rather than a string of lowballs.");
        if (activity.trades >= 2 && activity.trades === maxTrades) playbook.push(`They trade more than anyone${activity.topPartner ? ` (most often with ${activity.topPartner.name})` : ""}. Expect counteroffers and check every one with the trade checker.`);
        if (activity.afterLoss != null && activity.afterWin != null && activity.afterLoss >= activity.afterWin * 1.5 + 0.5) playbook.push("They shake up the roster after losses. Time your trade offer for right after they lose.");
        if (activity.maxBid != null && activity.maxBid >= 30) playbook.push(`They spend big on waivers (top winning bid $${activity.maxBid}). If you both need the week's top pickup, bid more than usual or target the second-best option.`);
        if (activity.adds <= avgAdds * 0.4 && activity.teams >= 4) playbook.push("They barely use the waiver wire, so you can wait a day on pickups at positions they need.");
      }
      if (lineup && (lineup.dead.length || lineup.empty)) playbook.push("Their lineup has dead spots right now. If you play them this week, that's free points for you.");
      if (streak && streak.kind === "L" && streak.n >= 3) playbook.push(`They've lost ${streak.n} straight. Losing managers are the most open to a shake-up trade: offer depth for one of their stars.`);
      if (lk && lk.weeks >= 3 && lk.luck >= 1.5) playbook.push("Their record is ahead of their scores. They may overvalue their team, so don't overpay to trade with them.");
      if (draft?.firstQb != null && draft.leagueFirstQb != null && draft.firstQb <= draft.leagueFirstQb - 2) playbook.push("In the draft, they grab a QB early. If you want one of the top QBs, you'll have to take him before their pick.");
      if (draft && draft.earlyRb >= draft.leagueEarlyRb + 0.2) playbook.push("In the draft, they load up on RBs early, which pushes good WRs down to you.");
    }

    return {
      id, name: t.name, isMe, archetype, record: t.record, recordRank: recordRank.get(id) ?? null, powerRank: power,
      pfRank: played ? rankOf(pf, id) : null, luck: lk && lk.weeks >= 1 ? lk.luck : null, recent: recent.slice(0, 5), streak,
      posRank: pr, draft, activity, lineup, traits: traits.slice(0, 6), playbook: playbook.slice(0, 4),
    };
  });
  return reports;
}
