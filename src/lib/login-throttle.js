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
// The per-store backstop is a DISTRIBUTED-attack bound, and it escalates.
//
// Why it matters: the PIN is 6 digits and login matches it against every active
// user, so any one of S staff PINs wins. A flat 50-per-15-minutes was 1,752,000
// guesses a year — at S=6, ~10 expected breaks a year and a ~58% chance of one
// within 30 days.
//
// Two changes close most of that. Each consecutive trip of the cap lengthens the
// NEXT window (x4, capped at an hour), so a sustained grind can't keep buying a
// fresh batch every quarter hour; and the cap itself is 20, not 50:
//
//   50 / 15 min flat       1,752,000 guesses/yr   ~10.5 breaks/yr   ~58% in 30d
//   50 / 1 h escalated       438,000              ~2.6             ~19%
//   20 / 1 h escalated       175,200              ~1.05             ~8%
//
// 20 is safe for honest stores because it is not what bounds them. Staff share
// the shop Wi-Fi, so their typos land on ONE ip_ key and hit IP_LIMIT (10) long
// before the store-wide count matters — and a successful sign-in clears that IP
// counter, so a fumbled morning resets the moment anyone gets in. Reaching 20
// store-wide takes failures from MANY different addresses, which is the
// distributed attack this cap exists for and not a busy Tuesday.
//
// Strikes decay after a quiet day, so nothing is punished forever. The cost is a
// longer self-inflicted lockout: burning the cap once closed new sign-ins for 15
// minutes and now closes them for an hour. Bounded deliberately — a store must
// get its staff in within a shift — and already-signed-in staff are unaffected
// either way. See ops/security-audit-2026.md for the derivation and the
// remaining knobs (a longer PIN is the one that closes this outright).
export const STORE_LIMIT = {
  windowMs: 15 * 60 * 1000, maxFails: 20,
  backoffFactor: 4, maxWindowMs: 60 * 60 * 1000, strikeDecayMs: 24 * 60 * 60 * 1000,
};

// The public rewards-balance check shares the login cap's SHAPE but must not
// inherit its escalation. That surface counts EVERY request, not just failures,
// so a busy store's genuine customers can legitimately reach the cap at a rush —
// escalating them to an hour-long block would be an outage, not a defence.
// Brute force isn't the threat there either: the secret is a phone number the
// customer already knows, and the response carries no name. Same numbers as
// before this split, so rewards behaviour is unchanged.
export const BALANCE_STORE_LIMIT = { windowMs: 15 * 60 * 1000, maxFails: 50 };

// Store-code availability during signup. Unauthenticated and therefore a tenant
// enumeration surface, so it counts EVERY request, not just failures — a real
// signup tries a handful of names; a scraper walking prefixes hits the wall.
export const SLUG_CHECK_LIMIT = { windowMs: 15 * 60 * 1000, maxFails: 30 };
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

// Confirming an owner's email address. Both are per USER, not per IP: the
// caller is already signed in, so the account is the thing worth limiting and
// a shared office address can't throttle a colleague.
//
// Sends put mail on the wire at an address nobody has proved they own yet, so
// the button in front of a gated owner must not be an email cannon. Five an
// hour is plenty for "it didn't arrive, try again" and useless for flooding.
export const VERIFY_SEND_LIMIT = { windowMs: 60 * 60 * 1000, maxFails: 5 };
// Typed codes. Each code already dies after MAX_ATTEMPTS wrong guesses; this
// is the ceiling ACROSS codes, so asking for a fresh one can't buy an
// unlimited supply of guesses at six digits.
export const VERIFY_TRY_LIMIT = { windowMs: 15 * 60 * 1000, maxFails: 20 };

export function throttleDecision(record, now, limit) {
  const { windowMs, maxFails, backoffFactor = 1, maxWindowMs = 0, strikeDecayMs = 0 } = limit;
  // Strikes only exist for limiters that opt into escalation. They decay after a
  // quiet period so a key is never permanently degraded, and they are read
  // defensively: a malformed or absent value is simply no strikes.
  const escalates = backoffFactor > 1;
  const recorded = Math.max(0, Math.trunc(Number(record?.strikes)) || 0);
  const strikeAt = Number(record?.strikeAt);
  const decayed = escalates && strikeDecayMs && Number.isFinite(strikeAt) && now - strikeAt > strikeDecayMs;
  const strikes = escalates && !decayed ? recorded : 0;
  // Each strike multiplies the window, capped so a key always recovers. Math.pow
  // of a bounded-but-large strike count could overflow to Infinity, which the
  // cap absorbs — but clamp the exponent anyway so the arithmetic stays sane.
  const grown = windowMs * Math.pow(backoffFactor, Math.min(strikes, 32));
  const effWindowMs = escalates ? Math.min(grown, maxWindowMs || windowMs) : windowMs;

  const inWindow =
    !!record && Number.isFinite(record.windowStart) && now - record.windowStart < effWindowMs;
  const count = inWindow ? Number(record.count) || 0 : 0;
  const nextCount = inWindow ? count + 1 : 1;
  // This failure is the one that trips the cap — bank a strike exactly once per
  // window, not on every failure after the cap.
  const trips = escalates && count < maxFails && nextCount >= maxFails;

  return {
    blocked: inWindow && count >= maxFails,
    // How long until this key is usable again; 0 when it isn't blocked. Lets a
    // caller say "wait N minutes" instead of a bare "too many attempts".
    retryAfterMs: inWindow && count >= maxFails
      ? Math.max(0, record.windowStart + effWindowMs - now)
      : 0,
    // What to persist when this attempt fails: increment within a live window,
    // otherwise start a fresh window at `now`. Strike fields are added ONLY for
    // escalating limiters, so every other limiter's record shape is unchanged.
    nextOnFail: {
      count: nextCount,
      windowStart: inWindow ? record.windowStart : now,
      ...(escalates ? { strikes: trips ? strikes + 1 : strikes, strikeAt: now } : {}),
    },
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
