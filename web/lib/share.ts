/** Compact, URL-safe encoding of a finished mock draft for /share/<code> links. */
export interface SharedMock {
  v: 1;
  /** teams, your slot, finish rank, grade, projected starter points */
  t: number;
  s: number;
  r: number;
  g: string;
  pts: number;
  /** league name when the mock used an imported league */
  lg?: string;
  /** your first picks: [name, position, round.pick] */
  p: [string, string, string][];
}

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function encodeMock(m: SharedMock): string {
  return toB64Url(new TextEncoder().encode(JSON.stringify(m)));
}

export function decodeMock(code: string): SharedMock | null {
  try {
    const m = JSON.parse(new TextDecoder().decode(fromB64Url(decodeURIComponent(code))));
    if (m?.v !== 1 || !Array.isArray(m.p)) return null;
    return {
      v: 1, t: Number(m.t) || 12, s: Number(m.s) || 1, r: Number(m.r) || 1,
      g: String(m.g).slice(0, 3), pts: Number(m.pts) || 0,
      lg: m.lg ? String(m.lg).slice(0, 60) : undefined,
      p: m.p.slice(0, 9).map((x: unknown[]) => [String(x[0]).slice(0, 40), String(x[1]).slice(0, 3), String(x[2]).slice(0, 6)]),
    };
  } catch {
    return null;
  }
}

/** Power rankings share: league name, time-frame label and one row per team. */
export interface SharedPower {
  v: 1;
  lg: string;
  h: string;
  /** [team name, power rank, wins, losses, projected lineup points, best player] */
  t: [string, number, number, number, number, string][];
}

export function encodePower(p: SharedPower): string {
  return toB64Url(new TextEncoder().encode(JSON.stringify(p)));
}

export function decodePower(code: string): SharedPower | null {
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64Url(decodeURIComponent(code))));
    if (p?.v !== 1 || !Array.isArray(p.t)) return null;
    return {
      v: 1, lg: String(p.lg ?? "").slice(0, 60), h: String(p.h ?? "").slice(0, 30),
      t: p.t.slice(0, 20).map((r: unknown[]) => [
        String(r[0]).slice(0, 30), Number(r[1]) || 0, Number(r[2]) || 0, Number(r[3]) || 0, Number(r[4]) || 0, String(r[5] ?? "").slice(0, 30),
      ]),
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ luck meter & playoff odds cards
const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
function decodeJson(code: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(fromB64Url(decodeURIComponent(code))));
  } catch {
    return null;
  }
}
function encodeJson(x: unknown): string {
  return toB64Url(new TextEncoder().encode(JSON.stringify(x)));
}

/** Luck meter share: league, completed weeks, the sharer's team (optional), and one row per team. */
export interface SharedLuck {
  v: 1;
  lg: string;
  wk: number;
  me?: string;
  /** [team, wins, losses, all-play wins, all-play losses, expected wins x10, luck x10], luckiest first */
  t: [string, number, number, number, number, number, number][];
}
export const encodeLuck = (x: SharedLuck) => encodeJson(x);
export function decodeLuck(code: string): SharedLuck | null {
  const p = decodeJson(code);
  if (!p || p.v !== 1 || !Array.isArray(p.t)) return null;
  return {
    v: 1, lg: clip(p.lg, 60), wk: num(p.wk), me: p.me ? clip(p.me, 30) : undefined,
    t: (p.t as unknown[][]).slice(0, 20).map((r) => [clip(r[0], 30), num(r[1]), num(r[2]), num(r[3]), num(r[4]), num(r[5]), num(r[6])]),
  };
}

/** Playoff odds share: league, week, playoff spots, the sharer's team and stakes, one row per team. */
export interface SharedOdds {
  v: 1;
  lg: string;
  wk: number;
  /** playoff spots */
  p: number;
  me?: string;
  /** [opponent this week, odds if win x1000, odds if lose x1000] */
  st?: [string, number, number];
  /** [team, wins, losses, playoff odds x1000, title odds x1000], best odds first */
  t: [string, number, number, number, number][];
}
export const encodeOdds = (x: SharedOdds) => encodeJson(x);
export function decodeOdds(code: string): SharedOdds | null {
  const p = decodeJson(code);
  if (!p || p.v !== 1 || !Array.isArray(p.t)) return null;
  const st = Array.isArray(p.st) ? (p.st as unknown[]) : null;
  return {
    v: 1, lg: clip(p.lg, 60), wk: num(p.wk), p: num(p.p) || 6, me: p.me ? clip(p.me, 30) : undefined,
    st: st ? [clip(st[0], 30), num(st[1]), num(st[2])] : undefined,
    t: (p.t as unknown[][]).slice(0, 20).map((r) => [clip(r[0], 30), num(r[1]), num(r[2]), num(r[3]), num(r[4])]),
  };
}

/** Odds stored as x1000 -> "83%", ">99%", "<1%". */
export function pctLabel(x1000: number): string {
  if (x1000 >= 995) return ">99%";
  if (x1000 <= 0) return "0%";
  if (x1000 < 5) return "<1%";
  return `${Math.round(x1000 / 10)}%`;
}
