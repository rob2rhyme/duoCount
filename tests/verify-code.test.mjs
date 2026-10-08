import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  randomCode, normalizeCode, isCodeShaped, codeState, attemptsLeft,
  needsEmailConfirm, CODE_DIGITS, MAX_ATTEMPTS,
} from "../src/lib/verify-code.js";

test("randomCode returns the asked-for number of digits, and only digits", () => {
  for (const n of [4, 6, 8]) {
    const c = randomCode(n, randomBytes);
    assert.equal(c.length, n, `length for ${n}`);
    assert.match(c, /^\d+$/, c);
  }
  assert.equal(randomCode(undefined, randomBytes).length, CODE_DIGITS);
});

test("randomCode rejects biased bytes instead of folding them in", () => {
  // The whole point of rejection sampling. 250..255 would map to 0..5 under
  // `% 10` and make the low digits ~20% likelier; they must be discarded.
  const feed = [250, 251, 252, 253, 254, 255, 7, 3];
  let i = 0;
  const bytes = (n) => Uint8Array.from({ length: n }, () => feed[i++ % feed.length]);
  assert.equal(randomCode(2, bytes), "73", "a byte >= 250 leaked into the code");
});

test("randomCode is uniform across digits", () => {
  // A modulo implementation passes every test above and still fails this one,
  // which is why it is here: 0-5 would come out ~20% more often than 6-9.
  const counts = new Array(10).fill(0);
  for (let i = 0; i < 4000; i++) for (const d of randomCode(6, randomBytes)) counts[Number(d)]++;
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / 10;
  for (let d = 0; d < 10; d++) {
    const drift = Math.abs(counts[d] - expected) / expected;
    assert.ok(drift < 0.12, `digit ${d} drifted ${(drift * 100).toFixed(1)}% from uniform`);
  }
});

test("randomCode refuses a bad length or a missing byte source", () => {
  // Failing closed matters more than usual here: a silently short or
  // non-random code is indistinguishable from a working one in the output.
  for (const bad of [0, -1, 1.5, "6", null]) {
    assert.throws(() => randomCode(bad, randomBytes), /bad digits/, String(bad));
  }
  assert.throws(() => randomCode(6), /byte source/);
  assert.throws(() => randomCode(6, "nope"), /byte source/);
});

test("normalizeCode forgives how people copy codes out of email", () => {
  assert.equal(normalizeCode(" 123 456 "), "123456");
  assert.equal(normalizeCode("123-456"), "123456");
  assert.equal(normalizeCode("123 456".replace(/ /g, " ")), "123456");
  assert.equal(normalizeCode(null), "");
  assert.equal(normalizeCode(undefined), "");
});

test("isCodeShaped gates the cheap check before any hashing", () => {
  assert.equal(isCodeShaped("123456"), true);
  assert.equal(isCodeShaped(" 123 456"), true);
  for (const bad of ["12345", "1234567", "12345a", "", null, undefined, "      "]) {
    assert.equal(isCodeShaped(bad), false, JSON.stringify(bad));
  }
});

test("codeState names each dead end separately", () => {
  const live = { codeHash: "h", expiresAt: 2000, codeAttempts: 0, usedAt: null };
  assert.equal(codeState(live, 1000), "ok");
  assert.equal(codeState(live, 3000), "expired");
  assert.equal(codeState({ ...live, usedAt: new Date() }, 1000), "used");
  assert.equal(codeState({ ...live, codeAttempts: MAX_ATTEMPTS }, 1000), "locked");
  assert.equal(codeState({ ...live, codeAttempts: MAX_ATTEMPTS + 3 }, 1000), "locked");
  // A link-only token (minted before codes existed) has no code to check.
  assert.equal(codeState({ expiresAt: 2000 }, 1000), "missing");
  assert.equal(codeState(null, 1000), "missing");
});

test("codeState checks used and expired before the attempt count", () => {
  // A burnt or stale token must not be reported as "locked" — the screen would
  // tell the owner to stop guessing when the real answer is "ask for another".
  const doc = { codeHash: "h", expiresAt: 2000, codeAttempts: MAX_ATTEMPTS, usedAt: new Date() };
  assert.equal(codeState(doc, 1000), "used");
  assert.equal(codeState({ ...doc, usedAt: null }, 3000), "expired");
});

test("attemptsLeft counts down and floors at zero", () => {
  assert.equal(attemptsLeft({ codeAttempts: 0 }), MAX_ATTEMPTS);
  assert.equal(attemptsLeft({ codeAttempts: 2 }), MAX_ATTEMPTS - 2);
  assert.equal(attemptsLeft({ codeAttempts: MAX_ATTEMPTS + 5 }), 0);
  assert.equal(attemptsLeft({}), MAX_ATTEMPTS);
  assert.equal(attemptsLeft(null), MAX_ATTEMPTS);
});

test("needsEmailConfirm gates owners, and only owners", () => {
  const at = new Date();
  assert.equal(needsEmailConfirm({ role: "owner", email: "a@b.com" }), true);
  assert.equal(needsEmailConfirm({ role: "owner" }), true, "no address is also unreachable");
  assert.equal(needsEmailConfirm({ role: "owner", email: "a@b.com", emailVerifiedAt: at }), false);

  // Staff never chose the address and cannot change it; gating them would
  // strand a shift behind somebody else's inbox.
  for (const role of ["manager", "employee", undefined, null]) {
    assert.equal(needsEmailConfirm({ role, email: "a@b.com" }), false, String(role));
  }
  // A disabled owner is not being asked to do anything.
  assert.equal(needsEmailConfirm({ role: "owner", active: false }), false);
  assert.equal(needsEmailConfirm(null), false);
  assert.equal(needsEmailConfirm(undefined), false);
});
