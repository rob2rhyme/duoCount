"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "./ThemeProvider";
import { usePrefs } from "./PrefsProvider";

function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? "bg-brass" : "bg-line"}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// Header gear → per-device Preferences: theme and the scroll-to-top FAB. Kept
// personal (localStorage via ThemeProvider/PrefsProvider), so one person's
// choice never changes what a coworker sees.
export default function PreferencesMenu() {
  const { theme, setTheme } = useTheme();
  const { fabEnabled, setFabEnabled } = usePrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        aria-label="Preferences" aria-haspopup="menu" aria-expanded={open}
        className="inline-grid place-items-center w-8 h-8 rounded-full text-paper/90 hover:text-paper hover:bg-white/10 border border-white/15 transition">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div role="menu" aria-label="Preferences"
          className="card absolute right-0 mt-2 w-64 z-50 p-3 space-y-3.5 text-fg shadow-xl">
          <div>
            <div className="label mb-1.5">Appearance</div>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-subtle">
              {["light", "dark"].map((t) => (
                <button key={t} type="button" onClick={() => setTheme(t)} role="menuitemradio" aria-checked={theme === t}
                  className={`px-2 py-1.5 rounded-md text-sm font-semibold capitalize transition ${theme === t ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Scroll-to-top button</div>
              <div className="text-xs text-muted">Floating shortcut back to the top</div>
            </div>
            <Switch on={fabEnabled} onChange={setFabEnabled} label="Toggle the scroll-to-top button" />
          </div>
        </div>
      )}
    </div>
  );
}
