import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { EFFECTIVE_DATE } from "@/components/LegalPage";
import { SITE_NAME } from "@/lib/season";

export const metadata: Metadata = { title: `Terms of Use — ${SITE_NAME}`, description: `Terms for using ${SITE_NAME}.` };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>Effective {EFFECTIVE_DATE}. By using Future Fantasy you agree to these terms.</p>

      <h2>What this is</h2>
      <p>
        Future Fantasy is a fantasy football planning tool: projections, rankings, mock drafts, and trade, waiver and keeper helpers.
        It is for entertainment and planning in season-long fantasy leagues.
      </p>

      <h2>Projections are estimates</h2>
      <p>
        Projections, rankings, grades, trade and waiver suggestions are model estimates based on public data. They can be wrong, and
        there&apos;s no guarantee about any player&apos;s performance or any outcome in your league. See <Link href="/accuracy">how accurate they&apos;ve been</Link>.
        Nothing on this site is betting or gambling advice, and the site doesn&apos;t offer or promote wagering.
      </p>

      <h2>Not affiliated</h2>
      <p>
        Future Fantasy is independent and is not affiliated with, endorsed by or sponsored by the NFL, its teams or players, ESPN, Sleeper,
        Yahoo or any other platform. Names and trademarks belong to their owners and are used only to identify players, teams and services.
      </p>

      <h2>Your accounts on other platforms</h2>
      <p>
        When you import a private ESPN league you provide your own ESPN login cookies. Only do this on your own device and for leagues
        you&apos;re a member of. You&apos;re responsible for complying with the terms of the platforms you connect.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don&apos;t try to access other users&apos; data, overload the service, or scrape it in bulk.</li>
        <li>Don&apos;t use it to break any law or another service&apos;s terms.</li>
      </ul>

      <h2>No warranty</h2>
      <p>
        The service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind. To the extent the law allows, we aren&apos;t
        liable for losses arising from your use of the site, including fantasy outcomes, lost data or service interruptions. Back up
        anything important (Settings → Back up my data).
      </p>

      <h2>Changes</h2>
      <p>We may update the service or these terms; the date above shows the latest version. See also the <Link href="/privacy">Privacy Policy</Link>.</p>
    </LegalPage>
  );
}
