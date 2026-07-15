"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { LANG_KEY, DEFAULT_LOCALE, translate, resolveLocale } from "@/lib/i18n";

const Ctx = createContext(null);

// No-op default so components can render outside the provider (isolated tests):
// everything resolves through the English catalog.
export const useLang = () =>
  useContext(Ctx) || { lang: DEFAULT_LOCALE, setLang: () => {}, t: (key, vars) => translate(DEFAULT_LOCALE, key, vars) };

// Per-device language preference, modeled one-for-one on ThemeProvider /
// PrefsProvider: localStorage (duocount-lang), never the vendor record, so one
// clerk's choice never changes what a coworker sees. English during SSR and the
// first client render keeps hydration stable; the stored locale loads in an
// effect after mount. Unlike the theme there's no <head> boot script — a
// one-frame English→Spanish text swap is acceptable where a color flash isn't.
export default function LangProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    try { setLangState(resolveLocale(localStorage.getItem(LANG_KEY))); } catch { /* private mode */ }
  }, []);

  const setLang = useCallback((l) => {
    const next = resolveLocale(l);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* private mode */ }
    setLangState(next);
  }, []);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
