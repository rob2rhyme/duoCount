"use client";
import { useEffect, useRef, useState } from "react";
import { useModalA11y } from "@/lib/use-modal-a11y";
import { useLang } from "./LangProvider";

// Camera barcode scanner. @zxing/browser is imported dynamically inside the
// open effect so it never loads on the server or in the initial bundle.
// Ported from the legacy inventory app, where the camera lifecycle survived
// an adversarial review: the stream stops on close, on unmount, and on
// detect; onDetected lives in a ref so parent re-renders never restart it.
//
// `continuous` keeps the camera running after a detect (the scratch shelf
// walk: scan pack after pack without reopening) — repeated frames of the SAME
// code are debounced so one pack doesn't fire twice, but a different code
// fires immediately. `status` renders the parent's per-scan feedback line
// under the video ("✓ Lucky 7s · #042 — 12 scanned").
export default function BarcodeScanner({ open, onClose, onDetected, title, hint, continuous = false, status = "" }) {
  const { t } = useLang();
  const videoRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const lastRef = useRef({ text: "", ts: 0 }); // continuous-mode dedupe
  // Errors are stored as i18n codes and translated at render, so a language
  // switch mid-error re-renders in the new language.
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const panelRef = useModalA11y(onClose, open);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let controls = null;
    setError("");
    setStarting(true);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw Object.assign(new Error("Camera not available"), { code: "scan.err_unavailable" });
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(
          undefined, // default (usually rear) camera
          videoRef.current,
          (result, err, ctrl) => {
            if (cancelled) return;
            if (result) {
              const text = result.getText();
              if (continuous) {
                // Same code within the window = the same pack still in frame.
                const now = Date.now();
                if (text === lastRef.current.text && now - lastRef.current.ts < 2500) return;
                lastRef.current = { text, ts: now };
                try { navigator.vibrate?.(60); } catch { /* not supported */ }
                onDetectedRef.current(text);
                return; // keep scanning
              }
              ctrl.stop();
              onDetectedRef.current(text);
            }
            // per-frame decode misses are expected; ignore err
          }
        );
        if (cancelled) controls.stop();
        else setStarting(false);
      } catch (e) {
        if (cancelled) return;
        setError(e?.name === "NotAllowedError" ? "scan.err_denied" : e?.code || "scan.err_start");
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      try { controls?.stop(); } catch { /* already stopped */ }
    };
  }, [open]);

  if (!open) return null;
  const shownTitle = title || t("scan.default_title");
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={shownTitle}
        className="bg-surface rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <h2 className="font-semibold text-[15px]">{shownTitle}</h2>
          <button className="btn-ghost text-[13px] px-2.5 py-1" onClick={onClose} aria-label={t("shell.close")}><span aria-hidden="true">✕</span></button>
        </div>
        <div className="relative bg-black aspect-[4/3]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {!error && (
            <div className="absolute inset-x-[12%] inset-y-[24%] border-[3px] border-white/85 rounded-xl pointer-events-none" />
          )}
          {(starting || error) && (
            <div className="absolute inset-0 grid place-items-center bg-black/55 text-white text-sm text-center px-6">
              {error ? t(error) : t("scan.starting")}
            </div>
          )}
        </div>
        {continuous && status && (
          <p className="px-4 pt-3 text-[13px] font-semibold text-pos" role="status">{status}</p>
        )}
        <p className="px-4 py-3 text-xs text-muted leading-relaxed">
          {t("scan.point")} {hint || t("scan.default_hint")}
        </p>
        {continuous && (
          <div className="px-4 pb-4">
            <button type="button" className="btn-primary" onClick={onClose}>{t("scan.done")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
