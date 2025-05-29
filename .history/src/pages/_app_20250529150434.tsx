//src/pages/_app.tsx
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "react-hot-toast";
import { Calistoga } from "next/font/google";
import { useRouter } from "next/router";
import { ReactNode, useEffect } from "react";

const calistoga = Calistoga({ subsets: ["latin"], weight: "400" });

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated && router.pathname !== "/login") {
      router.replace(`/login?next=${encodeURIComponent(router.pathname)}`);
    }
  }, [isAuthenticated, loading, router]);

  if (loading || (!isAuthenticated && router.pathname !== "/login")) {
    // while we’re checking or redirecting, render nothing
    return null;
  }

  return <>{children}</>;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <div className={calistoga.className}>
        <Toaster position="top-right" />
        <RequireAuth>
          <Component {...pageProps} />
        </RequireAuth>
      </div>
    </AuthProvider>
  );
}
