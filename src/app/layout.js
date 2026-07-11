import "./globals.css";
import AppChrome from "@/components/AppChrome";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

export const metadata = {
  title: "DuoCount",
  description: "DuoCount — cash drawer, scratch-off & inventory tracking for retail teams",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.png", apple: "/logo.png" },
};

export const viewport = { themeColor: "#1a1c2e" };

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
