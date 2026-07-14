import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultShift, pickRemembered } from "../src/lib/count-context.js";

test("defaultShift: morning => opening, afternoon/evening => closing", () => {
  assert.equal(defaultShift(0), "open");
  assert.equal(defaultShift(8), "open");
  assert.equal(defaultShift(14), "open");
  assert.equal(defaultShift(15), "close"); // 3pm changeover
  assert.equal(defaultShift(18), "close");
  assert.equal(defaultShift(23), "close");
});

test("defaultShift: coerces string hours", () => {
  assert.equal(defaultShift("9"), "open");
  assert.equal(defaultShift("20"), "close");
});

const opts = [{ id: "a" }, { id: "b" }, { id: "c" }];

test("pickRemembered: returns the remembered id when it's still available", () => {
  assert.equal(pickRemembered("b", opts), "b");
});

test("pickRemembered: falls back to the first option when remembered is gone", () => {
  assert.equal(pickRemembered("zzz", opts), "a");
  assert.equal(pickRemembered(undefined, opts), "a");
  assert.equal(pickRemembered("", opts), "a");
});

test("pickRemembered: empty options => empty string, never throws", () => {
  assert.equal(pickRemembered("b", []), "");
  assert.equal(pickRemembered("b"), "");
});

test("pickRemembered: tolerates a null entry in options", () => {
  assert.equal(pickRemembered("b", [null, { id: "b" }]), "b");
});
