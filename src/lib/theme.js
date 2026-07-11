// Theme helpers shared by the no-FOUC boot script and the ThemeProvider.
// The app supports an explicit light/dark choice, persisted in localStorage;
// with no stored choice it follows the OS `prefers-color-scheme`.
export const THEME_KEY = "duocount-theme";

export function systemPrefersDark() {
  return typeof window !== "undefined"
    && window.matchMedia
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function storedTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function resolveTheme() {
  return storedTheme() || (systemPrefersDark() ? "dark" : "light");
}

// Apply a resolved theme to the document. Toggling the `.dark` class re-themes
// every CSS variable; `color-scheme` makes native controls (selects, date
// pickers, scrollbars) match.
export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.toggle("dark", theme === "dark");
  el.style.colorScheme = theme === "dark" ? "dark" : "light";
}

// Inlined into <head> so the theme is set before first paint (no flash).
// Kept tiny and dependency-free because it runs as a raw string.
// Note: an invalid/corrupt stored value must fall through to the OS preference,
// exactly as resolveTheme()/storedTheme() do — otherwise the two paths disagree
// and reintroduce a flash. Only "dark"/"light" are honored here.
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_KEY)};var s=localStorage.getItem(k);var d=s==="dark"?true:s==="light"?false:window.matchMedia("(prefers-color-scheme: dark)").matches;var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
