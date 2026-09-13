"use client";
import { useInstallPrompt } from "@/lib/install";
import { useLang } from "./LangProvider";

// One-time "Add to Home Screen" bottom sheet. Two shapes, one layout:
//   • Android/Chrome (anything that fired beforeinstallprompt) → an Install
//     button that calls the captured prompt.
//   • iOS Safari → Share-sheet instructions, because iOS has no programmatic
//     install and the only route is the user's own two taps.
// Anything else renders nothing (see useInstallPrompt's platform detection).
//
// Icons are inline SVG rather than an icon package: the repo already inlines
// its icon set (DocIcon.js) so nothing external loads, and pulling a
// dependency in for two glyphs would be the only third-party UI code here.

// Apple's Share glyph — the box with an arrow leaving the top.
function ShareIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 3v13" /><path d="m8 7 4-4 4 4" />
      <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

// Plus-in-a-square — the "Add to Home Screen" row in the iOS share sheet.
function SquarePlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8" /><path d="M8 12h8" />
    </svg>
  );
}

export default function InstallBanner() {
  const { platform, promptInstall, dismiss, visible } = useInstallPrompt();
  const { t } = useLang();

  if (!visible) return null;

  return (
    // Sits above the mobile BottomNav (fixed, z-40) and below the toast (z-50),
    // matching the toast's own responsive offset so the two never stack oddly.
    // Non-blocking: no backdrop, nothing behind it becomes inert.
    <div
      role="dialog"
      aria-label={t("install.title")}
      className="fixed inset-x-0 bottom-20 sm:bottom-4 z-40 px-safe pb-safe pointer-events-none"
    >
      <div className="card pointer-events-auto mx-auto max-w-md p-3.5 shadow-lg sheet-pop">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-snug">{t("install.title")}</p>

            {platform === "ios" ? (
              <div className="mt-2.5 flex items-center gap-2 text-[12px] text-muted">
                <span className="flex items-center gap-1.5 min-w-0">
                  <ShareIcon className="h-4 w-4 shrink-0 text-gold" />
                  <span className="truncate">{t("install.ios_step1")}</span>
                </span>
                <span aria-hidden="true" className="text-faint shrink-0">→</span>
                <span className="flex items-center gap-1.5 min-w-0">
                  <SquarePlusIcon className="h-4 w-4 shrink-0 text-gold" />
                  <span className="truncate">{t("install.ios_step2")}</span>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { promptInstall(); }}
                className="btn-ghost mt-2.5 w-auto px-3.5 py-1.5 text-[13px] font-semibold"
              >
                {t("install.action")}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label={t("install.dismiss")}
            className="btn-ghost -mr-1 -mt-1 w-auto shrink-0 px-2 py-1 text-muted"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>
    </div>
  );
}
