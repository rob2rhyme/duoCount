// Pure auth cores — PIN policy + login throttle. No emulator needed.
// Run: node --test tests/auth.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidNewPin, PIN_LENGTH, PIN_RE } from "../src/lib/pin.js";
import {
  throttleDecision, attemptKey, IP_LIMIT, STORE_LIMIT, clientIp,
  RESET_IP_LIMIT, RESET_STORE_LIMIT, RECOVERY_CONFIRM_LIMIT, PUBLIC_SUPPORT_LIMIT,
  SLUG_CHECK_LIMIT, BALANCE_STORE_LIMIT,
} from "../src/lib/login-throttle.js";

test("PIN policy: new pins must be exactly 6 digits", () => {
  assert.equal(PIN_LENGTH, 6);
  assert.ok(isValidNewPin("123456"));
  assert.ok(isValidNewPin("000000"));
  for (const bad of ["1234", "12345", "1234567", "12a456", "", "  123456", "123 56", null, undefined]) {
    assert.equal(isValidNewPin(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
  // a numeric type is coerced to its string form (harmless — still 6 digits)
  assert.ok(isValidNewPin(123456));
  assert.equal(isValidNewPin(12345), false);
  assert.ok(PIN_RE.test("654321"));
});

const WIN = IP_LIMIT.windowMs;
const T0 = 1_000_000_000_000; // fixed epoch (Date.now unavailable in tests is fine — literal)

test("throttle: no record => allowed, and the first failure opens a window", () => {
  const d = throttleDecision(null, T0, IP_LIMIT);
  assert.equal(d.blocked, false);
  assert.deepEqual(d.nextOnFail, { count: 1, windowStart: T0 });
});

test("throttle: increments within a live window and blocks at the cap", () => {
  const rec = { count: IP_LIMIT.maxFails - 1, windowStart: T0 };
  const d1 = throttleDecision(rec, T0 + 1000, IP_LIMIT);
  assert.equal(d1.blocked, false); // 9 < 10
  assert.deepEqual(d1.nextOnFail, { count: IP_LIMIT.maxFails, windowStart: T0 });

  const atCap = throttleDecision({ count: IP_LIMIT.maxFails, windowStart: T0 }, T0 + 1000, IP_LIMIT);
  assert.equal(atCap.blocked, true); // 10 >= 10
});

test("throttle: an expired window resets — never a permanent lock", () => {
  const stale = { count: 999, windowStart: T0 };
  const d = throttleDecision(stale, T0 + WIN + 1, IP_LIMIT);
  assert.equal(d.blocked, false, "past the window, the huge count no longer blocks");
  assert.deepEqual(d.nextOnFail, { count: 1, windowStart: T0 + WIN + 1 }, "and a fresh window starts");
});

test("throttle: per-store cap is higher than per-IP (distributed-attack backstop, not everyday typos)", () => {
  assert.ok(STORE_LIMIT.maxFails > IP_LIMIT.maxFails);
  // Derived rather than hard-coded, so tuning either cap can't silently make
  // this assert nothing (a literal 20 stopped meaning "between" when the store
  // cap came down from 50).
  const between = Math.floor((IP_LIMIT.maxFails + STORE_LIMIT.maxFails) / 2);
  assert.ok(between > IP_LIMIT.maxFails && between < STORE_LIMIT.maxFails, "caps must leave a gap");
  assert.equal(throttleDecision({ count: between, windowStart: T0 }, T0 + 1, STORE_LIMIT).blocked, false);
  assert.equal(throttleDecision({ count: between, windowStart: T0 }, T0 + 1, IP_LIMIT).blocked, true);
});

test("honest shared-Wi-Fi typos hit the per-IP cap long before the store cap", () => {
  // This is what makes a store cap of 20 safe: a shop's staff share one public
  // IP, so their failures land on ONE ip_ key. The per-IP cap has to bite first
  // within the same window, or the distributed-attack backstop would be locking
  // out real staff — and a successful sign-in clears the IP counter, so a
  // fumbled morning resets as soon as anyone gets in.
  assert.ok(IP_LIMIT.windowMs <= STORE_LIMIT.windowMs, "compare over the same window");
  assert.ok(IP_LIMIT.maxFails < STORE_LIMIT.maxFails);
  const atIpCap = { count: IP_LIMIT.maxFails, windowStart: T0 };
  assert.equal(throttleDecision(atIpCap, T0 + 1, IP_LIMIT).blocked, true, "the shop's IP is stopped");
  assert.equal(throttleDecision(atIpCap, T0 + 1, STORE_LIMIT).blocked, false, "the store is not");
});

test("throttle: malformed records don't block and start a clean window", () => {
  for (const bad of [{}, { count: "x", windowStart: "y" }, { count: 5 }, { windowStart: T0 }]) {
    const d = throttleDecision(bad, T0, IP_LIMIT);
    assert.equal(d.blocked, false);
    assert.equal(d.nextOnFail.windowStart, bad.windowStart && Number.isFinite(bad.windowStart) ? bad.windowStart : T0);
  }
});

test("attemptKey sanitizes and bounds doc ids", () => {
  assert.equal(attemptKey("1.2.3.4"), "1.2.3.4");
  assert.equal(attemptKey("smokers-haven"), "smokers-haven");
  assert.equal(attemptKey("a/b c$d"), "a_b_c_d");
  assert.equal(attemptKey(""), "unknown");
  assert.equal(attemptKey(null), "unknown");
  assert.equal(attemptKey("x".repeat(500)).length, 200);
});

// clientIp — resilient to a spoofed X-Forwarded-For (see login-throttle.js).
const hdr = (m) => (name) => m[name] ?? null;

test("clientIp prefers the un-spoofable x-real-ip", () => {
  assert.equal(
    clientIp(hdr({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "9.9.9.9, 203.0.113.7" })),
    "203.0.113.7");
});

test("clientIp uses the rightmost XFF hop, not the spoofable leftmost", () => {
  // attacker injects a fake leftmost value; the trusted proxy appends the real IP
  assert.equal(clientIp(hdr({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" })), "203.0.113.7");
  assert.equal(clientIp(hdr({ "x-forwarded-for": "203.0.113.7" })), "203.0.113.7");
});

test("clientIp falls back to 'unknown' with no usable forwarding headers", () => {
  assert.equal(clientIp(() => null), "unknown");
  assert.equal(clientIp(hdr({ "x-forwarded-for": "  , ,  " })), "unknown");
});

/* ------------------------- account-recovery limits ------------------------- */

test("asking for a reset link is capped far tighter than signing in — every request emails somebody", () => {
  assert.ok(RESET_IP_LIMIT.maxFails < IP_LIMIT.maxFails);
  // Compared as a RATE, not a raw count: the reset limiter runs an hour-long
  // window against sign-in's quarter hour, so equal counts are four times
  // tighter. Comparing counts only worked while the windows happened to match.
  const rate = (L) => L.maxFails / L.windowMs;
  assert.ok(rate(RESET_STORE_LIMIT) < rate(STORE_LIMIT),
    `reset ${rate(RESET_STORE_LIMIT)}/ms must be tighter than login ${rate(STORE_LIMIT)}/ms`);
  // Per-store is still looser than per-IP, so one shop's staff sharing a Wi-Fi
  // IP can't be locked out by a per-store cap meant for a distributed attack.
  assert.ok(RESET_STORE_LIMIT.maxFails > RESET_IP_LIMIT.maxFails);
});

test("the signed-out help form is the strictest limiter — it's the only anonymous write", () => {
  assert.ok(PUBLIC_SUPPORT_LIMIT.maxFails <= RESET_IP_LIMIT.maxFails);
  assert.ok(PUBLIC_SUPPORT_LIMIT.windowMs >= 60 * 60 * 1000); // an hour or more
});

test("every recovery window expires, so no limiter can lock someone out permanently", () => {
  for (const limit of [RESET_IP_LIMIT, RESET_STORE_LIMIT, RECOVERY_CONFIRM_LIMIT, PUBLIC_SUPPORT_LIMIT]) {
    assert.ok(limit.windowMs > 0 && limit.maxFails > 0);
    const tripped = { count: limit.maxFails, windowStart: 0 };
    assert.equal(throttleDecision(tripped, limit.windowMs - 1, limit).blocked, true);
    assert.equal(throttleDecision(tripped, limit.windowMs, limit).blocked, false); // window rolled
  }
});

test("recovery counters share the loginAttempts collection under distinct, sanitized keys", () => {
  // The routes prefix their doc ids (reset_ip_…, reset_store_…, reset_confirm_…,
  // verify_…, help_…) so a recovery burst can never eat a sign-in allowance.
  assert.equal(`reset_ip_${attemptKey("203.0.113.9")}`, "reset_ip_203.0.113.9");
  assert.equal(`reset_store_${attemptKey("acme market/../x")}`, "reset_store_acme_market_.._x");
});

/* ------------------- escalating store backoff (security audit) ------------- */
// A flat 50-per-15-minutes is ~1.75M guesses a year against a 6-digit PIN that
// login matches against EVERY active user, so any of S staff PINs wins. These
// assert the escalation that cuts that budget, and the recovery that keeps it
// from becoming a permanent lock.

const S = STORE_LIMIT;
const capped = (n) => Math.min(S.windowMs * S.backoffFactor ** n, S.maxWindowMs);

test("store limiter escalates: tripping the cap lengthens the NEXT window", () => {
  assert.ok(S.backoffFactor > 1 && S.maxWindowMs > S.windowMs, "escalation must be configured");

  // The failure that reaches the cap banks exactly one strike...
  const trip = throttleDecision({ count: S.maxFails - 1, windowStart: T0 }, T0 + 1, S);
  assert.equal(trip.blocked, false, "the capping failure is still allowed through");
  assert.equal(trip.nextOnFail.strikes, 1);

  // ...and further failures in the same window do NOT keep banking strikes.
  const after = throttleDecision({ count: S.maxFails + 5, windowStart: T0, strikes: 1, strikeAt: T0 }, T0 + 2, S);
  assert.equal(after.blocked, true);
  assert.equal(after.nextOnFail.strikes, 1, "one strike per window, not per failure");
});

test("store limiter: a struck key stays blocked past the base window", () => {
  const rec = { count: S.maxFails, windowStart: T0, strikes: 1, strikeAt: T0 };
  // Just past the ORIGINAL 15-minute window the flat limiter would have reopened.
  assert.equal(throttleDecision(rec, T0 + S.windowMs + 1, S).blocked, true,
    "escalated window is still live — this is the whole point of the fix");
  // Past the escalated window it reopens.
  assert.equal(throttleDecision(rec, T0 + capped(1) + 1, S).blocked, false);
});

test("store limiter: the wait is reported, and is never unbounded", () => {
  const rec = { count: S.maxFails, windowStart: T0, strikes: 99, strikeAt: T0 };
  const d = throttleDecision(rec, T0 + 1000, S);
  assert.equal(d.blocked, true);
  assert.ok(d.retryAfterMs > 0 && d.retryAfterMs <= S.maxWindowMs,
    `retryAfterMs ${d.retryAfterMs} must be positive and capped at ${S.maxWindowMs}`);
  // A huge strike count must not overflow the window to Infinity.
  assert.ok(Number.isFinite(d.retryAfterMs));
});

test("store limiter: strikes decay after a quiet period — never a permanent lock", () => {
  const rec = { count: S.maxFails, windowStart: T0, strikes: 4, strikeAt: T0 };
  const quiet = T0 + S.strikeDecayMs + 1;
  const d = throttleDecision(rec, quiet, S);
  assert.equal(d.blocked, false, "a quiet day clears the escalation");
  assert.equal(d.nextOnFail.strikes, 0);
  assert.equal(d.nextOnFail.count, 1, "and a fresh window opens");
});

test("store limiter: malformed strike fields are treated as no strikes", () => {
  for (const bad of [{ strikes: "x" }, { strikes: -5 }, { strikes: null }, { strikeAt: "nope" }]) {
    const d = throttleDecision({ count: 1, windowStart: T0, ...bad }, T0 + 1, S);
    assert.equal(d.blocked, false);
    assert.ok(d.nextOnFail.strikes >= 0 && Number.isFinite(d.nextOnFail.strikes));
  }
});

test("non-escalating limiters keep their exact record shape (no strike fields)", () => {
  // Guards the blast radius: the fix must not change what any other limiter writes.
  for (const L of [IP_LIMIT, RESET_IP_LIMIT, RESET_STORE_LIMIT, RECOVERY_CONFIRM_LIMIT, PUBLIC_SUPPORT_LIMIT, SLUG_CHECK_LIMIT, BALANCE_STORE_LIMIT]) {
    assert.deepEqual(Object.keys(throttleDecision(null, T0, L).nextOnFail).sort(), ["count", "windowStart"]);
  }
});

test("slug-availability limiter exists and is tighter than the login IP cap is loose", () => {
  // /api/auth/check-slug is unauthenticated and counts EVERY request, so the cap
  // is a request budget for a real signup, not a failure budget.
  assert.ok(SLUG_CHECK_LIMIT.maxFails > 0 && SLUG_CHECK_LIMIT.windowMs > 0);
  assert.equal(throttleDecision({ count: SLUG_CHECK_LIMIT.maxFails, windowStart: T0 }, T0 + 1, SLUG_CHECK_LIMIT).blocked, true);
});

test("the rewards balance check does NOT inherit the login escalation", () => {
  // It counts EVERY request, so a busy store's real customers can reach the cap
  // at a rush. Escalating them to an hour would be an outage, not a defence.
  assert.ok(!(BALANCE_STORE_LIMIT.backoffFactor > 1), "must not escalate");
  const rec = { count: BALANCE_STORE_LIMIT.maxFails, windowStart: T0 };
  assert.equal(throttleDecision(rec, T0 + 1, BALANCE_STORE_LIMIT).blocked, true);
  assert.equal(throttleDecision(rec, T0 + BALANCE_STORE_LIMIT.windowMs + 1, BALANCE_STORE_LIMIT).blocked, false,
    "and it always reopens on the base window");
});

test("the email-confirm limits are per-user and tight enough to matter", async () => {
  const { VERIFY_SEND_LIMIT, VERIFY_TRY_LIMIT } = await import("../src/lib/login-throttle.js");
  const { MAX_ATTEMPTS } = await import("../src/lib/verify-code.js");

  // Sending puts mail on the wire at an address nobody has proved they own
  // yet, and the button is right in front of a gated owner — so this is the
  // one that must not be generous.
  assert.ok(VERIFY_SEND_LIMIT.maxFails <= 5, "resend allowance is an email cannon");
  assert.equal(VERIFY_SEND_LIMIT.windowMs, 60 * 60 * 1000);

  // Guessing must be bounded ACROSS codes, or asking for a fresh one buys
  // another MAX_ATTEMPTS forever. Compared as a rate so the assertion survives
  // someone retuning either window.
  const triesPerHour = VERIFY_TRY_LIMIT.maxFails * (3600000 / VERIFY_TRY_LIMIT.windowMs);
  assert.ok(triesPerHour < 1000, `${triesPerHour} guesses/hour against a 6-digit code is too many`);
  assert.ok(VERIFY_TRY_LIMIT.maxFails > MAX_ATTEMPTS,
    "the across-code ceiling must leave room for at least one full code");
});

test("a blocked verify limiter reports how long to wait, and clears", async () => {
  const { throttleDecision, VERIFY_SEND_LIMIT } = await import("../src/lib/login-throttle.js");
  const now = 1_000_000;
  const spent = { windowStart: now, count: VERIFY_SEND_LIMIT.maxFails };
  const d = throttleDecision(spent, now + 1000, VERIFY_SEND_LIMIT);
  assert.equal(d.blocked, true);
  assert.ok(d.retryAfterMs > 0, "a blocked send gave no retry hint");
  assert.equal(throttleDecision(spent, now + VERIFY_SEND_LIMIT.windowMs + 1, VERIFY_SEND_LIMIT).blocked, false);
});
