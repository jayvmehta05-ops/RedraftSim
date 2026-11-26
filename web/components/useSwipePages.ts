"use client";

import { useEffect, useRef } from "react";

/** Something that can page left/right (the app's tabs, or My League's tools). d = 1 is next, -1 previous. */
export type SwipeTarget = { can: (d: 1 | -1) => boolean; go: (d: 1 | -1) => void };

const PHONE_MAX = 1023; // below Tailwind's lg breakpoint: phones and small tablets only

/** Is the touch on something that needs horizontal drags for itself (a scrolling table, a slider, a text box)? */
function ownsHorizontalDrag(target: Element, stopAt: Element): boolean {
  if (target.closest("input, textarea, select, [contenteditable='true'], [data-noswipe]")) return true;
  for (let n: Element | null = target; n && n !== stopAt; n = n.parentElement) {
    const ox = getComputedStyle(n).overflowX;
    if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth + 2) return true;
  }
  return false;
}

/**
 * Swipe left or right anywhere on the page (phones only) to go to the next or previous page. The page
 * follows your finger, springs back if you don't swipe far enough, and slides away when you do.
 * Swipes that start on a sideways-scrolling table, a slider, a text box or a live draft are left alone.
 */
export function useSwipePages(getTarget: () => SwipeTarget, rootSelector = "main") {
  const target = useRef(getTarget);
  useEffect(() => { target.current = getTarget; });

  useEffect(() => {
    let start: { x: number; y: number; t: number; surface: HTMLElement } | null = null;
    let axis: "x" | "y" | null = null;
    let dx = 0;

    const reset = (el: HTMLElement) => { el.style.transition = ""; el.style.translate = ""; el.style.opacity = ""; };

    const onStart = (e: TouchEvent) => {
      start = null;
      axis = null;
      dx = 0;
      if (window.innerWidth > PHONE_MAX || e.touches.length !== 1) return;
      const root = document.querySelector<HTMLElement>(rootSelector);
      const t = e.target as Element | null;
      if (!root || !t || !root.contains(t) || ownsHorizontalDrag(t, root)) return;
      if (root.querySelector("[data-noswipe-page]")) return; // e.g. a draft in progress: never page away by accident
      // My League marks its tool content as the part that moves, so the tool picker stays put
      const surface = root.querySelector<HTMLElement>("[data-swipe-surface]") ?? root;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), surface };
    };

    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const x = e.touches[0].clientX - start.x;
      const y = e.touches[0].clientY - start.y;
      if (!axis) {
        if (Math.abs(x) < 10 && Math.abs(y) < 10) return;
        axis = Math.abs(x) > Math.abs(y) * 1.3 ? "x" : "y";
      }
      if (axis === "y") { start = null; return; } // a normal scroll
      if (e.cancelable) e.preventDefault(); // hold the page still vertically while swiping sideways
      dx = x;
      const can = target.current().can(x < 0 ? 1 : -1);
      const offset = can ? x : x * 0.25; // rubber-band at the first and last page
      const s = start.surface;
      s.style.transition = "none";
      s.style.translate = `${offset}px 0`;
      s.style.opacity = String(1 - Math.min(Math.abs(offset) / window.innerWidth, 1) * 0.4);
    };

    const onEnd = () => {
      if (!start || axis !== "x") { start = null; return; }
      const s = start.surface;
      const d: 1 | -1 = dx < 0 ? 1 : -1;
      const speed = Math.abs(dx) / Math.max(performance.now() - start.t, 1); // px per ms
      const t = target.current();
      const commit = t.can(d) && (Math.abs(dx) > window.innerWidth * 0.28 || (speed > 0.45 && Math.abs(dx) > 40));
      start = null;
      if (commit) {
        // Slide the page off in the swipe's direction, then show the next one (it slides in from the other side)
        s.style.transition = "translate 0.18s var(--ease-out), opacity 0.18s ease-out";
        s.style.translate = `${-d * 45}% 0`;
        s.style.opacity = "0";
        setTimeout(() => { t.go(d); requestAnimationFrame(() => reset(s)); }, 170);
      } else {
        s.style.transition = "translate 0.45s var(--ease-glide), opacity 0.3s ease-out";
        s.style.translate = "0px 0";
        s.style.opacity = "1";
        setTimeout(() => reset(s), 460); // clear inline styles so nothing stays offset
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [rootSelector]);
}
