"use client";
import { useEffect, useRef } from "react";
import { BrowserQRCodeSvgWriter } from "@zxing/library";

// Render `value` as a QR code (SVG) into a div. Client-only — the writer builds
// DOM. Used for the customer's loyalty QR on the /rewards page, which the store
// associate scans with the app's existing camera scanner to open the account.
export default function Qr({ value, size = 168, className = "", title }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.replaceChildren();
    if (!value) return;
    try {
      const svg = new BrowserQRCodeSvgWriter().write(String(value), size, size);
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
      svg.setAttribute("role", "img");
      if (title) svg.setAttribute("aria-label", title);
      el.appendChild(svg);
    } catch { /* an unencodable value just renders nothing */ }
  }, [value, size, title]);
  return <div ref={ref} className={className} />;
}
