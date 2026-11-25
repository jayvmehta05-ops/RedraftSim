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
