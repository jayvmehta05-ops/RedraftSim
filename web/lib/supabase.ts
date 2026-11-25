/**
 * Supabase client (Google sign-in + per-user cloud storage). Accounts are optional: if the two public
 * environment variables aren't set, `supabase` is null and the site works exactly as before.
 *
 *   NEXT_PUBLIC_SUPABASE_URL       https://<project>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  the project's public "anon" key (safe to expose; row-level security
 *                                  in supabase/schema.sql limits every user to their own rows)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const accountsEnabled = Boolean(url && anon);

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
