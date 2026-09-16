// Sliding-window login throttle, as a pure decision so the route only does I/O.
// The login route stores one counter doc per key — the client IP, and the store
// slug — as { count, windowStart }. This decides whether a key is currently
// blocked and what to write on a failure.
//
// Two independent limiters run together (block if EITHER trips):
//   • per-IP    — stops one machine hammering PINs.
//   • per-store — a backstop against a DISTRIBUTED attack on one store that
//                 rotates IPs to slip under the per-IP cap.
//
// The window auto-expires: once `windowStart` is older than `windowMs` the count
// resets, so a key is never locked permanently — a burst blocks only until the
// window rolls (minutes), and any successful sign-in clears both counters. The
// per-store cap is set well above what a busy store's honest typos could reach,
// so real staff aren't locked out; it only bites during an actual attack.
export const IP_LIMIT = { windowMs: 15 * 60 * 1000, maxFails: 10 };
export const STORE_LIMIT = { windowMs: 15 * 60 * 1000, maxFails: 50 };
// Developer login has a single credential and no store, so the per-IP cap alone
// lets an IP-rotating attacker get a fresh allowance per address. A global
// backstop bounds TOTAL dev-login failures per window across all IPs — well
// above the real developer's honest typos, so it only bites during an attack
// (and auto-expires with the window, like the others).
export const DEV_GLOBAL_LIMIT = { windowMs: 15 * 60 * 1000, maxFails: 60 };

// Account-recovery limits. These count EVERY attempt, not just failures: the
// request endpoint answers the same way whether or not an address existed
// (that's the point — no enumeration), so "failure" isn't observable to it.
//   • RESET_IP / RESET_STORE — asking for a recovery link. Deliberately tight:
//     a real person asks once or twice, and each request emails somebody.
//   • RECOVERY_CONFIRM_LIMIT — submitting a link back. The secret is 32 random
//     bytes, so this is a backstop against grinding, not the defence.
//   • PUBLIC_SUPPORT_LIMIT — the signed-out "I can't get in" form, which is the
//     one place an anonymous visitor can write anything at all.
export const RESET_IP_LIMIT = { windowMs: 15 * 60 * 1000, maxFails: 5 };
export const RESET_STORE_LIMIT = { windowMs: 60 * 60 * 1000, maxFails: 20 };
export const RECOVERY_CONFIRM_LIMIT = { windowMs: 15 * 60 * 1000, maxFails: 15 };
export const PUBLIC_SUPPORT_LIMIT = { windowMs: 60 * 60 * 1000, maxFails: 4 };

export function throttleDecision(record, now, { windowMs, maxFails }) {
  const inWindow =
    !!record && Number.isFinite(record.windowStart) && now - record.windowStart < windowMs;
  const count = inWindow ? Number(record.count) || 0 : 0;
  return {
    blocked: inWindow && count >= maxFails,
    // What to persist when this attempt fails: increment within a live window,
    // otherwise start a fresh window at `now`.
    nextOnFail: inWindow
      ? { count: count + 1, windowStart: record.windowStart }
      : { count: 1, windowStart: now },
  };
}

// Doc-id sanitizer for the loginAttempts collection (Firestore ids can't hold
// arbitrary characters; keep it bounded too).
export function attemptKey(raw) {
  return String(raw ?? "").replace(/[^a-zA-Z0-9:._-]/g, "_").slice(0, 200) || "unknown";
}

// Best-effort client IP for the rate limiters, resistant to a spoofed
// `X-Forwarded-For`. `getHeader(name)` returns a request header (or null/"").
// Preference order:
//   1. `x-real-ip` — the hosting platform (e.g. Vercel) sets this to the IP it
//      actually observed and overwrites any client-sent value, so it can't be forged.
//   2. the RIGHTMOST `x-forwarded-for` entry — the hop appended by the trusted
//      proxy, not the leftmost value a client can inject to dodge the per-IP cap
//      (the old code took [0], which an attacker fully controls).
// Falls back to "unknown", so unattributable requests share one bucket rather
// than each getting a fresh allowance.
export function clientIp(getHeader) {
  const real = String(getHeader("x-real-ip") || "").trim();
  if (real) return real;
  const parts = String(getHeader("x-forwarded-for") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "unknown";
}
