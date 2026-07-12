"use client";
import { useEffect, useRef, useState } from "react";
import { useModalA11y } from "@/lib/use-modal-a11y";

// Camera barcode scanner. @zxing/browser is imported dynamically inside the
// open effect so it never loads on the server or in the initial bundle.
// Ported from the legacy inventory app, where the camera lifecycle survived
// an adversarial review: the stream stops on close, on unmount, and on
// detect; onDetected lives in a ref so parent re-renders never restart it.
export default function BarcodeScanner({ open, onClose, onDetected, title = "Scan barcode" }) {
  const videoRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
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
          throw new Error("Camera not available — needs HTTPS (or localhost) and a device camera.");
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(
          undefined, // default (usually rear) camera
          videoRef.current,
          (result, err, ctrl) => {
            if (cancelled) return;
            if (result) {
              ctrl.stop();
              onDetectedRef.current(result.getText());
            }
            // per-frame decode misses are expected; ignore err
          }
        );
        if (cancelled) controls.stop();
        else setStarting(false);
      } catch (e) {
        if (cancelled) return;
        setError(e?.name === "NotAllowedError" ? "Camera permission was denied."
          : e?.message || "Could not start the camera.");
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      try { controls?.stop(); } catch { /* already stopped */ }
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className="bg-surface rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <h2 className="font-semibold text-[15px]">{title}</h2>
          <button className="btn-ghost text-[13px] px-2.5 py-1" onClick={onClose} aria-label="Close"><span aria-hidden="true">✕</span></button>
        </div>
        <div className="relative bg-black aspect-[4/3]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {!error && (
            <div className="absolute inset-x-[12%] inset-y-[24%] border-[3px] border-white/85 rounded-xl pointer-events-none" />
          )}
          {(starting || error) && (
            <div className="absolute inset-0 grid place-items-center bg-black/55 text-white text-sm text-center px-6">
              {error || "Starting camera…"}
            </div>
          )}
        </div>
        <p className="px-4 py-3 text-xs text-muted leading-relaxed">
          Point the camera at the barcode. Nothing saves until you tap &ldquo;Save &amp; sign entry&rdquo;.
        </p>
      </div>
    </div>
  );
}
