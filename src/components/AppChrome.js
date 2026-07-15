"use client";
import ThemeProvider from "./ThemeProvider";
import PrefsProvider from "./PrefsProvider";
import LangProvider from "./LangProvider";
import ScrollTopFab from "./ScrollTopFab";
import PWA from "./PWA";

// App-wide client shell mounted once in the root layout: provides the theme,
// language, and per-device preferences to every screen, floats the
// scroll-to-top FAB (which the user can turn off in Preferences) over all
// pages, and wires up PWA behavior (service worker + install prompt).
export default function AppChrome({ children }) {
  return (
    <ThemeProvider>
      <PrefsProvider>
        <LangProvider>
          {children}
          <ScrollTopFab />
          <PWA />
        </LangProvider>
      </PrefsProvider>
    </ThemeProvider>
  );
}
