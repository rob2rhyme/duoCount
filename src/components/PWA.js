"use client";
import { useEffect } from "react";
import "@/lib/install"; // registers install-prompt listeners at load time

// Registers the service worker (production only, to avoid interfering with the
// dev server's hot-reload). Mounted once by AppChrome.
export default function PWA() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => { /* offline support is best-effort */ });
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
