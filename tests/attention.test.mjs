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

test("time counts claimed swaps AND pending time-off (both await the manager)", () => {
  const swaps = [
    { swapStatus: "claimed" },
    { swapStatus: "offered" }, // waiting on a coworker, not the manager
    { swapStatus: "none" },
    { swapStatus: "claimed" },
  ];
  const timeOff = [
    { status: "pending" }, { status: "pending" },
    { status: "planned" },   // a future heads-up — no decision awaited
    { status: "approved" },
  ];
  assert.equal(attentionCounts({ swaps }).time, 2);
  assert.equal(attentionCounts({ swaps, timeOff }).time, 4); // 2 claimed + 2 pending
  assert.equal(attentionCounts({ timeOff }).time, 2);
});

test("tolerates null/malformed rows without throwing", () => {
  const r = attentionCounts({ entries: [null, {}], incidents: [null], swaps: [null], timeOff: [null] });
  assert.deepEqual(r, { log: 0, incidents: 0, time: 0 });
});
