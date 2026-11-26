"use client";

import { useEffect } from "react";

/**
 * Fades sections up into place as they scroll into view. Mark an element with `data-reveal` (and an
 * optional `style={{ "--reveal-delay": "120ms" }}` to stagger). Anything already on screen when the page
 * loads stays put, so nothing visible flickers; without JavaScript everything simply shows.
 */
export default function Reveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!els.length || !("IntersectionObserver" in window)) return;
    const h = window.innerHeight;
    els.forEach((el) => { if (el.getBoundingClientRect().top < h * 0.92) el.setAttribute("data-shown", ""); });
    document.documentElement.classList.add("ff-reveal-on");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.setAttribute("data-shown", "");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    els.forEach((el) => { if (!el.hasAttribute("data-shown")) io.observe(el); });
    return () => { io.disconnect(); document.documentElement.classList.remove("ff-reveal-on"); };
  }, []);
  return null;
}
