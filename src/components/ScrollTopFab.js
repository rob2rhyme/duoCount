"use client";
import { useCallback, useEffect, useState } from "react";

// Progressive "scroll to top" floating action button. A ring around the arrow
// fills to mirror how far down the page you are; the button fades in only once
// you've scrolled past a threshold, and returns you to the top on click
// (respecting reduced-motion). Mounted app-wide by AppChrome.
const RADIUS = 20;
const CIRC = 2 * Math.PI * RADIUS;
const REVEAL_AT = 240; // px scrolled before the button appears

export default function ScrollTopFab() {
  const [progress, setProgress] = useState(0); // 0..1 of scrollable height
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = document.documentElement;
      const scrollTop = window.scrollY || el.scrollTop || 0;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, scrollTop / max)) : 0);
      setVisible(scrollTop > REVEAL_AT);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    measure();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const toTop = useCallback(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, []);

  return (
    <button
      type="button"
      onClick={(e) => { e.currentTarget.blur(); toTop(); }}
      aria-label="Scroll to top"
      title="Scroll to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full grid place-items-center
        bg-surface border border-line shadow-lg backdrop-blur
        transition-all duration-300 ease-out hover:-translate-y-0.5 active:scale-95
        ${visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-3 pointer-events-none"}`}
    >
      <svg width="48" height="48" viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={RADIUS} fill="none" strokeWidth="3" className="stroke-line" />
        <circle
          cx="24" cy="24" r={RADIUS} fill="none" strokeWidth="3" strokeLinecap="round"
          className="stroke-brass"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - progress)}
        />
      </svg>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="relative text-fg" aria-hidden="true">
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  );
}
