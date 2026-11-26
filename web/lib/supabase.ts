/**
 * Supabase client (Google sign-in + per-user cloud storage). Accounts are optional: if the two public
 * environment variables aren't set, `supabase` is null and the site works exactly as before.
 *
 *   NEXT_PUBLIC_SUPABASE_URL              https://<project>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  the project's public key (sb_publishable_…), or the legacy
 *   (or NEXT_PUBLIC_SUPABASE_ANON_KEY)    "anon" key. Safe to expose: row-level security in
 *                                         supabase/schema.sql limits every user to their own rows.
 *   Never put the secret / service_role key in a NEXT_PUBLIC_ variable.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Each name is written out in full so Next.js inlines it into the browser bundle at build time.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anon = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();

export const accountsEnabled = Boolean(url && anon);

/**
 * Google OAuth web client used for "Sign in with Google" on the site itself (public, not a secret).
 * Its Authorized JavaScript origins in Google Cloud must include every site address, and Supabase's
 * Google provider lists it under Client IDs so it accepts the ID tokens.
 */
export const GOOGLE_CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  || "84695227324-gckapssitkf9imjsfqbtl28jmf5f0ocp.apps.googleusercontent.com").trim();

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!accountsEnabled || typeof window === "undefined") return null;
  if (!client) {
    client = createClient(url!, anon!, {
      auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
    });
  }
  return client;
}
