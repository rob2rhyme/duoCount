"use client";
import { createContext, useContext, useEffect, useState } from "react";

// Per-device UI preferences (like the theme, these live in localStorage, not
// the vendor record — they're personal, not business policy). Currently just
// the scroll-to-top FAB; the provider is the place to add future device prefs.
const KEY = "duocount-fab";
const Ctx = createContext(null);

export const usePrefs = () =>
  useContext(Ctx) || { fabEnabled: true, setFabEnabled: () => {} };

export default function PrefsProvider({ children }) {
  // Default on; matches SSR so hydration is stable. The stored value (if any)
  // is read after mount.
  const [fabEnabled, setFab] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "off") setFab(false);
    } catch { /* private mode */ }
  }, []);

  const setFabEnabled = (on) => {
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ }
    setFab(on);
  };

  return <Ctx.Provider value={{ fabEnabled, setFabEnabled }}>{children}</Ctx.Provider>;
}
