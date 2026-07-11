import "./globals.css";

export const metadata = {
  title: "DuoCount",
  description: "DuoCount — cash drawer, scratch-off & inventory tracking for retail teams",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.png", apple: "/logo.png" },
};

export const viewport = { themeColor: "#1a1c2e" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
