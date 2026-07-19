import { test } from "node:test";
import assert from "node:assert/strict";
import { pageState, PAGE_INITIAL, PAGE_STEP, PAGE_FROM } from "../src/lib/paging.js";

test("defaults match the spec (20 / +10 / from 25)", () => {
  assert.equal(PAGE_INITIAL, 20);
  assert.equal(PAGE_STEP, 10);
  assert.equal(PAGE_FROM, 25);
});

test("short lists (below `from`) render whole with no control", () => {
  for (const n of [0, 1, 10, 24]) {
    const s = pageState(n, PAGE_INITIAL);
    assert.equal(s.paginate, false, `n=${n}`);
    assert.equal(s.shown, n);
    assert.equal(s.hasMore, false);
    assert.equal(s.nextStep, 0);
  }
});

test("at/above `from` it shows the first page and offers more", () => {
  const s = pageState(30, PAGE_INITIAL);
  assert.equal(s.paginate, true);
  assert.equal(s.shown, 20);
  assert.equal(s.hasMore, true);
  assert.equal(s.remaining, 10);
  assert.equal(s.nextStep, 10);
});

test("nextStep shrinks to the remainder on the last page", () => {
  const s = pageState(33, 30); // 30 shown, 3 left
  assert.equal(s.shown, 30);
  assert.equal(s.remaining, 3);
  assert.equal(s.nextStep, 3);
});

test("revealing everything clears hasMore", () => {
  const s = pageState(30, 30);
  assert.equal(s.shown, 30);
  assert.equal(s.hasMore, false);
  assert.equal(s.nextStep, 0);
});

test("customer preset: 20 default, +10, paginates past 20", () => {
  const opts = { initial: 20, step: 10, from: 20 };
  assert.equal(pageState(20, 20, opts).hasMore, false); // exactly 20 → all, no button
  const s21 = pageState(21, 20, opts);
  assert.equal(s21.shown, 20);
  assert.equal(s21.hasMore, true);
  assert.equal(s21.nextStep, 1);
});

test("count is clamped to at least `initial` and never past total", () => {
  assert.equal(pageState(30, 5).shown, 20);   // count below initial → floored to 20
  assert.equal(pageState(30, 999).shown, 30); // count past total → capped
  assert.equal(pageState(30, 999).hasMore, false);
});

test("tolerates junk totals/counts", () => {
  assert.equal(pageState(undefined, undefined).shown, 0);
  assert.equal(pageState(-5, -5).shown, 0);
  assert.equal(pageState(NaN, NaN).shown, 0);
});
