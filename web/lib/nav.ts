/**
 * The app's place in the URL hash, so the browser's Back button, refresh and shared links all work:
 *   /app#board   /app#mock   /app#league   /app#league/startsit   /app#trends …
 * "My League" is the `trades` tab internally; the URL says `league`.
 */
import type { LeagueSection, MainTab } from "./help";

const TAB_SLUG: Record<MainTab, string> = { board: "board", mock: "mock", live: "live", trades: "league", keepers: "keepers", trends: "trends" };
const SLUG_TAB = Object.fromEntries(Object.entries(TAB_SLUG).map(([t, s]) => [s, t])) as Record<string, MainTab>;
const SECTIONS: LeagueSection[] = ["team", "startsit", "trades", "waivers", "power", "odds", "luck"];
const SECTION_SLUG: Record<LeagueSection, string> = { team: "rosters", startsit: "startsit", trades: "trades", waivers: "waivers", power: "power", odds: "odds", luck: "luck" };
const SLUG_SECTION = Object.fromEntries(SECTIONS.map((s) => [SECTION_SLUG[s], s])) as Record<string, LeagueSection>;

/** What the current URL hash points at (nulls when it's empty or unknown). */
export function readNav(): { tab: MainTab | null; section: LeagueSection | null } {
  if (typeof window === "undefined") return { tab: null, section: null };
  const [t, s] = window.location.hash.replace(/^#/, "").toLowerCase().split("/");
  const tab = SLUG_TAB[t] ?? null;
  return { tab, section: tab === "trades" ? SLUG_SECTION[s] ?? null : null };
}

/** Put a tab (and My League tool) in the URL. `replace` updates it without adding a Back step. */
export function writeNav(tab: MainTab, section?: LeagueSection | null, replace = false) {
  if (typeof window === "undefined") return;
  const hash = `#${TAB_SLUG[tab]}${tab === "trades" && section ? `/${SECTION_SLUG[section]}` : ""}`;
  if (window.location.hash === hash) return;
  const url = window.location.pathname + window.location.search + hash;
  if (replace) window.history.replaceState(window.history.state, "", url);
  else window.history.pushState(window.history.state, "", url);
}
