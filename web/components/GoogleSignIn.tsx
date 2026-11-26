"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GOOGLE_CLIENT_ID } from "@/lib/supabase";
import { reportError } from "@/lib/report";

/**
 * Google's own "Sign in with Google" button. Google checks the sign-in on this site's address (no trip
 * through supabase.co), hands back a signed ID token, and Supabase turns it into a session. A one-time
 * nonce ties the token to this attempt so it can't be replayed. If Google's script can't load, the
 * caller's `fallback` (the redirect-based sign-in) is shown instead.
 */
interface GoogleId {
  initialize: (cfg: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
}
declare global {
  interface Window { google?: { accounts?: { id?: GoogleId } } }
}

let scriptPromise: Promise<void> | null = null;
function loadGoogle(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error("Google sign-in script failed to load")); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function signOutOfGoogleButton() {
  window.google?.accounts?.id?.disableAutoSelect();
}

export default function GoogleSignIn({ sb, fallback }: { sb: SupabaseClient; fallback: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    (async () => {
      await loadGoogle();
      const hashed = await sha256Hex(raw);
      const g = window.google?.accounts?.id;
      if (cancelled || !g || !ref.current) { if (!cancelled && !g) setFailed(true); return; }
      g.initialize({
        client_id: GOOGLE_CLIENT_ID,
        nonce: hashed,
        ux_mode: "popup",
        itp_support: true,
        context: "signin",
        callback: async ({ credential }: { credential?: string }) => {
          if (!credential) return;
          setBusy(true);
          const { error } = await sb.auth.signInWithIdToken({ provider: "google", token: credential, nonce: raw });
          setBusy(false);
          if (error) {
            reportError(error, "google id token sign-in");
            setFailed(true); // fall back to the redirect sign-in
          }
        },
      });
      g.renderButton(ref.current, {
        type: window.innerWidth < 640 ? "icon" : "standard",
        theme: "outline", size: "medium", shape: "pill", text: "signin", logo_alignment: "left",
      });
    })().catch((e) => {
      if (cancelled) return;
      reportError(e, "google sign-in button");
      setFailed(true);
    });
    return () => { cancelled = true; };
  }, [sb]);

  if (failed) return <>{fallback}</>;
  return (
    <div className="flex min-h-8 items-center" aria-busy={busy}>
      {busy ? <span className="text-xs text-slate-400">Signing in…</span> : <div ref={ref} />}
    </div>
  );
}
