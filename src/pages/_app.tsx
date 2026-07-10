//src/pages/_app.tsx
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Toaster } from "react-hot-toast";
import { Calistoga } from "next/font/google";
import { useRouter } from "next/router";
import { ReactNode, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

// Loaded as a CSS variable for headings/branding only — body text stays on the
// system sans for a clean, professional feel.
const calistoga = Calistoga({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated && router.pathname !== "/login") {
      router.replace(`/login?next=${encodeURIComponent(router.pathname)}`);
    }
  }, [isAuthenticated, loading, router]);

  if (loading || (!isAuthenticated && router.pathname !== "/login")) {
    // while we're checking or redirecting, render nothing
    return null;
  }

  return <>{children}</>;
}

// Register the service worker for installable / offline PWA support.
function useServiceWorker() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* best-effort */
      });
    }
  }, []);
}

export default function App({ Component, pageProps }: AppProps) {
  useServiceWorker();

  return (
    <ThemeProvider>
      <AuthProvider>
        <div className={calistoga.variable}>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-md)",
                borderRadius: "12px",
              },
            }}
          />
          <RequireAuth>
            <Component {...pageProps} />
          </RequireAuth>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}
