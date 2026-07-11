"use client";
import { useEffect, useState } from "react";

// Captures the browser's `beforeinstallprompt` so the app can offer "Install"
// on its own terms (from Preferences) instead of relying on the browser's
// default mini-infobar. Listeners are registered at module load — imported
// early by <PWA/> — so the one-shot event isn't missed before React mounts.
let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(!!deferred));

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export function useInstallPrompt() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    setAvailable(!!deferred);
    const fn = (v) => setAvailable(v);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const promptInstall = async () => {
    if (!deferred) return false;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" }));
    deferred = null;
    emit();
    return choice.outcome === "accepted";
  };

  return { available, promptInstall };
}
