/**
 * Automatic error reports: sent through /api/feedback (kind "error") to the same private destination as
 * feedback (your Discord webhook). Deduplicated and capped per browser session so a loop can't spam you.
 */
const SENT_KEY = "redraft.errorsSent";
const MAX_PER_SESSION = 5;

export function reportError(err: unknown, where: string) {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err));
    const msg = `${e.name}: ${e.message}`.slice(0, 300);
    // Ignore noise from browser extensions and cancelled network requests
    if (/extension|chrome-extension|moz-extension|ResizeObserver loop|AbortError|Load failed|Failed to fetch/i.test(`${msg} ${e.stack ?? ""}`)) return;
    const sent: string[] = JSON.parse(sessionStorage.getItem(SENT_KEY) ?? "[]");
    if (sent.includes(msg) || sent.length >= MAX_PER_SESSION) return;
    sessionStorage.setItem(SENT_KEY, JSON.stringify([...sent, msg]));
    const stack = (e.stack ?? "").split("\n").slice(1, 6).map((l) => l.trim()).join(" | ").slice(0, 900);
    void fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "error",
        message: `${msg}\n${stack}`,
        context: {
          where, path: window.location.pathname, width: String(window.innerWidth),
          browser: navigator.userAgent.replace(/\(.*?\)/g, "").slice(0, 60),
          digest: (e as Error & { digest?: string }).digest ?? "",
        },
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let reporting break the page */
  }
}
