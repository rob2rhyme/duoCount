"use client";
import { useCallback, useEffect, useState } from "react";

// Captures the browser's `beforeinstallprompt` so the app can offer "Install"
// on its own terms (from Preferences, and from the one-time bottom-sheet
// banner) instead of relying on the browser's default mini-infobar. Listeners
// are registered at module load — imported early by <PWA/> — so the one-shot
// event isn't missed before React mounts. There must only ever be ONE
// listener pair in the app: the event is consumable, so a second module
// calling preventDefault() would race this one and leave one of them holding
// a dead event.
let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

// Sibling of duocount-theme / duocount-fab / duocount-lang. Per-device by
// design: "installed on this phone" is a property of the phone, not the user.
const DISMISS_KEY = "duocount-install-dismissed";
// Whether this device has ever completed a meaningful action (a saved count).
// The banner waits for it so a first-time visitor is never asked to install an
// app they haven't used yet. Persisted rather than session-scoped: someone who
// saved a count yesterday has already had the experience the banner is asking
// them to commit to, so making them save again first would just hide it.
const ACTED_KEY = "duocount-install-acted";

// localStorage throws in some privacy modes; a failure here must never break a
// count, so every access degrades to "no flag set".
const read = (k) => {
  try { return window.localStorage.getItem(k) === "1"; } catch { return false; }
};
const write = (k) => {
  try { window.localStorage.setItem(k, "1"); } catch { /* private mode — banner just reappears next visit */ }
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    write(DISMISS_KEY); // installed is the strongest possible "never show again"
    emit();
  });
}

/** Already running as an installed app? Then there is nothing to offer. */
function isInstalled() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches === true
    || window.navigator.standalone === true;
}

// iOS has no beforeinstallprompt — Add to Home Screen is a manual Share-sheet
// action, and ONLY Safari offers it. Chrome/Firefox/Edge/Opera on iOS (CriOS,
// FxiOS, EdgiOS, OPiOS) and the in-app webviews (Facebook, Instagram, X, Line)
// cannot install at all, so instructing their users would be a dead end.
function isIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  // iPadOS 13+ reports a Mac UA; touch points disambiguate it from a desktop.
  const ios = /iphone|ipod|ipad/i.test(ua)
    || (/macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua);
  const inApp = /FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|Snapchat/i.test(ua);
  return !otherBrowser && !inApp;
}

/**
 * Records that the user has done something worth installing for (a saved
 * count). Called from the shared onSaved path in AppShell — not from render,
 * so merely opening a form doesn't arm the banner.
 */
export function markInstallWorthy() {
  if (typeof window === "undefined" || read(ACTED_KEY)) return;
  write(ACTED_KEY);
  emit();
}

/**
 * `{ platform, canInstall, promptInstall, dismiss, visible }`.
 *
 * platform: "ios" (show Share-sheet instructions) | "prompt" (native install
 * button) | null (nothing we can offer — render nothing).
 * visible: the banner's own gate — platform is offerable AND the user has
 * saved something AND they have not dismissed or installed before.
 */
export function useInstallPrompt() {
  const [, force] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true); // defer all UA/storage reads past hydration
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const canInstall = ready && !!deferred;
  const platform = !ready || isInstalled() ? null : (deferred ? "prompt" : (isIosSafari() ? "ios" : null));
  const dismissed = ready && (read(DISMISS_KEY) || !read(ACTED_KEY));

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" }));
    deferred = null;
    if (choice.outcome === "accepted") write(DISMISS_KEY);
    emit();
    return choice.outcome === "accepted";
  }, []);

  const dismiss = useCallback(() => {
    write(DISMISS_KEY);
    emit();
  }, []);

  return {
    platform,
    canInstall,
    promptInstall,
    dismiss,
    visible: !!platform && !dismissed,
    // Back-compat for PreferencesMenu, which offers Install on demand and so
    // deliberately ignores the one-time banner gating above.
    available: canInstall,
  };
}
