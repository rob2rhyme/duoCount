// Developer/subscriber billing — pure. Run: node --test tests/billing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBilling, monthlyValue, buildBillingSummary, DEFAULT_BILLING } from "../src/lib/billing.js";

test("normalizeBilling coerces a clean record and strips a leading $", () => {
  const b = normalizeBilling({ plan: "pro", status: "active", cycle: "annual", price: "$1200", note: "  net-30  " });
  assert.deepEqual(b, { plan: "pro", status: "active", cycle: "annual", price: 1200, note: "net-30" });
});

test("normalizeBilling falls back on unknown enums and a bad price", () => {
  const b = normalizeBilling({ plan: "platinum", status: "paused", cycle: "weekly", price: "abc" });
  assert.deepEqual(b, { plan: "free", status: "trial", cycle: "monthly", price: 0, note: null });
  // and an empty object is the documented default
  assert.deepEqual(normalizeBilling({}), DEFAULT_BILLING);
});

test("a negative price is rejected to 0; cents round", () => {
  assert.equal(normalizeBilling({ price: "-50" }).price, 0);
  assert.equal(normalizeBilling({ price: "19.999" }).price, 20);
});

test("monthlyValue counts ONLY active subscriptions, annual spread over 12", () => {
  assert.equal(monthlyValue({ status: "active", cycle: "monthly", price: 49 }), 49);
  assert.equal(monthlyValue({ status: "active", cycle: "annual", price: 1200 }), 100);
  // not-yet / not-collecting statuses contribute nothing
  assert.equal(monthlyValue({ status: "trial", cycle: "monthly", price: 49 }), 0);
  assert.equal(monthlyValue({ status: "past_due", cycle: "monthly", price: 49 }), 0);
  assert.equal(monthlyValue({ status: "canceled", cycle: "monthly", price: 49 }), 0);
  assert.equal(monthlyValue(null), 0);
});

test("buildBillingSummary tallies statuses and sums MRR (active only)", () => {
  const stores = [
    { id: "a", billing: { plan: "pro", status: "active", cycle: "monthly", price: 49 } },
    { id: "b", billing: { plan: "enterprise", status: "active", cycle: "annual", price: 1200 } }, // 100/mo
    { id: "c", billing: { plan: "starter", status: "trial", cycle: "monthly", price: 19 } },
    { id: "d", billing: { plan: "pro", status: "past_due", cycle: "monthly", price: 49 } },
    { id: "e" }, // never set up
  ];
  const s = buildBillingSummary(stores);
  assert.equal(s.total, 5);
  assert.equal(s.byStatus.active, 2);
  assert.equal(s.byStatus.trial, 1);
  assert.equal(s.byStatus.past_due, 1);
  assert.equal(s.byStatus.none, 1);
  assert.equal(s.mrr, 149); // 49 + 100, trial/past_due/none excluded
});
