// Security response headers, applied to every route. Kept intentionally small
// so they can't break the app:
//   • CSP is *only* `frame-ancestors 'none'` — the anti-clickjacking directive.
//     With no default-src/script-src it places NO restriction on Next's inline
//     bootstrap scripts or Firebase's XHR/WebSocket connections, so it's safe to
//     ship blanket. X-Frame-Options: DENY is the belt-and-suspenders equivalent
//     for browsers that predate CSP frame-ancestors.
//   • Permissions-Policy keeps `camera=(self)` — the scratch-off / barcode
//     scanner needs the camera on our own origin; disabling it would break
//     scanning. Microphone and geolocation are switched off (unused).
//   • HSTS is only honored over HTTPS (Vercel serves HTTPS), harmless elsewhere.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // firebase-admin must load from node_modules at runtime, never be bundled —
  // its dynamic require()s of grpc/protobuf don't survive bundling and would
  // crash the serverless function at cold start (before any handler try/catch
  // runs). Next 15 already externalizes it by default; this is an explicit
  // safety net that also covers Turbopack and nested-install edge cases.
  serverExternalPackages: ["firebase-admin"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};
export default nextConfig;
