// Pure auth cores — PIN policy + login throttle. No emulator needed.
// Run: node --test tests/auth.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidNewPin, PIN_LENGTH, PIN_RE } from "../src/lib/pin.js";
import { throttleDecision, attemptKey, IP_LIMIT, STORE_LIMIT } from "../src/lib/login-throttle.js";

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
  // 20 store-wide fails is under the store cap but over the per-IP cap
  assert.equal(throttleDecision({ count: 20, windowStart: T0 }, T0 + 1, STORE_LIMIT).blocked, false);
  assert.equal(throttleDecision({ count: 20, windowStart: T0 }, T0 + 1, IP_LIMIT).blocked, true);
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
