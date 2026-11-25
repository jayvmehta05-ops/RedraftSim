import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { SITE_NAME, TARGET } from "@/lib/season";

export const metadata: Metadata = {
  title: `About — ${SITE_NAME}`,
  description: `${SITE_NAME} projects next season for redraft fantasy football and helps you plan your draft, trades and keepers.`,
};

export default function AboutPage() {
  return (
    <LegalPage title={`About ${SITE_NAME}`}>
      <p>
        Most fantasy sites start caring about next season in August. {SITE_NAME} starts now: a {TARGET} redraft board rebuilt every week
        from this season&apos;s games, tuned to your league&apos;s exact rules, with tools to plan everything around it.
      </p>
      <h2>What makes it different</h2>
      <ul>
        <li><b>Your league, not a generic one:</b> import from Sleeper or ESPN (even private leagues) and everything re-ranks to your scoring, roster slots and team count.</li>
        <li><b>Your leaguemates as bots:</b> mock drafts learn how each real manager drafts, and you can describe them in plain words.</li>
        <li><b>Decisions, not just rankings:</b> availability odds at your next pick, a strategy lab for your draft slot, trade ideas the other side would accept, waiver pickups for your lineup and a keeper calculator.</li>
        <li><b>Honest about accuracy:</b> the model is tested on past seasons and the results are <Link href="/accuracy">published</Link>, good and bad.</li>
      </ul>
      <h2>Where the data comes from</h2>
      <p>
        Weekly stats from nflverse, player details and injuries from Sleeper, and ESPN&apos;s public fantasy data. Projections update every
        Tuesday during the season. Read <Link href="/guide">how it works</Link>.
      </p>
      <h2>Contact</h2>
      <p>Ideas, bugs or questions: use the Feedback button on the <Link href="/">main page</Link>. Every message is read.</p>
      <p className="text-xs text-slate-500">
        Not affiliated with or endorsed by the NFL, ESPN, Sleeper or Yahoo. <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
      </p>
    </LegalPage>
  );
}
