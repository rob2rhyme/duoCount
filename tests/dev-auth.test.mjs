// Developer login credential check — pure. Run: node --test tests/dev-auth.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { devCredentialsOk } from "../src/lib/dev-auth.js";

const ENV = { DEV_ADMIN_EMAIL: "dev@duocount.app", DEV_ADMIN_PASSWORD: "s3cret-passphrase" };

test("correct email + password → true (email case/space-insensitive)", () => {
  assert.equal(devCredentialsOk({ email: "dev@duocount.app", password: "s3cret-passphrase" }, ENV), true);
  assert.equal(devCredentialsOk({ email: "  DEV@DuoCount.App ", password: "s3cret-passphrase" }, ENV), true);
});

test("wrong password or wrong email → false", () => {
  assert.equal(devCredentialsOk({ email: "dev@duocount.app", password: "wrong" }, ENV), false);
  assert.equal(devCredentialsOk({ email: "someone@else.com", password: "s3cret-passphrase" }, ENV), false);
});

test("password is case-SENSITIVE (unlike email)", () => {
  assert.equal(devCredentialsOk({ email: "dev@duocount.app", password: "S3CRET-PASSPHRASE" }, ENV), false);
});

/* ------------------------ pasted-value whitespace ------------------------ */
// A break-glass credential is set by PASTING into a deploy dashboard, where a
// trailing newline rides along constantly. Untrimmed, that mismatch is invisible
// and reads exactly like a wrong password — the worst way to lose the one
// credential that recovers cross-tenant access.

test("a trailing newline on the CONFIGURED password still lets the right password in", () => {
  for (const pad of ["s3cret-passphrase\n", "s3cret-passphrase ", " s3cret-passphrase", "\ts3cret-passphrase\r\n"])
    assert.equal(
      devCredentialsOk({ email: "dev@duocount.app", password: "s3cret-passphrase" },
        { ...ENV, DEV_ADMIN_PASSWORD: pad }), true, JSON.stringify(pad));
});

test("whitespace on the SUBMITTED password is tolerated too", () => {
  for (const typed of ["s3cret-passphrase ", " s3cret-passphrase", " s3cret-passphrase\n"])
    assert.equal(devCredentialsOk({ email: "dev@duocount.app", password: typed }, ENV), true, JSON.stringify(typed));
});

test("a whitespace-only configured password reads as UNSET — the login stays off", () => {
  // Fail closed: it must not become "empty matches empty".
  for (const blankish of [" ", "\n", "\t\n "]) {
    assert.equal(devCredentialsOk({ email: "dev@duocount.app", password: "" },
      { ...ENV, DEV_ADMIN_PASSWORD: blankish }), false, JSON.stringify(blankish));
    assert.equal(devCredentialsOk({ email: "dev@duocount.app", password: " " },
      { ...ENV, DEV_ADMIN_PASSWORD: blankish }), false, JSON.stringify(blankish));
  }
});

test("only the EDGES are trimmed — interior spacing is still part of the secret", () => {
  const env = { ...ENV, DEV_ADMIN_PASSWORD: "two words here" };
  assert.equal(devCredentialsOk({ email: "dev@duocount.app", password: "two words here" }, env), true);
  assert.equal(devCredentialsOk({ email: "dev@duocount.app", password: "twowordshere" }, env), false);
  assert.equal(devCredentialsOk({ email: "dev@duocount.app", password: "two  words here" }, env), false);
});

test("login is OFF when env isn't configured — blank input can't bypass it", () => {
  assert.equal(devCredentialsOk({ email: "", password: "" }, {}), false);
  assert.equal(devCredentialsOk({ email: "", password: "" }, { DEV_ADMIN_EMAIL: "dev@duocount.app", DEV_ADMIN_PASSWORD: "" }), false);
  assert.equal(devCredentialsOk({ email: "", password: "" }, { DEV_ADMIN_EMAIL: "", DEV_ADMIN_PASSWORD: "s3cret-passphrase" }), false);
});

test("missing / malformed input → false, never throws", () => {
  assert.equal(devCredentialsOk(undefined, ENV), false);
  assert.equal(devCredentialsOk({}, ENV), false);
  assert.equal(devCredentialsOk({ email: null, password: null }, ENV), false);
});
