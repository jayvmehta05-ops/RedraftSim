import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { EFFECTIVE_DATE } from "@/components/LegalPage";
import { SITE_NAME } from "@/lib/season";

export const metadata: Metadata = { title: `Privacy Policy — ${SITE_NAME}`, description: `How ${SITE_NAME} handles your data.` };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>Effective {EFFECTIVE_DATE}. This explains what Future Fantasy collects, why, and the choices you have.</p>

      <h2>The short version</h2>
      <ul>
        <li>You can use the site without an account. Without one, everything you save stays in your own browser.</li>
        <li>If you sign in with Google, your saved leagues and settings are stored so they follow you across devices. Only you can see them.</li>
        <li>Your ESPN login cookies are never stored on our servers.</li>
        <li>We don&apos;t sell your data, and we don&apos;t show ads.</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li><b>If you sign in with Google:</b> your name, email address and profile picture from Google, used to show who&apos;s signed in and to keep your data separate from everyone else&apos;s.</li>
        <li><b>Your saved app data (signed-in users only):</b> imported leagues (team names, rosters, records, past draft picks, this season&apos;s trade and pickup counts), your descriptions of leaguemates, roster edits, keeper lists and settings, so they sync between your devices.</li>
        <li><b>Waitlist:</b> if you join the waitlist, your email address, stored so we can tell you about new features. Ask through the Feedback button to be removed.</li>
        <li><b>Feedback you send:</b> your message, rating and, only if you choose to give it, your email address so we can reply.</li>
        <li><b>Error reports:</b> when something breaks, the error message, the page, screen width and browser type, to fix bugs. No personal data is included.</li>
        <li><b>Usage analytics (if enabled):</b> anonymous page views via Vercel Web Analytics, which uses no cookies.</li>
      </ul>

      <h2>What we don&apos;t collect or keep</h2>
      <ul>
        <li><b>ESPN cookies</b> (espn_s2, SWID) for private leagues are sent to ESPN only to read your league, and are kept only in your browser if you choose &quot;remember on this device.&quot; They are never stored on our servers or in your account. Logging out of ESPN invalidates them.</li>
        <li>We don&apos;t collect payment information.</li>
      </ul>

      <h2>Where data lives</h2>
      <p>
        The site is hosted on Vercel. Signed-in data is stored in a Supabase database protected so that each account can only read and change
        its own records. Sign-in is handled by Google. Feedback and error reports are delivered to a private channel the site owner reads.
        League data is fetched from Sleeper and ESPN at your request.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li><b>Delete your saved data:</b> signed in, open your profile picture → &quot;Delete my saved data and sign out.&quot;</li>
        <li><b>Delete your account entirely:</b> send a request through the Feedback button and we&apos;ll remove your sign-in record.</li>
        <li><b>Without an account:</b> clear this site&apos;s data in your browser settings, or use Settings → Back up my data first if you want to keep it.</li>
      </ul>

      <h2>Children</h2>
      <p>The site isn&apos;t intended for children under 13, and we don&apos;t knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>If this policy changes, we&apos;ll update the date above. Questions? Use the Feedback button in <Link href="/app">the app</Link>.</p>
    </LegalPage>
  );
}
