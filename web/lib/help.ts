/**
 * Plain-English descriptions of every tool, in one place, so the app tabs, the help panel and the guide
 * all say the same thing. Written for someone who has never used the site.
 */
import { TARGET } from "./season";

export type MainTab = "board" | "mock" | "live" | "trades" | "keepers" | "trends";
export type LeagueSection = "team" | "startsit" | "trades" | "waivers" | "power" | "odds" | "luck";

export const MAIN_HELP: Record<MainTab, { name: string; what: string; when: string }> = {
  board: { name: `${TARGET} Big Board`, what: `Every player ranked for next season, rebuilt every Tuesday.`, when: "Planning ahead, or before your draft." },
  mock: { name: "Mock Draft", what: "Practice drafts against bots that pick like real people (or like your actual leaguemates).", when: "Before your draft." },
  live: { name: "Live Draft", what: "Keep it open during your real draft: it crosses off picks and suggests yours.", when: "On draft day." },
  trades: { name: "My League", what: "Your league's tools: lineup help, trades, waivers, standings odds and more.", when: "Every week of the season." },
  keepers: { name: "Keepers", what: "Is a player worth the draft pick he'd cost to keep?", when: "Keeper leagues, before the draft." },
  trends: { name: "Trends", what: "Who's rising or falling in next season's rankings, week to week.", when: "Any time." },
};

export const LEAGUE_GROUPS: { label: string; ids: LeagueSection[] }[] = [
  { label: "This week", ids: ["startsit", "waivers"] },
  { label: "Your team", ids: ["team", "trades"] },
  { label: "Whole league", ids: ["power", "odds", "luck"] },
];

export const LEAGUE_HELP: Record<LeagueSection, { name: string; what: string }> = {
  startsit: { name: "Start/Sit", what: "Who to put in your lineup this week, using this week's projections and your league's scoring." },
  waivers: { name: "Waivers", what: "Free agents worth picking up, ranked by how much they'd improve your lineup, with who to drop and what to bid." },
  team: { name: "Rosters", what: "See any team's roster. Click a player to find trades for him, or to see what your own player would get you." },
  trades: { name: "Trades", what: "Trade ideas that help you and that the other manager would likely accept, plus a tool to check any trade." },
  power: { name: "Power rankings", what: "Every team ranked by how strong its lineup is for the rest of the season." },
  odds: { name: "Playoff odds", what: "Each team's chance to make the playoffs and win it all, and what this week's game means for you." },
  luck: { name: "Luck meter", what: "Has your schedule helped or hurt you? Your record compared with what your weekly scores earned." },
};

export const START_STEPS = [
  { title: "Import your league", body: "Settings (top right) → paste your Sleeper or ESPN league link. Private ESPN leagues need your ESPN login cookies, which stay on your device." },
  { title: "Pick your team", body: "Choose which team is yours so the tools know whose lineup to help." },
  { title: "Open My League", body: "Start/Sit for this week's lineup, Waivers for pickups, Rosters and Trades for deals." },
];
