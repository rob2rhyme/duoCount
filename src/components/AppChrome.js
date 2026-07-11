"use client";
import ThemeProvider from "./ThemeProvider";
import PrefsProvider from "./PrefsProvider";
import ScrollTopFab from "./ScrollTopFab";

// App-wide client shell mounted once in the root layout: provides the theme
// and per-device preferences to every screen, and floats the scroll-to-top FAB
// (which the user can turn off in Preferences) over all pages.
export default function AppChrome({ children }) {
  return (
    <ThemeProvider>
      <PrefsProvider>
        {children}
        <ScrollTopFab />
      </PrefsProvider>
    </ThemeProvider>
  );
}
