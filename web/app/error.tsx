"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportError } from "@/lib/report";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportError(error, "error boundary");
  }, [error]);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-2xl bg-slate-900 p-6 text-center ring-1 ring-slate-800">
        <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-400">
          The error was reported automatically. Your saved leagues and settings are safe in this browser.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={retry} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950">Try again</button>
          <Link href="/" className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200">Back to the board</Link>
        </div>
      </div>
    </main>
  );
}
