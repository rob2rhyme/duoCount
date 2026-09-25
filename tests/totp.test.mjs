// TOTP second factor for the developer login, checked against the RFC's own
// vectors. Run: npm run test:totp
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { base32Decode, base32Encode, hotp, totpCode, verifyTotp, totpConfigured, STEP_SECONDS } from "../src/lib/totp.js";

// RFC 4226 / 6238 test key: the ASCII string "12345678901234567890".
const KEY_ASCII = "12345678901234567890";
const KEY_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("base32Decode matches the RFC test key and tolerates spacing/case/padding", () => {
  assert.equal(base32Decode(KEY_B32).toString("utf8"), KEY_ASCII);
  assert.equal(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq").toString("utf8"), KEY_ASCII);
  assert.equal(base32Decode("MZXW6===").toString("utf8"), "foo");
});

test("base32Decode fails closed on junk and on empty input", () => {
  assert.equal(base32Decode("not-base32!"), null);   // '!' and '-' aren't in the alphabet
  assert.equal(base32Decode("MZXW6180"), null);      // 1, 8, 0 aren't base32 digits
  assert.equal(base32Decode(""), null);
  assert.equal(base32Decode(null), null);
});

test("hotp reproduces the RFC 4226 Appendix D values", () => {
  const key = Buffer.from(KEY_ASCII, "utf8");
  const want = ["755224", "287082", "359152", "969429", "338314",
    "254676", "287922", "162583", "399871", "520489"];
  want.forEach((code, counter) => assert.equal(hotp(key, counter), code, `counter ${counter}`));
});

test("totpCode reproduces the RFC 6238 Appendix B times (6-digit truncation)", () => {
  const cases = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"],
    [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]];
  for (const [secs, code] of cases)
    assert.equal(totpCode(KEY_B32, secs * 1000), code, `t=${secs}`);
});

test("verifyTotp accepts the current code and the neighbouring steps", () => {
  const now = 1111111109 * 1000;
  assert.equal(verifyTotp(KEY_B32, "081804", { now }), true);
  // previous and next step, still inside the default ±1 window
  assert.equal(verifyTotp(KEY_B32, totpCode(KEY_B32, now - STEP_SECONDS * 1000), { now }), true);
  assert.equal(verifyTotp(KEY_B32, totpCode(KEY_B32, now + STEP_SECONDS * 1000), { now }), true);
});

test("verifyTotp rejects a code two steps away — the window is bounded", () => {
  const now = 1111111109 * 1000;
  assert.equal(verifyTotp(KEY_B32, totpCode(KEY_B32, now - 2 * STEP_SECONDS * 1000), { now }), false);
  assert.equal(verifyTotp(KEY_B32, totpCode(KEY_B32, now + 2 * STEP_SECONDS * 1000), { now }), false);
});

test("verifyTotp refuses malformed input without throwing", () => {
  const now = 1111111109 * 1000;
  for (const bad of ["", "  ", "12345", "1234567", "abcdef", null, undefined, "0818040"])
    assert.equal(verifyTotp(KEY_B32, bad, { now }), false, String(bad));
});

test("verifyTotp accepts a code typed with the spacing authenticator apps show", () => {
  const now = 1111111109 * 1000;
  assert.equal(verifyTotp(KEY_B32, "08 18 04", { now }), true);
  assert.equal(verifyTotp(KEY_B32, " 081804 ", { now }), true);
});

test("verifyTotp fails closed when the secret is missing or unparseable", () => {
  const now = 1111111109 * 1000;
  assert.equal(verifyTotp("", "081804", { now }), false);
  assert.equal(verifyTotp(null, "081804", { now }), false);
  assert.equal(verifyTotp("not-base32!", "081804", { now }), false);
});

test("totpConfigured is off unless the env secret parses — a blank env never demands a code", () => {
  assert.equal(totpConfigured({}), false);
  assert.equal(totpConfigured({ DEV_ADMIN_TOTP_SECRET: "" }), false);
  assert.equal(totpConfigured({ DEV_ADMIN_TOTP_SECRET: "   " }), false);
  assert.equal(totpConfigured({ DEV_ADMIN_TOTP_SECRET: "nope!" }), false);
  assert.equal(totpConfigured({ DEV_ADMIN_TOTP_SECRET: KEY_B32 }), true);
});

/* --------------------------- base32Encode --------------------------------- */
// The generator side. A secret is typed into an authenticator once and then
// trusted forever, so "it round-trips through the verifier's own decoder" is
// the property that matters — not the string's appearance.

test("base32Encode matches RFC 4648's own vectors", () => {
  const v = [["", ""], ["f", "MY"], ["fo", "MZXQ"], ["foo", "MZXW6"],
             ["foob", "MZXW6YQ"], ["fooba", "MZXW6YTB"], ["foobar", "MZXW6YTBOI"]];
  for (const [plain, encoded] of v) assert.equal(base32Encode(Buffer.from(plain, "utf8")), encoded, plain);
});

test("base32Encode round-trips through base32Decode for every length up to 40 bytes", () => {
  for (let n = 1; n <= 40; n++) {
    const bytes = Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + n * 11) & 0xff));
    const decoded = base32Decode(base32Encode(bytes));
    // A partial final group encodes trailing zero bits, so the decoder returns
    // whole bytes only — the original is always a prefix of what comes back.
    assert.ok(decoded.subarray(0, n).equals(bytes), `length ${n}`);
  }
});

test("a 20-byte secret encodes to exactly 32 characters, every time", () => {
  // The property the old base64-filtering one-liner did NOT have: it produced
  // 22-26 characters at random, so the secret's entropy varied per run.
  for (let i = 0; i < 200; i++) {
    const out = base32Encode(randomBytes(20));
    assert.equal(out.length, 32);
    assert.match(out, /^[A-Z2-7]{32}$/);
  }
});

test("a generated secret drives a code the verifier accepts", () => {
  const secret = base32Encode(randomBytes(20));
  const now = Date.now();
  assert.equal(verifyTotp(secret, totpCode(secret, now), { now }), true);
  // ...and the app would demand it.
  assert.equal(totpConfigured({ DEV_ADMIN_TOTP_SECRET: secret }), true);
});
