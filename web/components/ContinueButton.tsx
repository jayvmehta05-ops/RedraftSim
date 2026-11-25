"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

/** Name of the league saved in this browser, if any (read after hydration, so server and client HTML match). */
function savedLeagueName(): string | null {
  try {
    const raw = localStorage.getItem("redraft27.league");
    return raw ? ((JSON.parse(raw) as { name?: string }).name ?? "your league") : null;
  } catch {
    return null;
  }
}
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

/** Landing-page call to action: "Continue to <league>" for returning visitors, "Open the app" for new ones. */
export default function ContinueButton({ className, newLabel = "Open the app" }: { className?: string; newLabel?: string }) {
  const league = useSyncExternalStore(subscribe, savedLeagueName, () => null);
  return (
    <Link href="/app" className={className}>
      {league ? <>Continue to <span className="max-w-[14rem] truncate">{league}</span></> : newLabel}
      <span aria-hidden> →</span>
    </Link>
  );
}
