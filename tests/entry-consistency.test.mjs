// The client (CashForm / InventoryForm) computes `expected`, and firestore.rules
// re-derives it from the SAME stored components (expectedConsistent / cash- +
// invExpectedOK). This locks the two formulas together so they can't drift: a
// client change that broke the agreement would make the rules reject legitimate
// counts. Pure — no emulator. Run: npm run test:entry
import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedCash, expectedStock } from "../src/lib/utils.js";

// What firestore.rules enforces, transcribed:
const ruleCash = ({ start = 0, sales = 0, paidout = 0 }) => start + sales - paidout;
const ruleStock = ({ startQty = 0, received = 0, soldQty = 0, removed = 0 }) =>
  startQty + received - soldQty - removed;
const near = (a, b) => Math.abs(a - b) <= 0.01; // same tolerance as the rule

test("closing cash: expectedCash matches the rule's start + sales − paidout", () => {
  for (const f of [
    { shift: "close", start: 100, sales: 50, paidout: 0 },
    { shift: "close", start: 100, sales: 50, paidout: 20 },
    { shift: "close", start: 0, sales: 0, paidout: 0 },
    { shift: "mid", start: 250.25, sales: 933.10, paidout: 40.50 },
  ]) assert.ok(near(expectedCash(f), ruleCash(f)), JSON.stringify(f));
});

test("opening cash with nothing paid out is still just the starting drawer", () => {
  for (const start of [0, 100, 200.75]) {
    const stored = { shift: "open", start, sales: 0, paidout: 0 };
    assert.equal(expectedCash(stored), start);
    assert.ok(near(expectedCash(stored), ruleCash(stored)));
  }
});

test("opening cash subtracts a paid-out, and the rule's one formula still covers it", () => {
  // Cash can leave the drawer before the shift opens (a vendor COD, an owner's
  // out-of-pocket errand). The opening form records it, so `expected` has to
  // drop by the same amount the rule derives from the stored components — or
  // the rule would reject an honest count.
  for (const f of [
    { shift: "open", start: 200, sales: 0, paidout: 40 },
    { shift: "open", start: 200.75, sales: 0, paidout: 0.75 },
    { shift: "open", start: 0, sales: 0, paidout: 25 }, // can go negative
  ]) {
    assert.ok(near(expectedCash(f), ruleCash(f)), JSON.stringify(f));
    assert.ok(near(expectedCash(f), f.start - f.paidout), JSON.stringify(f));
  }
});

test("opening cash ignores a sales value the form never stores", () => {
  // The form hides the sales box on an opening count and writes sales: 0, but
  // the component keeps whatever was typed before the shift was switched. If
  // expectedCash read that stale value, the client's `expected` would disagree
  // with the one the rules re-derive from the STORED components and the write
  // would be rejected. Opening = start − paidout, whatever `sales` holds.
  const live = { shift: "open", start: 200, sales: 900, paidout: 40 };
  const stored = { shift: "open", start: 200, sales: 0, paidout: 40 };
  assert.equal(expectedCash(live), 160);
  assert.ok(near(expectedCash(live), ruleCash(stored)));
});

test("inventory: expectedStock matches the rule's startQty + received − soldQty − removed", () => {
  for (const f of [
    { startQty: 10, received: 0, soldQty: 0, removed: 0 },
    { startQty: 10, received: 5, soldQty: 3, removed: 1 },
    { startQty: 0, received: 12, soldQty: 12, removed: 0 },
    { startQty: 40, received: 0, soldQty: 55, removed: 5 }, // can go negative
  ]) assert.ok(near(expectedStock(f), ruleStock(f)), JSON.stringify(f));
});

test("a forged expected (independent of the components) is exactly what the rule now rejects", () => {
  // The gap expectedConsistent() closes: storing expected != start+sales−paidout
  // to net a real short to a clean diff. The honest client never does this; the
  // rule is what makes it impossible from ANY client.
  const stored = { shift: "close", start: 100, sales: 50, paidout: 0 };
  assert.equal(expectedCash(stored), 150);
  assert.ok(!near(100, ruleCash(stored)), "a forged 100 is outside tolerance of 150 -> rules reject");
});
