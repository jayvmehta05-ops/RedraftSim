"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Box = { x: number; y: number; w: number; h: number };

/**
 * A row of options whose selected one sits on a pill that glides to each new choice, like a native
 * segmented control. Mark the selected button with data-active="true"; it can be nested anywhere inside
 * (for example in labelled groups), and the pill follows across groups and wrapped rows.
 */
export default function Glide({ children, className = "", pill, as: Tag = "div", ...rest }: {
  children: ReactNode; className?: string;
  /** classes for the pill (its color and corner radius) */
  pill: string;
  as?: "div" | "nav";
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "className">) {
  const ref = useRef<HTMLElement>(null);
  // `slide` is false for the pill's first placement, so it appears in place instead of sliding in from the corner
  const [{ box, slide }, setState] = useState<{ box: Box | null; slide: boolean }>({ box: null, slide: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const a = el.querySelector<HTMLElement>('[data-active="true"]');
        if (!a || !a.offsetWidth) { setState({ box: null, slide: false }); return; }
        // Layout offsets, not on-screen boxes: a button squeezed mid-press must not shrink the pill
        let x = 0, y = 0;
        let n: HTMLElement | null = a;
        while (n && n !== el) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
        if (n !== el) return; // not laid out inside this control (hidden)
        const next = { x, y, w: a.offsetWidth, h: a.offsetHeight };
        setState((s) => {
          const p = s.box;
          if (p && Math.abs(p.x - next.x) < 0.5 && Math.abs(p.y - next.y) < 0.5 && Math.abs(p.w - next.w) < 0.5 && Math.abs(p.h - next.h) < 0.5) return s;
          return { box: next, slide: !!p };
        });
      });
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-active"] });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => { cancelAnimationFrame(frame); mo.disconnect(); ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  return (
    <Tag ref={ref as React.Ref<HTMLDivElement>} className={`ff-glide ${className}`} {...rest}>
      <span aria-hidden className={`ff-glide-pill ${pill}`}
        style={{
          opacity: box ? 1 : 0,
          width: box?.w ?? 0, height: box?.h ?? 0,
          transform: box ? `translate(${box.x}px, ${box.y}px)` : undefined,
          transition: slide
            ? "transform 0.42s var(--ease-glide), width 0.42s var(--ease-glide), height 0.42s var(--ease-glide), opacity 0.2s ease"
            : "opacity 0.2s ease",
        }} />
      {children}
    </Tag>
  );
}
