"use client";
import { useTheme } from "./ThemeProvider";

// Sun / moon toggle. `variant="dark"` styles it for placement on the app's
// dark header; the default suits light card surfaces (e.g. the login screen).
export default function ThemeToggle({ variant = "light", className = "" }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const onDarkChrome = variant === "dark";
  const base = onDarkChrome
    ? "text-paper/90 hover:text-paper hover:bg-white/10 border border-white/15"
    : "text-muted hover:text-fg hover:bg-subtle border border-line";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className={`inline-grid place-items-center w-8 h-8 rounded-full transition ${base} ${className}`}
    >
      {dark ? (
        // Sun — tap to go light
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // Moon — tap to go dark
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
