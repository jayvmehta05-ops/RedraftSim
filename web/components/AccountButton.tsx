"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { accountsEnabled, supabase } from "@/lib/supabase";
import { deleteCloudData, primeLastPushed, pullOnSignIn, pushChanges, reloadOnce, signOutAndWipe } from "@/lib/cloudSync";
import { reportError } from "@/lib/report";

type Status = "idle" | "syncing" | "synced" | "error";
const PUSH_EVERY_MS = 4000;
const RETURN_KEY = "redraft.signInFrom";

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

export default function AccountButton() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    let cancelled = false;

    const startPushing = (u: User) => {
      if (timer.current) clearInterval(timer.current);
      const push = async () => {
        try {
          const n = await pushChanges(sb, u);
          if (!cancelled && n) setStatus("synced");
        } catch (e) {
          if (!cancelled) setStatus("error");
          reportError(e, "cloud sync push");
        }
      };
      void push();
      timer.current = setInterval(push, PUSH_EVERY_MS);
      document.addEventListener("visibilitychange", push);
    };

    const onSession = async (u: User) => {
      setUser(u);
      setStatus("syncing");
      try {
        primeLastPushed();
        const changed = await pullOnSignIn(sb, u);
        // Google returns to the home page; send the user back to the page they signed in from
        const back = sessionStorage.getItem(RETURN_KEY);
        if (back) {
          sessionStorage.removeItem(RETURN_KEY);
          if (back !== window.location.pathname && back.startsWith("/")) {
            window.location.replace(back);
            return;
          }
        }
        if (changed && reloadOnce()) return; // reload so every tab of the app reads the synced data
        if (cancelled) return;
        setStatus("synced");
        startPushing(u);
      } catch (e) {
        if (!cancelled) setStatus("error");
        reportError(e, "cloud sync pull");
      }
    };

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session?.user) {
        void onSession(session.user);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setStatus("idle");
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  if (!accountsEnabled) return null;
  const sb = supabase();

  if (!user) {
    return (
      <button
        onClick={() => {
          sessionStorage.setItem(RETURN_KEY, window.location.pathname);
          void sb?.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
        }}
        className="flex shrink-0 items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
      >
        <GoogleG /><span className="hidden sm:inline">Sign in</span>
      </button>
    );
  }

  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "Account";
  const avatar = user.user_metadata?.avatar_url as string | undefined;
  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen((v) => !v)} aria-label="Account menu"
        className="flex items-center gap-2 rounded-full ring-2 ring-emerald-500/40 hover:ring-emerald-400">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-slate-950">{name[0]?.toUpperCase()}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl bg-slate-900 p-3 text-sm shadow-xl ring-1 ring-slate-700">
          <div className="truncate font-semibold text-white">{name}</div>
          <div className="truncate text-xs text-slate-400">{user.email}</div>
          <div className={`mt-2 text-xs ${status === "error" ? "text-rose-300" : "text-emerald-300"}`}>
            {status === "syncing" ? "Syncing your leagues…" : status === "error" ? "Couldn't sync. Changes are saved on this device and will retry." : "Your leagues and settings are synced to your account"}
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-800 pt-2">
            <button
              onClick={async () => {
                if (!sb) return;
                await signOutAndWipe(sb);
                window.location.reload();
              }}
              className="w-full rounded-md px-2 py-1.5 text-left text-slate-200 hover:bg-slate-800">
              Sign out
            </button>
            <button
              onClick={async () => {
                if (!sb) return;
                try {
                  await deleteCloudData(sb, user);
                  await signOutAndWipe(sb);
                  window.location.reload();
                } catch (e) {
                  reportError(e, "delete cloud data");
                  setStatus("error");
                }
              }}
              className="w-full rounded-md px-2 py-1.5 text-left text-rose-300 hover:bg-rose-500/10">
              Delete my saved data and sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
