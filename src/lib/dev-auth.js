// Developer (platform-admin) login credential check — SERVER ONLY (imports
// node:crypto). The developer isn't a store owner, so they don't sign in through
// a store PIN; they sign in with a dedicated email + password held as env
// secrets (DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD), the same shared-secret-in-env
// posture as CRON_SECRET. On a match, /api/auth/dev mints a Firebase custom
// token carrying a `platformAdmin: true` claim and NO vendorId — so it unlocks
// the /dev console (via the Admin SDK) but the tenant Firestore rules, which all
// require request.auth.token.vendorId, deny it everywhere else.
import { createHash, timingSafeEqual } from "node:crypto";

// Constant-time string equality. Compares SHA-256 digests so the compare is over
// fixed 32-byte buffers — no length leak, and no early-out on the first differing
// character (the naive === would leak how far the guess matched via timing).
function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a ?? ""), "utf8").digest();
  const hb = createHash("sha256").update(String(b ?? ""), "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Is the submitted developer credential valid against the configured env secret?
 * Both DEV_ADMIN_EMAIL and DEV_ADMIN_PASSWORD must be set (non-empty) — an unset
 * pair means the developer login is OFF and never matches, so a blank env can't
 * be bypassed with blank input. Email match is case-insensitive; password is exact.
 */
export function devCredentialsOk({ email, password } = {}, env = process.env) {
  const wantEmail = String(env.DEV_ADMIN_EMAIL || "").trim().toLowerCase();
  const wantPass = String(env.DEV_ADMIN_PASSWORD || "");
  if (!wantEmail || !wantPass) return false;
  const gotEmail = String(email ?? "").trim().toLowerCase();
  const gotPass = String(password ?? "");
  // Evaluate both sides regardless (no short-circuit) to keep timing flat.
  const okEmail = safeEqual(gotEmail, wantEmail);
  const okPass = safeEqual(gotPass, wantPass);
  return okEmail && okPass;
}
