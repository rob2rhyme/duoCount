// src/components/BarcodeScanner.tsx
// Camera barcode scanner. ZXing is imported dynamically inside an effect so it
// never loads on the server or in the initial bundle.
import React, { useEffect, useRef, useState } from "react";
import styles from "@/styles/BarcodeScanner.module.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  title?: string;
}

const BarcodeScanner: React.FC<Props> = ({
  isOpen,
  onClose,
  onDetected,
  title = "Scan barcode",
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>("");
  const [starting, setStarting] = useState(true);

  // Keep the latest onDetected in a ref so the camera effect depends only on
  // `isOpen` — otherwise a new inline callback each parent render would tear
  // down and restart the camera.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    // Controls object returned by ZXing so we can stop the camera on cleanup.
    let controls: { stop: () => void } | null = null;

    setError("");
    setStarting(true);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera not available on this device/browser.");
        }
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();

        controls = await reader.decodeFromVideoDevice(
          undefined, // default (usually rear) camera
          videoRef.current!,
          (result, err, ctrl) => {
            if (cancelled) return;
            if (result) {
              const text = result.getText();
              ctrl.stop();
              onDetectedRef.current(text);
            }
            // `err` fires continuously for frames without a code — ignore it.
          }
        );
        if (cancelled) controls.stop();
        else setStarting(false);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg =
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Camera permission was denied."
            : e instanceof Error
            ? e.message
            : "Could not start the camera.";
        setError(msg);
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      try {
        controls?.stop();
      } catch {
        /* ignore */
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span>{title}</span>
          <button
            className={styles.close}
            onClick={onClose}
            aria-label="Close scanner"
          >
            ✕
          </button>
        </div>

        <div className={styles.viewport}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className={styles.video} playsInline muted />
          {!error && <div className={styles.reticle} />}
          {starting && !error && (
            <div className={styles.overlayText}>Starting camera…</div>
          )}
          {error && <div className={styles.overlayText}>{error}</div>}
        </div>

        <p className={styles.hint}>
          Point the camera at a barcode. Requires camera permission (HTTPS or
          localhost).
        </p>
      </div>
    </div>
  );
};

export default BarcodeScanner;
