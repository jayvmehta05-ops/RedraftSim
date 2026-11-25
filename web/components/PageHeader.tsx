import Link from "next/link";
import { SITE_NAME } from "@/lib/season";
import { Logo } from "./icons";

/** Header for the standalone pages (guide, accuracy, risers, share). */
export default function PageHeader() {
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="whitespace-nowrap text-sm font-bold text-white">{SITE_NAME}</span>
        </Link>
        <nav className="ml-auto flex shrink-0 gap-1 whitespace-nowrap text-xs font-semibold">
          <Link href="/guide" className="hidden rounded-md px-2.5 py-1.5 text-slate-400 hover:bg-slate-900 hover:text-white sm:block">How it works</Link>
          <Link href="/" className="rounded-md bg-emerald-500 px-2.5 py-1.5 text-slate-950 hover:bg-emerald-400">Open the board</Link>
        </nav>
      </div>
    </header>
  );
}
