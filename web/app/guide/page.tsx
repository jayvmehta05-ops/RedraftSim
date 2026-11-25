import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, TARGET } from "@/lib/season";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = {
  title: `How it works — ${SITE_NAME}`,
  description: `What every tool on ${SITE_NAME} does and how to use it: the ${TARGET} big board, league import, mock drafts against your real leaguemates, live draft help, keepers and more.`,
};

const SECTIONS: { title: string; what: string; how: string[]; tip?: string }[] = [
  {
    title: `${TARGET} Big Board`,
    what: "A ranked top 250 for next season's redraft leagues, rebuilt every Tuesday from this season's games. Each player shows projected 2027 points per game, value over replacement (VORP), a tier, a projected draft position (ADP) and how far they moved this week.",
    how: [
      "Filter by position or rookies, search by name, team or college, and sort by any column.",
      "Click a player to see the projected stat line and why the model moved them (age, injury, second-year bump, ESPN's view).",
      "Tier breaks mark where value drops off: if your tier is about to run dry, that's the time to take the last player in it.",
    ],
    tip: "VORP is what drives draft order: points above the best player you could get late at the same position.",
  },
  {
    title: "League settings and import",
    what: "Rankings change with your league's rules. A 6-point passing TD, superflex or TE premium league values players very differently.",
    how: [
      "Open ⚙ Settings to flip FLEX count, superflex, PPR, passing TD points and TE premium; the whole site re-ranks instantly.",
      "Or import your league: paste a Sleeper league ID (any league), or an ESPN league ID. Public ESPN leagues need nothing else; private ones need two login cookies from your browser (instructions are in the import panel).",
      "Pick which team is yours so the mock draft knows who your opponents are.",
      "No Sleeper or ESPN league, or your ESPN league is private? Set your league up by hand: league name and team names.",
    ],
  },
  {
    title: "Describe your leaguemates (manual overrides)",
    what: "Anything the site learns automatically can be set by hand, and your edits always win: how each leaguemate drafts and trades, and every team's roster.",
    how: [
      "Open ⚙ Settings → Describe leaguemates & edit rosters (also linked from the Mock Draft and Trades tabs).",
      "Type a description like “takes a QB in the 2nd round, loves rookies, never trades” and press Apply. The site shows exactly what it understood.",
      "Or pick a style preset (Zero RB, Hero RB, early QB, elite TE, rookie lover, veterans only, reacher, ADP follower, run follower) and fine-tune the sliders: position leans, randomness, rookies vs veterans, run-following and trade openness.",
      "Add or remove players on any roster to fix import misses or build rosters for a hand-made league. Your roster edits survive a refresh.",
    ],
    tip: "Mock drafts get much more realistic when the two or three leaguemates you know best are described accurately.",
  },
  {
    title: "Mock Draft Room",
    what: "A full snake draft against 11 bots that draft like real people: they follow ADP and value, fill their lineup, react to positional runs, and each has a personality.",
    how: [
      "Choose your draft slot and bot speed, then start. When you're on the clock, the best options for your roster are marked SUGGESTED.",
      "With a league imported, choose 'My leaguemates': each bot copies a real manager's habits from your league's past drafts.",
      "At the end every team gets a grade from projected starter points. Tap 'Share result' for a link with a preview image for your group chat.",
    ],
    tip: "Run several mocks from the same slot: you'll learn which players are realistically there at each of your picks.",
  },
  {
    title: "Live Draft",
    what: "Help during your real draft. Picks disappear from the board as they happen and you get ranked suggestions for your next pick.",
    how: [
      "Paste your Sleeper draft ID (the number in the draft room URL) and choose your draft slot.",
      "Keep the tab open: it refreshes every 5 seconds. Suggestions explain themselves: falling past ADP, fills a starter, positional run.",
      "ESPN's draft room requires a login and isn't supported yet.",
    ],
  },
  {
    title: "Waivers and power rankings",
    what: "In-season help from your imported league's rosters: the best free agents for your lineup, and every team ranked by roster strength.",
    how: [
      "Open My League → Waivers. Free agents are ranked by how much each improves your best starting lineup, with who they'd start over, who to drop and a FAAB bid range.",
      "My League → Power rankings ranks every team by its projected starting lineup, next to its real record, so you can see who's better or worse than their record.",
      "Tap Share rankings for a link with a preview image to drop in your league chat.",
    ],
  },
  {
    title: "Trade assistant",
    what: "Finds trades that improve your starting lineup and that the other manager would plausibly accept, and grades any trade you're considering.",
    how: [
      "Import your league (Settings) and pick your team. The assistant loads every roster.",
      "Choose the time frame: rest of this season for in-season trades, next season for the offseason, or both for keeper leagues.",
      "Each suggestion shows how many points it adds to your best lineup, what it does to theirs, and a chance they say yes based on their lineup gain, how the names look by ADP, and what they've favored in past drafts.",
      "Use the analyzer to tick any players on either side and see the result instantly.",
    ],
    tip: "Win-win trades get accepted. The assistant only suggests trades that don't meaningfully hurt the other team.",
  },
  {
    title: "Keepers",
    what: "For keeper leagues: is a player worth the pick he costs you?",
    how: [
      "Set your draft slot and how many keepers you get, then add candidates and the round each would cost.",
      `Keeper value = the player's ${TARGET} VORP minus the value you'd expect to draft with that pick. The best positive values are marked KEEP.`,
    ],
  },
  {
    title: "Weekly Trends and risers",
    what: `Who's moving up or down for ${TARGET}, week by week.`,
    how: [
      "Use the Weekly Trends tab for 1-week, 3-week or season windows by position.",
      "The /risers page lists this week's biggest movers and is easy to share.",
    ],
  },
  {
    title: "Accuracy",
    what: "We test the projection model by projecting past seasons with only the data that existed then, and publish how it did against ESPN and a simple baseline.",
    how: ["Read the full results on the accuracy page, including the players the model missed most."],
  },
];

export default function GuidePage() {
  return (
    <>
    <PageHeader />
    <main className="mx-auto max-w-3xl px-4 py-8 text-slate-200">
      <h1 className="mt-3 text-2xl font-bold text-white">How it works</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        {SITE_NAME} projects next season for redraft fantasy football and gives you tools to plan your draft: a big board
        that updates every week, mock drafts against bots (or your actual leaguemates), live draft help and a keeper calculator.
        It&apos;s built for 12-team, 1QB, full-PPR leagues by default, and adapts to your league&apos;s settings.
      </p>
      {SECTIONS.map((s) => (
        <section key={s.title} className="mt-8">
          <h2 className="text-lg font-semibold text-white">{s.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">{s.what}</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            {s.how.map((h) => <li key={h}>• {h}</li>)}
          </ul>
          {s.tip && <p className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 ring-1 ring-emerald-500/20">Tip: {s.tip}</p>}
        </section>
      ))}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Where the data comes from</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">
          Weekly box scores from nflverse, player details and injuries from Sleeper, and ESPN&apos;s public fantasy data for
          draft position and rest-of-season projections. Rookies come from a hand-maintained prospect list with draft-capital tiers.
          Projections are estimates, not guarantees.
        </p>
      </section>
      <p className="mt-8 text-sm">
        Questions or ideas? Use the <b>Feedback</b> button on the main page. <Link href="/" className="text-emerald-400 hover:underline">Back to the board →</Link>
      </p>
    </main>
    </>
  );
}
