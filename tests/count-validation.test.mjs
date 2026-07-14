import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCash, validateInventory, validateScratch } from "../src/lib/count-validation.js";

test("cash: needs location, drawer, and a counted amount", () => {
  assert.equal(validateCash({}).field, "locationId");
  assert.equal(validateCash({ locationId: "l1" }).field, "drawerId");
  assert.equal(validateCash({ locationId: "l1", drawerId: "d1" }).field, "counted");
  assert.equal(validateCash({ locationId: "l1", drawerId: "d1", counted: "120.50" }).ok, true);
});

test("cash: a counted of exactly 0 is valid (an empty drawer is a real count)", () => {
  assert.equal(validateCash({ locationId: "l1", drawerId: "d1", counted: "0" }).ok, true);
});

test("cash: the denomination counter satisfies the counted requirement", () => {
  // counted box is empty because the tallied bills are the count
  assert.equal(validateCash({ locationId: "l1", drawerId: "d1", counted: "" }, { useCounter: true }).ok, true);
  assert.equal(validateCash({ locationId: "l1", drawerId: "d1", counted: "" }, { useCounter: false }).ok, false);
});

test("inventory: needs location, item, and an on-hand amount", () => {
  assert.equal(validateInventory({}).field, "locationId");
  assert.equal(validateInventory({ locationId: "l1" }).field, "itemId");
  assert.equal(validateInventory({ locationId: "l1", itemId: "i1" }).field, "counted");
  assert.equal(validateInventory({ locationId: "l1", itemId: "i1", counted: "0" }).ok, true);
});

test("scratch: needs location, drawer, and both ticket numbers", () => {
  assert.equal(validateScratch({}).field, "locationId");
  assert.equal(validateScratch({ locationId: "l1" }).field, "drawerId");
  assert.equal(validateScratch({ locationId: "l1", drawerId: "d1", startno: "100" }).field, "numbers");
  assert.equal(validateScratch({ locationId: "l1", drawerId: "d1", startno: "100", endno: "150" }).ok, true);
});

test("scratch: the end number can't be below the start", () => {
  const r = validateScratch({ locationId: "l1", drawerId: "d1", startno: "150", endno: "100" });
  assert.equal(r.ok, false);
  assert.equal(r.field, "numbers");
});

test("scratch: start == end (a no-sales shift) is valid", () => {
  assert.equal(validateScratch({ locationId: "l1", drawerId: "d1", startno: "150", endno: "150" }).ok, true);
});

test("a valid result carries no field or message", () => {
  const r = validateCash({ locationId: "l1", drawerId: "d1", counted: "5" });
  assert.deepEqual(r, { ok: true, field: null, message: "" });
});
