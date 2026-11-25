/**
 * POST /api/feedback — site feedback, NPS scores and post-mock surveys.
 *
 * Destinations (configure in Vercel → Project → Settings → Environment Variables):
 *   FEEDBACK_WEBHOOK_URL     Discord or Slack incoming-webhook URL (private channel). Easiest option.
 *   FEEDBACK_WEBHOOK_KIND    "discord" (default) or "slack"
 *   FEEDBACK_GITHUB_REPO     owner/name of a PRIVATE repo to file feedback as issues
 *   FEEDBACK_GITHUB_TOKEN    fine-grained token with Issues: read & write on that repo only
 * Feedback is never filed in a public repo (checked on every post). Without any destination it is
 * only written to the server log, which Vercel keeps for a short time.
 */
const KINDS = ["general", "bug", "idea", "projections", "mock_realism", "error"] as const;
const recent = new Map<string, number[]>(); // best-effort per-instance rate limit

function rateLimited(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > 5;
}

interface Feedback {
  kind: (typeof KINDS)[number];
  score: number | null;
  message: string;
  email: string | null;
  context: Record<string, string>;
}

function summary(f: Feedback, includeEmail: boolean) {
  const lines = [
    `${f.kind === "error" ? "🚨 " : ""}**${f.kind.replace("_", " ")}**${f.score != null ? ` · score ${f.score}${f.kind === "mock_realism" ? "/5" : "/10"}` : ""}`,
    f.message || "(no comment)",
    Object.entries(f.context).map(([k, v]) => `${k}: ${v}`).join(" · "),
  ];
  if (includeEmail && f.email) lines.push(`reply-to: ${f.email}`);
  return lines.filter(Boolean).join("\n");
}

async function toWebhook(f: Feedback) {
  const url = process.env.FEEDBACK_WEBHOOK_URL;
  if (!url) return false;
  const text = summary(f, true).slice(0, 1900);
  const body = process.env.FEEDBACK_WEBHOOK_KIND === "slack" ? { text } : { content: text };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.ok;
}

async function toGithub(f: Feedback) {
  const repo = process.env.FEEDBACK_GITHUB_REPO;
  const token = process.env.FEEDBACK_GITHUB_TOKEN;
  if (!repo || !token) return false;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "future-fantasy" };
  const meta = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!meta.ok || !(await meta.json()).private) {
    console.warn("[feedback] FEEDBACK_GITHUB_REPO is not a private repo; refusing to post feedback there");
    return false;
  }
  const title = `[${f.kind}]${f.score != null ? ` ${f.score}` : ""} ${f.message.slice(0, 60) || "(no comment)"}`;
  const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST", headers,
    body: JSON.stringify({ title, body: summary(f, true), labels: ["feedback", f.kind] }),
  });
  return r.ok;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return Response.json({ error: "Too many submissions; try again in a minute." }, { status: 429 });
  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof b.website === "string" && b.website) return Response.json({ ok: true }); // honeypot: bots fill hidden fields

  const kind = KINDS.includes(b.kind as Feedback["kind"]) ? (b.kind as Feedback["kind"]) : "general";
  const scoreNum = Number(b.score);
  const maxScore = kind === "mock_realism" ? 5 : 10;
  const score = b.score == null || b.score === "" || !Number.isFinite(scoreNum) ? null : Math.max(0, Math.min(maxScore, Math.round(scoreNum)));
  const message = typeof b.message === "string" ? b.message.trim().slice(0, 2000) : "";
  if (kind === "error" && !message) return Response.json({ error: "Missing error message" }, { status: 400 });
  const emailRaw = typeof b.email === "string" ? b.email.trim().slice(0, 120) : "";
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
  if (!message && score == null) return Response.json({ error: "Add a score or a comment." }, { status: 400 });

  const context: Record<string, string> = {};
  if (b.context && typeof b.context === "object") {
    for (const [k, v] of Object.entries(b.context as Record<string, unknown>).slice(0, 8)) {
      if (typeof v === "string" || typeof v === "number") context[k.slice(0, 20)] = String(v).slice(0, 60);
    }
  }
  const f: Feedback = { kind, score, message, email, context };

  const results = await Promise.allSettled([toWebhook(f), toGithub(f)]);
  const stored = results.some((r) => r.status === "fulfilled" && r.value);
  // Server log (owner-only); email masked
  console.log("[feedback]", JSON.stringify({ ...f, email: email ? email.replace(/^(.).*(@.*)$/, "$1***$2") : null, stored }));
  return Response.json({ ok: true });
}
