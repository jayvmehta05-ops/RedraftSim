"use client";

import { useState } from "react";

/**
 * Share a link: the phone's share sheet when available (Messages, Instagram, group chats), otherwise copy it.
 * `build` returns the path (e.g. "/luck/<code>") so the link is made only when clicked.
 */
export default function ShareButton({ build, title, text, label = "Share" }: { build: () => string; title: string; text: string; label?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };

  const share = async () => {
    const url = `${window.location.origin}${build()}`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
    const data = { title, text, url };
    if (nav.share && (!nav.canShare || nav.canShare(data)) && window.matchMedia("(pointer: coarse)").matches) {
      try { await nav.share(data); return; } catch { /* cancelled: fall back to copying */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied!");
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <button onClick={share}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />
      </svg>
      {msg ?? label}
    </button>
  );
}
