import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scanDedupKey, loggedScanKeys, isDuplicateScan, replacesSettledToday,
} from "../src/lib/scratch-scan-guard.js";

// Canonical packs are pure digits: game# (4) + book# (7). Two books of the
// same game # 1792 share a game key but are distinct packs; game # 1801 differs.
const PACK_A = "17920011361";   // game 1792, book 0011361
const PACK_B = "17920011362";   // game 1792, book 0011362 (the replacement)
const PACK_C = "18010044400";   // game 1801, book 0044400

// A logged scan reading: a scan writes endno = the ticket, so its ticket
// identity when persisted is its endno.
const scan = (over = {}) => ({
  kind: "scratch", date: "2026-07-23", shift: "open", locationId: "loc1",
  pack: PACK_A, startno: 5, endno: 7, soldOut: false, ...over,
});

const BUCKET = { date: "2026-07-23", shift: "open", locationId: "loc1" };
const reading = (over = {}) => ({ ...BUCKET, pack: PACK_A, ticket: 7, ...over });

// ---- scanDedupKey ---------------------------------------------------------
test("scanDedupKey is stable and field-sensitive", () => {
  const base = reading();
  assert.equal(scanDedupKey(base), scanDedupKey(reading()));
  for (const [k, v] of Object.entries({ date: "2026-07-24", shift: "close", locationId: "loc2", pack: PACK_B, ticket: 8 })) {
    assert.notEqual(scanDedupKey(base), scanDedupKey({ ...base, [k]: v }), `changing ${k} must change the key`);
  }
});

test("scanDedupKey coerces number and string tickets to the same key", () => {
  assert.equal(scanDedupKey(reading({ ticket: 7 })), scanDedupKey(reading({ ticket: "7" })));
});

// ---- isDuplicateScan / loggedScanKeys -------------------------------------
test("same ticket, same date+shift+location → duplicate", () => {
  const entries = [scan()];
  assert.equal(isDuplicateScan(reading(), entries), true);
});

test("Opening and Closing are separate buckets → not a duplicate", () => {
  const entries = [scan({ shift: "open" })];
  assert.equal(isDuplicateScan(reading({ shift: "close" }), entries), false);
});

test("same ticket, different date → not a duplicate", () => {
  const entries = [scan({ date: "2026-07-22" })];
  assert.equal(isDuplicateScan(reading({ date: "2026-07-23" }), entries), false);
});

test("same ticket, different location → not a duplicate", () => {
  const entries = [scan({ locationId: "loc2" })];
  assert.equal(isDuplicateScan(reading({ locationId: "loc1" }), entries), false);
});

test("replacement book (same game #, different book #) at same ticket # → not a duplicate", () => {
  const entries = [scan({ pack: PACK_A, endno: 7 })];
  assert.equal(isDuplicateScan(reading({ pack: PACK_B, ticket: 7 }), entries), false);
});

test("in-memory seen Set flags a dup even with empty entries (latency window)", () => {
  const seen = new Set([scanDedupKey(reading())]);
  assert.equal(isDuplicateScan(reading(), [], seen), true);
});

test("a settled (soldOut) marker does not create a false duplicate for a later scan of that ticket", () => {
  const entries = [scan({ soldOut: true, endno: 7 })];
  assert.equal(isDuplicateScan(reading({ ticket: 7 }), entries), false);
});

test("an entry with no endno is not a logged reading", () => {
  const entries = [scan({ endno: null })];
  assert.equal(isDuplicateScan(reading(), entries), false);
});

test("non-scratch entries are ignored", () => {
  const entries = [{ ...scan(), kind: "inventory" }];
  assert.equal(isDuplicateScan(reading(), entries), false);
});

test("loggedScanKeys returns exactly the readings in the bucket", () => {
  const entries = [
    scan({ pack: PACK_A, endno: 7 }),
    scan({ pack: PACK_B, endno: 12 }),
    scan({ shift: "close", endno: 9 }),      // other bucket
    scan({ soldOut: true, endno: 20 }),      // settle marker
  ];
  const keys = loggedScanKeys(entries, BUCKET);
  assert.equal(keys.size, 2);
  assert.ok(keys.has(scanDedupKey({ ...BUCKET, pack: PACK_A, ticket: 7 })));
  assert.ok(keys.has(scanDedupKey({ ...BUCKET, pack: PACK_B, ticket: 12 })));
});

// ---- replacesSettledToday -------------------------------------------------
const settleCtx = (over = {}) => ({ date: "2026-07-23", locationId: "loc1", gameNo: "1792", pack: PACK_B, ...over });

test("a different book of the same game # settled today at this location → replacement", () => {
  const entries = [scan({ pack: PACK_A, soldOut: true })];
  assert.equal(replacesSettledToday(entries, settleCtx()), true);
});

test("settled yesterday → not today's replacement (expires next day)", () => {
  const entries = [scan({ pack: PACK_A, soldOut: true, date: "2026-07-22" })];
  assert.equal(replacesSettledToday(entries, settleCtx({ date: "2026-07-23" })), false);
});

test("settled today at a different location → not a replacement here", () => {
  const entries = [scan({ pack: PACK_A, soldOut: true, locationId: "loc2" })];
  assert.equal(replacesSettledToday(entries, settleCtx({ locationId: "loc1" })), false);
});

test("a different game # settled today → not this game's replacement", () => {
  const entries = [scan({ pack: PACK_C, soldOut: true })];
  assert.equal(replacesSettledToday(entries, settleCtx({ gameNo: "1792" })), false);
});

test("the SAME book settled → not a replacement of itself", () => {
  const entries = [scan({ pack: PACK_A, soldOut: true })];
  assert.equal(replacesSettledToday(entries, settleCtx({ pack: PACK_A })), false);
});

test("a same-game # reading that is NOT soldOut is not a settle", () => {
  const entries = [scan({ pack: PACK_A, soldOut: false })];
  assert.equal(replacesSettledToday(entries, settleCtx()), false);
});

test("blank gameNo → never a replacement", () => {
  const entries = [scan({ pack: PACK_A, soldOut: true })];
  assert.equal(replacesSettledToday(entries, settleCtx({ gameNo: "" })), false);
});
