"use client";
import ThemeProvider from "./ThemeProvider";
import ScrollTopFab from "./ScrollTopFab";

// App-wide client shell mounted once in the root layout: provides the theme
// context to every screen and floats the scroll-to-top FAB over all pages.
export default function AppChrome({ children }) {
  return (
    <ThemeProvider>
      {children}
      <ScrollTopFab />
    </ThemeProvider>
  );
}
