// TOTP (RFC 6238 over HOTP/RFC 4226) — the optional second factor on the
// developer login. SERVER ONLY (imports node:crypto), like dev-auth.js.
//
// Why here: /api/auth/dev accepts ONE static env password that unlocks every
// tenant through the Admin SDK. A password that never changes and lives in a
// deploy dashboard is exactly the credential a second factor is for. Set
// DEV_ADMIN_TOTP_SECRET (base32, from any authenticator app) and the login
// additionally demands a 6-digit code; leave it blank and the login behaves
// exactly as before, so this can't lock the developer out of their own console
// by merely being deployed.
//
// Self-contained on purpose (no new dependency): HMAC-SHA1 + dynamic
// truncation is ~20 lines and is verified here against the RFC's own vectors
// in tests/totp.test.mjs.
import { createHmac, timingSafeEqual } from "node:crypto";

export const STEP_SECONDS = 30;
export const DIGITS = 6;
// How many steps either side of "now" still count. One step (±30s) absorbs
// ordinary clock drift and the seconds a person spends typing, without
// meaningfully widening the guess window.
export const DEFAULT_WINDOW = 1;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Decode a base32 (RFC 4648) secret as an authenticator app shows it: spaces
 * and `=` padding are ignored, case doesn't matter. Returns a Buffer, or null
 * if the string holds anything that isn't base32 (so a typo'd env var fails
 * closed rather than silently authenticating against a truncated key).
 */
export function base32Decode(input) {
  const s = String(input ?? "").replace(/[\s=]/g, "").toUpperCase();
  if (!s) return null;
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const ch of s) {
    const idx = B32.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return bytes.length ? Buffer.from(bytes) : null;
}

/** RFC 4226 HOTP: HMAC-SHA1 of the 8-byte counter, dynamically truncated. */
export function hotp(key, counter, digits = DIGITS) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | ((mac[offset + 1] & 0xff) << 16)
    | ((mac[offset + 2] & 0xff) << 8) | (mac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** The code an authenticator shows for `secret` at `nowMs`. */
export function totpCode(secret, nowMs = Date.now(), { step = STEP_SECONDS, digits = DIGITS } = {}) {
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  if (!key) return null;
  return hotp(key, Math.floor(nowMs / 1000 / step), digits);
}

// Constant-time compare of two same-length digit strings; a length mismatch is
// rejected before the compare (timingSafeEqual throws on unequal lengths).
function sameCode(a, b) {
  const x = Buffer.from(String(a), "utf8");
  const y = Buffer.from(String(b), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Is `code` valid for `secret` right now? Checks ±`window` steps. Returns false
 * for a missing secret, an unparseable secret, or a non-6-digit input — never
 * throws, so a route can call it straight from user input.
 */
export function verifyTotp(secret, code, { now = Date.now(), window = DEFAULT_WINDOW, step = STEP_SECONDS, digits = DIGITS } = {}) {
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  if (!key) return false;
  const given = String(code ?? "").trim().replace(/\s/g, "");
  if (!new RegExp(`^\\d{${digits}}$`).test(given)) return false;
  const counter = Math.floor(now / 1000 / step);
  let ok = false;
  // Check every step in the window even after a hit, so a valid code doesn't
  // return measurably faster depending on WHERE in the window it matched.
  for (let i = -window; i <= window; i++) {
    if (counter + i < 0) continue;
    if (sameCode(hotp(key, counter + i, digits), given)) ok = true;
  }
  return ok;
}

/** Is a developer second factor configured? Blank/absent env => off. */
export function totpConfigured(env = process.env) {
  return !!base32Decode(env.DEV_ADMIN_TOTP_SECRET || "");
}
