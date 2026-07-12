"use client";
import { useState } from "react";

// Renders a logo from `src`; falls back to the brass mark if it fails to
// load (bad URL, offline, blocked) so headers never look broken.
export default function Logo({ src = null, alt = "logo", size = 32, rounded = "rounded-lg" }) {
  const [failed, setFailed] = useState(false);
  const px = `${size}px`;

  if (failed || !src) {
    return (
      <div className={`${rounded} bg-brass grid place-items-center text-ink font-bold flex-shrink-0`}
        style={{ width: px, height: px, fontSize: size * 0.5 }}>
        ₵
      </div>
    );
  }
  return (
    // src is an arbitrary owner-supplied external URL (vendor.logoUrl), which
    // next/image can't optimize without whitelisting each domain in
    // images.remotePatterns — impractical here — and the onError-to-brass-mark
    // fallback needs a plain <img>.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={() => setFailed(true)}
      className={`${rounded} object-contain bg-white flex-shrink-0`}
      style={{ width: px, height: px }} />
  );
}
