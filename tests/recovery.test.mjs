// Account-recovery policy: who a reset link may go to, when a one-time link is
// still good, and the bilingual email copy. Run: npm run test:recovery
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail, cleanEmailInput, joinToken, splitToken, tokenState,
  resetRecipients, resolveResetTarget, hasRecoveryEmail, verifyConflict,
  resetLink, verifyLink, recoveryLink,
  EMAIL_COPY, EMAIL_LOCALES, pickLang, line,
  buildResetEmail, buildVerifyEmail, buildPinChangedEmail,
  RESET_TTL_MIN, RESET_TTL_MS, VERIFY_TTL_DAYS, NEUTRAL_RESULT, CHANGED_BY,
} from "../src/lib/recovery.js";

/* --------------------------------- email ---------------------------------- */

test("normalizeEmail lowercases and trims, and rejects anything that isn't an address", () => {
  assert.equal(normalizeEmail("  Owner@Store.COM "), "owner@store.com");
  for (const bad of ["", "   ", "nope", "a@b", "a b@c.com", "@x.com", "x@", null, undefined])
    assert.equal(normalizeEmail(bad), null, String(bad));
  assert.equal(normalizeEmail(`${"a".repeat(200)}@x.com`), null); // over the 200-char cap
});

test("cleanEmailInput: blank CLEARS the address, junk is an error, good input normalizes", () => {
  assert.deepEqual(cleanEmailInput(""), { email: null });
  assert.deepEqual(cleanEmailInput("   "), { email: null });
  assert.deepEqual(cleanEmailInput("A@B.co"), { email: "a@b.co" });
  assert.deepEqual(cleanEmailInput("nope"), { error: "bad_email" });
});

/* --------------------------------- tokens --------------------------------- */

test("splitToken round-trips joinToken and rejects malformed links", () => {
  const t = joinToken("abc12345", "s".repeat(32));
  assert.deepEqual(splitToken(t), { id: "abc12345", secret: "s".repeat(32) });
  for (const bad of ["", ".", "noseparator", "short.xxxxxxxxxxxxxxxx", ".secretsecretsecret",
    "abc12345.", "abc12345.tooshort", "abc12345." + "s".repeat(200), "ab*c1234." + "s".repeat(32),
    "abc12345." + "!".repeat(32), null, undefined])
    assert.equal(splitToken(bad), null, String(bad));
});

test("splitToken keeps the FIRST dot as the separator so a dotted secret still parses", () => {
  // Defensive: the id charset excludes '.', so only the first split can be right.
  assert.deepEqual(splitToken("abc12345.aaaaaaaaaaaaaaaa"), { id: "abc12345", secret: "aaaaaaaaaaaaaaaa" });
});

test("tokenState: ok only while unused and inside the window", () => {
  const now = 1_000_000;
  const good = { kind: "reset", expiresAt: now + 1000 };
  assert.equal(tokenState(good, now, "reset"), "ok");
  assert.equal(tokenState({ ...good, usedAt: new Date() }, now, "reset"), "used");
  assert.equal(tokenState({ ...good, expiresAt: now }, now, "reset"), "expired");      // boundary is closed
  assert.equal(tokenState({ ...good, expiresAt: now - 1 }, now, "reset"), "expired");
  assert.equal(tokenState(null, now, "reset"), "missing");
});

test("tokenState fails closed on a garbled expiry rather than reading as ok", () => {
  const now = 1_000_000;
  for (const exp of [undefined, null, "soon", NaN, {}])
    assert.equal(tokenState({ kind: "reset", expiresAt: exp }, now, "reset"), "expired", String(exp));
});

test("a verify link probed at the reset endpoint is indistinguishable from one that never existed", () => {
  const now = 1_000_000;
  const verify = { kind: "verify", expiresAt: now + 1000 };
  assert.equal(tokenState(verify, now, "reset"), "missing");
  assert.equal(tokenState(verify, now, "verify"), "ok");
});

/* ------------------------------- recipients ------------------------------- */

const users = [
  { id: "u1", name: "Owner", active: true, email: "owner@store.com", emailVerifiedAt: new Date() },
  { id: "u2", name: "Unverified", active: true, email: "pending@store.com", emailVerifiedAt: null },
  { id: "u3", name: "Gone", active: false, email: "gone@store.com", emailVerifiedAt: new Date() },
  { id: "u4", name: "NoEmail", active: true, email: null, emailVerifiedAt: null },
];

test("only an ACTIVE user with a VERIFIED matching address can receive a reset link", () => {
  assert.deepEqual(resetRecipients(users, "Owner@Store.com").map((u) => u.id), ["u1"]);
  assert.deepEqual(resetRecipients(users, "pending@store.com"), []); // verified-only
  assert.deepEqual(resetRecipients(users, "gone@store.com"), []);    // deactivated
  assert.deepEqual(resetRecipients(users, "nobody@store.com"), []);
  assert.deepEqual(resetRecipients(users, "junk"), []);
});

test("an address shared by two staff sends NOTHING — identity would be ambiguous", () => {
  const twin = { id: "u5", name: "Twin", active: true, email: "owner@store.com", emailVerifiedAt: new Date() };
  assert.equal(resetRecipients([...users, twin], "owner@store.com").length, 2);
  assert.equal(resolveResetTarget([...users, twin], "owner@store.com"), null);
});

test("resolveResetTarget returns the single match, or null for none", () => {
  assert.equal(resolveResetTarget(users, "owner@store.com").id, "u1");
  assert.equal(resolveResetTarget(users, "pending@store.com"), null);
  assert.equal(resolveResetTarget([], "owner@store.com"), null);
  assert.equal(resolveResetTarget(undefined, "owner@store.com"), null);
});

test("hasRecoveryEmail is true only for a verified address on file", () => {
  assert.equal(hasRecoveryEmail(users[0]), true);
  assert.equal(hasRecoveryEmail(users[1]), false);
  assert.equal(hasRecoveryEmail(users[3]), false);
  assert.equal(hasRecoveryEmail(null), false);
});

test("verifyConflict names the person who already owns an address for recovery", () => {
  assert.equal(verifyConflict(users, "owner@store.com", "u9").id, "u1");
  assert.equal(verifyConflict(users, "owner@store.com", "u1"), null);   // that's me — no conflict
  assert.equal(verifyConflict(users, "pending@store.com", "u9"), null); // unverified doesn't claim it
  assert.equal(verifyConflict(users, "gone@store.com", "u9"), null);    // deactivated doesn't claim it
  assert.equal(verifyConflict(users, "free@store.com", "u9"), null);
  assert.equal(verifyConflict(users, "junk", "u9"), null);
});

test("the request step's answer is one frozen constant — it can never leak a store's existence", () => {
  assert.deepEqual(NEUTRAL_RESULT, { ok: true, sent: true });
  assert.ok(Object.isFrozen(NEUTRAL_RESULT));
});

/* --------------------------------- links ---------------------------------- */

test("links hang the token off the right page and survive a trailing slash", () => {
  assert.equal(resetLink("https://app.example.com", "abc.def"), "https://app.example.com/reset?t=abc.def");
  assert.equal(resetLink("https://app.example.com///", "abc.def"), "https://app.example.com/reset?t=abc.def");
  assert.equal(verifyLink("https://app.example.com", "abc.def"), "https://app.example.com/verify-email?t=abc.def");
  assert.equal(recoveryLink("", "/reset", "abc.def"), "/reset?t=abc.def"); // APP_URL unset → relative
});

/* ------------------------------- email copy ------------------------------- */

test("email copy holds the same keys in every locale, none blank (the i18n rule, enforced here too)", () => {
  const enKeys = Object.keys(EMAIL_COPY.en).sort();
  for (const loc of EMAIL_LOCALES) {
    assert.deepEqual(Object.keys(EMAIL_COPY[loc]).sort(), enKeys, `${loc} key set`);
    for (const [k, v] of Object.entries(EMAIL_COPY[loc]))
      assert.ok(typeof v === "string" && v.trim() !== "", `${loc}:${k} is blank`);
  }
});

test("pickLang falls back to English for anything unshipped", () => {
  assert.equal(pickLang("es"), "es");
  assert.equal(pickLang("fr"), "en");
  assert.equal(pickLang(undefined), "en");
});

test("line interpolates {vars} and leaves an unsupplied one literal", () => {
  assert.match(line("en", "reset_subject", { store: "Acme" }), /Acme/);
  assert.match(line("es", "reset_subject", { store: "Acme" }), /Restablece tu PIN de Acme/);
  assert.match(line("en", "reset_subject", {}), /\{store\}/);
});

test("the reset email carries the link, the expiry, and a did-not-ask-for-this line", () => {
  const link = "https://app.example.com/reset?t=abc.def";
  const m = buildResetEmail({ lang: "en", storeName: "Acme Market", name: "Jordan", link });
  assert.match(m.subject, /Acme Market/);
  assert.ok(m.text.includes(link) && m.html.includes(link));
  assert.match(m.text, new RegExp(`${RESET_TTL_MIN} minutes`));
  assert.match(m.text, /Ignore this email/i);
  assert.match(m.html, /^<div/);
});

test("Spanish is a real translation, not an English body with a Spanish subject", () => {
  const m = buildResetEmail({ lang: "es", storeName: "Acme", name: "Jordan", link: "https://x/reset?t=a.b" });
  assert.match(m.subject, /Restablece/);
  assert.match(m.text, /nuevo PIN de 6 dígitos/);
  assert.doesNotMatch(m.text, /Someone asked/);
});

test("the verify email states the address can't recover the account until confirmed", () => {
  const m = buildVerifyEmail({ lang: "en", storeName: "Acme", name: "Jo", link: "https://x/verify-email?t=a.b" });
  assert.match(m.text, new RegExp(`${VERIFY_TTL_DAYS} days`));
  assert.match(m.text, /can't recover your account/i);
});

test("the PIN-changed notice names WHO changed it, in each supported flavour", () => {
  const want = { self: /from inside the app/, reset: /recovery link/, owner: /An owner/, support: /DuoCount support/ };
  for (const by of CHANGED_BY) {
    const m = buildPinChangedEmail({ lang: "en", storeName: "Acme", name: "Jo", by });
    assert.match(m.text, want[by], by);
    assert.match(m.text, /Didn't do this\?/);
  }
  // an unknown flavour degrades to "self" rather than rendering a raw key
  assert.match(buildPinChangedEmail({ lang: "en", storeName: "Acme", by: "hacker" }).text, want.self);
});

test("email bodies escape HTML so a store name can't inject markup", () => {
  const m = buildResetEmail({ lang: "en", storeName: "<script>x</script>", name: "Jo", link: "https://x/reset?t=a.b" });
  assert.doesNotMatch(m.html, /<script>/);
  assert.match(m.html, /&lt;script&gt;/);
});

test("RESET_TTL_MS agrees with the minutes the email promises", () => {
  assert.equal(RESET_TTL_MS, RESET_TTL_MIN * 60 * 1000);
});
