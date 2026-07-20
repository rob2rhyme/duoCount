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
