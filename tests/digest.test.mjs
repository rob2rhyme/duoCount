// Digest open-item backlog counts (the M3 agreement helper) — pure.
// Run: node --test tests/digest.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { openItemCounts } from "../src/lib/utils.js";

test("openItemCounts tallies unresolved variances/disputes + unverified over ALL given entries", () => {
  const entries = [
    { date: "2026-07-10", varianceStatus: "open", disputeStatus: "none", verifiedBy: null },       // old, still-open variance + unverified
    { date: "2026-07-19", varianceStatus: "under-review", disputeStatus: "none", verifiedBy: "M" }, // yesterday, unresolved variance
    { date: "2026-07-19", varianceStatus: "resolved", disputeStatus: "open", verifiedBy: "M" },     // yesterday, open dispute
    { date: "2026-07-19", varianceStatus: "none", disputeStatus: "none", verifiedBy: "M" },         // clean
    { date: "2026-07-15", varianceStatus: "none", disputeStatus: "none", verifiedBy: null },        // older, unverified
  ];
  const c = openItemCounts(entries);
  assert.equal(c.openVariances, 2); // 07-10 open + 07-19 under-review
  assert.equal(c.openDisputes, 1);  // 07-19 open dispute
  assert.equal(c.unverified, 2);    // 07-10 and 07-15
});

// The bug this fixes: the digest narrowed to yesterday's rows before counting,
// so a variance opened days ago and still open reported as 0. The backlog must
// span the whole window (the way the all-open "Open incidents" line does).
test("openItemCounts is not one-day-scoped — an older still-open variance still counts", () => {
  const windowEntries = [
    { date: "2026-07-01", varianceStatus: "open", verifiedBy: "M" }, // 18 days old, still open
    { date: "2026-07-19", varianceStatus: "none", verifiedBy: "M" }, // yesterday, clean
  ];
  const yesterdayOnly = windowEntries.filter((e) => e.date === "2026-07-19");
  assert.equal(openItemCounts(yesterdayOnly).openVariances, 0); // the old (buggy) yesterday-only result
  assert.equal(openItemCounts(windowEntries).openVariances, 1); // the whole-window (fixed) result
});

test("openItemCounts handles empty / missing input", () => {
  assert.deepEqual(openItemCounts(), { openVariances: 0, openDisputes: 0, unverified: 0 });
  assert.deepEqual(openItemCounts([]), { openVariances: 0, openDisputes: 0, unverified: 0 });
});
