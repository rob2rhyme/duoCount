//src/pages/_app.tsx
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "react-hot-toast";
import { Calistoga } from "next/font/google";

const calistoga = Calistoga({ subsets: ["latin"], weight: "400" });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <div className={calistoga.className}>
        <Toaster
          position="top-right"
          toastOptions={{ /* unchanged */ }}
        />
        <RequireAuth>
          <Component {...pageProps} />
        </RequireAuth>
      </div>
    </AuthProvider>
  );
}

// client-side route guard
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";
import { useEffect, ReactNode } from "react";

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // only redirect *after* we know auth status
    if (!loading && !isAuthenticated && router.pathname !== "/login") {
      router.replace(`/login?next=${encodeURIComponent(router.pathname)}`);
    }
  }, [isAuthenticated, loading, router]);

  // while checking auth or redirecting, you could show a loader here
  if (!isAuthenticated && router.pathname !== "/login") {
    return null;
  }
  // while we’re checking localStorage, don’t render anything (or show a loader)
  if (loading) {
    return null;
  }

  // once loading is false, either you’re authenticated (and render),
  // or you’re on /login (and render), or you’ve been sent to /login already.
  return <>{children}</>;
}
