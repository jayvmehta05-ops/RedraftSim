"use client";

import { useEffect, useRef, useState } from "react";

/** Numbers that count up the first time they scroll into view. */
export default function Counters({ items }: { items: { value: number; prefix?: string; suffix?: string; label: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setProgress(1); return; }
      const start = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - start) / 1400);
        setProgress(1 - Math.pow(1 - k, 3));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div ref={ref} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-2xl bg-slate-900/60 p-4 text-center ring-1 ring-slate-800">
          <div className="text-3xl font-black tabular-nums text-white sm:text-4xl">
            {it.prefix}{Math.round(it.value * progress)}{it.suffix}
          </div>
          <div className="mt-1 text-xs text-slate-400">{it.label}</div>
        </div>
      ))}
    </div>
  );
}
