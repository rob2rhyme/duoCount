"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { THEME_KEY, applyTheme, resolveTheme, storedTheme, systemPrefersDark } from "@/lib/theme";

const Ctx = createContext(null);

// Falls back to a no-op default so components can call the hook even if they
// somehow render outside the provider (e.g. isolated tests).
export const useTheme = () => useContext(Ctx) || { theme: "light", setTheme: () => {}, toggle: () => {} };

export default function ThemeProvider({ children }) {
  // "light" during SSR and the initial client render so hydration matches; the
  // effect below resolves the real theme after mount.
  const [theme, setThemeState] = useState("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(resolveTheme());
    setMounted(true);
  }, []);

  // Don't apply on the initial pass: the boot script already set the correct
  // class on <html> before paint, and re-applying the default "light" here
  // would strip it for a frame (a dark→light→dark flash). Apply only once the
  // real theme has been resolved, and on every change after.
  useEffect(() => {
    if (mounted) applyTheme(theme);
  }, [theme, mounted]);

  // Track OS changes, but only while the user hasn't made an explicit choice.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (!storedTheme()) setThemeState(systemPrefersDark() ? "dark" : "light"); };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const setTheme = (t) => {
    try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
    setThemeState(t);
  };
  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>;
}
