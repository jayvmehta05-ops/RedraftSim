/**
 * POST /api/waitlist {email, source?, website?}: add an email to the waitlist.
 *
 * Stored in the Supabase `waitlist` table (insert-only for the public key; see supabase/schema.sql).
 * The owner gets a ping in the private feedback channel (email masked). If Supabase isn't set up yet,
 * the full email goes to that private channel instead so no sign-up is lost.
 */
const recent = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > 4;
}
const mask = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");

async function notify(text: string) {
  const url = process.env.FEEDBACK_WEBHOOK_URL;
  if (!url) return false;
  const body = process.env.FEEDBACK_WEBHOOK_KIND === "slack" ? { text } : { content: text };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  return !!r?.ok;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return Response.json({ error: "Too many tries. Give it a minute." }, { status: 429 });
  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof b.website === "string" && b.website) return Response.json({ ok: true }); // honeypot
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, 254) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "That email doesn't look right." }, { status: 400 });
  const source = typeof b.source === "string" ? b.source.replace(/[^\w-]/g, "").slice(0, 40) : "home";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/waitlist`, {
      method: "POST",
      // publishable key in `apikey` only: requests run as the anonymous role, which may only insert
      headers: { apikey: key, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ email, source }),
    }).catch(() => null);
    if (r?.ok) {
      await notify(`📬 New waitlist sign-up: ${mask(email)} (from ${source})`);
      return Response.json({ ok: true });
    }
    if (r?.status === 409) return Response.json({ ok: true, already: true }); // already on the list
    console.warn("[waitlist] Supabase insert failed", r?.status, r ? await r.text().catch(() => "") : "no response");
  }
  // Fallback: deliver to the private channel so the sign-up isn't lost
  if (await notify(`📬 Waitlist sign-up (Supabase table not set up): ${email} (from ${source})`)) return Response.json({ ok: true });
  return Response.json({ error: "Couldn't save that right now. Please try again later." }, { status: 503 });
}
