import "./globals.css";
import AppChrome from "@/components/AppChrome";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

export const metadata = {
  title: "DuoCount",
  description: "DuoCount — cash drawer, scratch-off & inventory tracking for retail teams",
  applicationName: "DuoCount",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.png", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "DuoCount", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

// themeColor colors the standalone title/status bar (the app header is dark in
// both themes, so one dark value fits). viewportFit: cover exposes the
// env(safe-area-inset-*) values the header and FAB pad against on notched phones.
export const viewport = { themeColor: "#1a1c2e", viewportFit: "cover" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Set the theme before first paint so there's no light/dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
