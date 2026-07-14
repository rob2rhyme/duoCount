import { test } from "node:test";
import assert from "node:assert/strict";
import { attentionCounts } from "../src/lib/attention.js";

test("empty everything => all zero", () => {
  assert.deepEqual(attentionCounts(), { log: 0, incidents: 0, time: 0 });
  assert.deepEqual(attentionCounts({}), { log: 0, incidents: 0, time: 0 });
});

test("log counts entries with an unresolved variance or dispute", () => {
  const entries = [
    { varianceStatus: "open" },
    { varianceStatus: "under-review" },
    { disputeStatus: "open" },
    { varianceStatus: "resolved" },      // not counted
    { varianceStatus: "none", disputeStatus: "none" }, // not counted
  ];
  assert.equal(attentionCounts({ entries }).log, 3);
});

test("an entry unresolved on BOTH variance and dispute is still one item", () => {
  const entries = [{ varianceStatus: "open", disputeStatus: "under-review" }];
  assert.equal(attentionCounts({ entries }).log, 1);
});

test("incidents counts only open write-ups", () => {
  const incidents = [
    { status: "open" },
    { status: "open" },
    { status: "acknowledged" }, // not counted
    { status: "closed" },       // not counted
  ];
  assert.equal(attentionCounts({ incidents }).incidents, 2);
});

test("time counts only claimed swaps (awaiting manager approval)", () => {
  const swaps = [
    { swapStatus: "claimed" },
    { swapStatus: "offered" }, // waiting on a coworker, not the manager
    { swapStatus: "none" },
    { swapStatus: "claimed" },
  ];
  assert.equal(attentionCounts({ swaps }).time, 2);
});

test("tolerates null/malformed rows without throwing", () => {
  const r = attentionCounts({ entries: [null, {}], incidents: [null], swaps: [null] });
  assert.deepEqual(r, { log: 0, incidents: 0, time: 0 });
});
