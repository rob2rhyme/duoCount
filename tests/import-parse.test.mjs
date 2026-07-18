import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, guessMapping, validateItems, validateStaff, validateBaselines, validateStock, validateCustomers, validateGames, missingRequired, ITEM_UNITS } from "../src/lib/import-parse.js";

/* ------------------------------ parseCsv ------------------------------ */

test("parseCsv: headers + rows with 1-based logical line numbers", () => {
  const { headers, rows } = parseCsv("name,unit\nMarlboro,carton\nJuul,pack\n");
  assert.deepEqual(headers, ["name", "unit"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].line, 2); // header is line 1
  assert.equal(rows[1].line, 3);
  assert.deepEqual(rows[0].values, { name: "Marlboro", unit: "carton" });
});

test("parseCsv: quoted fields with embedded commas and escaped quotes", () => {
  const { rows } = parseCsv('name,category\n"Smokes, 100s","Cigarettes"\n"6"" pipe",Misc\n');
  assert.equal(rows[0].values.name, "Smokes, 100s");
  assert.equal(rows[1].values.name, '6" pipe');
});

test("parseCsv: quoted field with an embedded newline stays one row", () => {
  const { rows } = parseCsv('name,note\n"Line A\nLine B",x\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].values.name, "Line A\nLine B");
});

test("parseCsv: semicolon delimiter auto-detected", () => {
  const { headers, rows } = parseCsv("name;unit\nGum;box\n");
  assert.deepEqual(headers, ["name", "unit"]);
  assert.equal(rows[0].values.unit, "box");
});

test("parseCsv: blank rows are dropped but don't renumber the rest", () => {
  const { rows } = parseCsv("name\nA\n\n\nB\n");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].line, 2);
  assert.equal(rows[1].line, 5); // two blank lines (3,4) skipped
});

test("parseCsv: strips a leading BOM and trims cells", () => {
  const { headers, rows } = parseCsv("﻿name , unit\n  A  , carton \n");
  assert.deepEqual(headers, ["name", "unit"]);
  assert.equal(rows[0].values.name, "A");
});

test("parseCsv: throws on empty / non-string input", () => {
  assert.throws(() => parseCsv(""));
  assert.throws(() => parseCsv("   "));
  assert.throws(() => parseCsv(null));
});

/* ----------------------------- guessMapping ----------------------------- */

test("guessMapping: matches common headers, leaves unknowns unset", () => {
  const m = guessMapping(["Item Name", "UPC", "Dept", "Qty"], "items");
  assert.equal(m.name, "Item Name");
  assert.equal(m.barcode, "UPC");
  assert.equal(m.category, "Dept");
  assert.equal(m.unit, undefined);
  assert.equal(m.location, undefined);
});

test("guessMapping: never reuses one source column for two targets", () => {
  const m = guessMapping(["name"], "items");
  const used = Object.values(m);
  assert.equal(new Set(used).size, used.length);
});

test("missingRequired: name is required for items", () => {
  assert.deepEqual(missingRequired({}, "items"), ["name"]);
  assert.deepEqual(missingRequired({ name: "Item" }, "items"), []);
});

/* ----------------------------- validateItems ----------------------------- */

const ctx1 = {
  locations: [{ id: "l1", name: "Main St", active: true }],
  existingItems: [],
  defaultLocationId: "l1",
};
const rowsOf = (...objs) => objs.map((values, i) => ({ line: i + 2, values }));
const mapAll = { name: "name", category: "category", unit: "unit", barcode: "barcode", location: "location" };

test("validateItems: a clean new row is a create at the default location", () => {
  const { rows, summary } = validateItems(rowsOf({ name: "Marlboro", unit: "carton" }), { name: "name", unit: "unit" }, ctx1);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[0].fields.locationId, "l1");
  assert.equal(rows[0].fields.unit, "carton");
  assert.deepEqual(summary, { create: 1, update: 0, skip: 0, error: 0 });
});

test("validateItems: missing / too-short name is an error", () => {
  const { rows } = validateItems(rowsOf({ name: "" }, { name: "x" }), { name: "name" }, ctx1);
  assert.equal(rows[0].status, "error");
  assert.equal(rows[1].status, "error");
});

test("validateItems: unknown unit warns and falls back to 'unit' (never blocks)", () => {
  const { rows } = validateItems(rowsOf({ name: "Widget", unit: "flagon" }), { name: "name", unit: "unit" }, ctx1);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[0].fields.unit, "unit");
  assert.match(rows[0].messages.join(" "), /flagon/);
  assert.ok(ITEM_UNITS.includes(rows[0].fields.unit));
});

test("validateItems: non-digit barcode is an advisory warning, still creates", () => {
  const { rows } = validateItems(rowsOf({ name: "Widget", barcode: "AB-12" }), { name: "name", barcode: "barcode" }, ctx1);
  assert.equal(rows[0].status, "create");
  assert.match(rows[0].messages.join(" "), /non-digit/i);
});

test("validateItems: in-file duplicate name at same location is skipped, citing the first line", () => {
  const { rows, summary } = validateItems(rowsOf({ name: "Gum" }, { name: "gum" }), { name: "name" }, ctx1);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[1].status, "skip");
  assert.match(rows[1].messages.join(" "), /line 2/);
  assert.equal(summary.skip, 1);
});

test("validateItems: matches an existing item → skip when unchanged, update when a field differs", () => {
  const ctx = { ...ctx1, existingItems: [{ id: "i1", name: "Marlboro", unit: "carton", category: null, barcode: null, locationId: "l1", active: true }] };
  const same = validateItems(rowsOf({ name: "Marlboro", unit: "carton" }), { name: "name", unit: "unit" }, ctx);
  assert.equal(same.rows[0].status, "skip");
  const diff = validateItems(rowsOf({ name: "Marlboro", unit: "pack" }), { name: "name", unit: "unit" }, ctx);
  assert.equal(diff.rows[0].status, "update");
  assert.equal(diff.rows[0].fields.id, "i1");
  assert.match(diff.rows[0].messages.join(" "), /unit/);
});

test("validateItems: unknown location name is an error", () => {
  const ctx = { locations: [{ id: "l1", name: "Main St", active: true }], existingItems: [] };
  const { rows } = validateItems(rowsOf({ name: "Widget", location: "Nowhere" }), { name: "name", location: "location" }, ctx);
  assert.equal(rows[0].status, "error");
  assert.match(rows[0].messages.join(" "), /Nowhere/);
});

test("validateItems: multi-location store with no location column errors per row", () => {
  const ctx = { locations: [{ id: "l1", name: "A", active: true }, { id: "l2", name: "B", active: true }], existingItems: [] };
  const { rows } = validateItems(rowsOf({ name: "Widget" }), { name: "name" }, ctx);
  assert.equal(rows[0].status, "error");
});

test("validateItems: resolves a mapped location by name and lands the item there", () => {
  const ctx = { locations: [{ id: "l1", name: "A", active: true }, { id: "l2", name: "B", active: true }], existingItems: [] };
  const { rows } = validateItems(rowsOf({ name: "Widget", location: "B" }), { name: "name", location: "location" }, ctx);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[0].fields.locationId, "l2");
});

test("validateItems: full mapping over a small file tallies a correct summary", () => {
  const ctx = { ...ctx1, existingItems: [{ id: "i1", name: "Gum", unit: "unit", category: null, barcode: null, locationId: "l1", active: true }] };
  const rows = rowsOf(
    { name: "Marlboro", category: "Cigarettes", unit: "carton", barcode: "012345", location: "Main St" },
    { name: "Gum", category: "", unit: "unit", barcode: "", location: "Main St" }, // matches existing, unchanged
    { name: "", category: "", unit: "", barcode: "", location: "Main St" },        // error
  );
  const { summary } = validateItems(rows, mapAll, ctx);
  assert.deepEqual(summary, { create: 1, update: 0, skip: 1, error: 1 });
});

/* ----------------------------- validateStaff ----------------------------- */

const staffCtx = {
  locations: [{ id: "l1", name: "Main St", active: true }],
  existingStaff: [],
  defaultLocationId: "l1",
};
const staffMap = { name: "name", role: "role", pin: "pin", location: "location", email: "email" };

test("validateStaff: an employee with a valid 6-digit PIN is a create that sets a PIN", () => {
  const { rows, summary } = validateStaff(rowsOf({ name: "Sam Rivera", role: "employee", pin: "428193" }), { name: "name", role: "role", pin: "pin" }, staffCtx);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[0].fields.hasPin, true);
  assert.equal(rows[0].fields.locationId, "l1"); // defaulted
  assert.match(rows[0].messages.join(" "), /sign-in PIN/i);
  assert.deepEqual(summary, { create: 1, update: 0, skip: 0, error: 0 });
});

test("validateStaff: a PIN is optional — no PIN still creates, with a hint", () => {
  const { rows } = validateStaff(rowsOf({ name: "Pat Lee", role: "employee" }), { name: "name", role: "role" }, staffCtx);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[0].fields.hasPin, false);
  assert.match(rows[0].messages.join(" "), /no pin/i);
});

test("validateStaff: an owner row is an error (never importable)", () => {
  const { rows } = validateStaff(rowsOf({ name: "Boss", role: "owner" }), { name: "name", role: "role" }, staffCtx);
  assert.equal(rows[0].status, "error");
  assert.match(rows[0].messages.join(" "), /owner/i);
});

test("validateStaff: an unknown role is an error", () => {
  const { rows } = validateStaff(rowsOf({ name: "Xander", role: "cashier" }), { name: "name", role: "role" }, staffCtx);
  assert.equal(rows[0].status, "error");
});

test("validateStaff: a bad PIN (not 6 digits) errors; a bad email errors", () => {
  const badPin = validateStaff(rowsOf({ name: "Ann Poe", pin: "12" }), { name: "name", pin: "pin" }, staffCtx);
  assert.equal(badPin.rows[0].status, "error");
  const badEmail = validateStaff(rowsOf({ name: "Ann Poe", email: "nope" }), { name: "name", email: "email" }, staffCtx);
  assert.equal(badEmail.rows[0].status, "error");
});

test("validateStaff: a duplicate PIN within the file errors on the second row", () => {
  const { rows } = validateStaff(rowsOf({ name: "Ann Poe", pin: "111111" }, { name: "Bob Ray", pin: "111111" }), { name: "name", pin: "pin" }, staffCtx);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[1].status, "error");
  assert.match(rows[1].messages.join(" "), /line 2/);
});

test("validateStaff: an employee needs a location when the store has more than one", () => {
  const ctx = { locations: [{ id: "l1", name: "A", active: true }, { id: "l2", name: "B", active: true }], existingStaff: [] };
  const emp = validateStaff(rowsOf({ name: "Ann Poe", role: "employee" }), { name: "name", role: "role" }, ctx);
  assert.equal(emp.rows[0].status, "error");
  // a manager may be all-locations (no location needed)
  const mgr = validateStaff(rowsOf({ name: "Mia Fox", role: "manager" }), { name: "name", role: "role" }, ctx);
  assert.equal(mgr.rows[0].status, "create");
  assert.equal(mgr.rows[0].fields.locationId, null);
});

test("validateStaff: matches an existing member by name → update on change, PIN never touched", () => {
  const ctx = { ...staffCtx, existingStaff: [{ id: "u1", name: "Sam Rivera", role: "employee", locationId: "l1", email: null, active: true }] };
  const upd = validateStaff(rowsOf({ name: "sam rivera", role: "manager", pin: "999999" }), { name: "name", role: "role", pin: "pin" }, ctx);
  assert.equal(upd.rows[0].status, "update");
  assert.equal(upd.rows[0].fields.id, "u1");
  assert.match(upd.rows[0].messages.join(" "), /unchanged/i); // PIN left unchanged
});

test("validateStaff: a row matching an existing owner is skipped (owners managed in Admin)", () => {
  const ctx = { ...staffCtx, existingStaff: [{ id: "o1", name: "The Boss", role: "owner", active: true }] };
  const { rows } = validateStaff(rowsOf({ name: "The Boss", role: "manager" }), { name: "name", role: "role" }, ctx);
  assert.equal(rows[0].status, "skip");
  assert.match(rows[0].messages.join(" "), /owner/i);
});

test("validateStaff: duplicate name within the file skips the second, citing the first line", () => {
  const { rows } = validateStaff(rowsOf({ name: "Jo" }, { name: "jo" }), { name: "name" }, staffCtx);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[1].status, "skip");
  assert.match(rows[1].messages.join(" "), /line 2/);
});

test("missingRequired: name is required for staff too", () => {
  assert.deepEqual(missingRequired({}, "staff"), ["name"]);
  assert.deepEqual(missingRequired({ name: "Name" }, "staff"), []);
});

/* --------------------------- validateBaselines --------------------------- */

const baseCtx = {
  locations: [{ id: "l1", name: "Main St", active: true }],
  items: [
    { id: "i1", name: "Marlboro", unit: "carton", barcode: "012345", locationId: "l1", active: true },
    { id: "i2", name: "Juul Pods", unit: "pack", barcode: null, locationId: "l1", active: true },
  ],
  existingStaff: [{ id: "u1", name: "Sam Rivera", role: "employee", active: true }],
  baselinedItemIds: [],
  defaultBy: { id: "own1", name: "The Owner", role: "owner" },
  today: "2026-07-14",
};
const baseMap = { item: "item", quantity: "quantity", location: "location", date: "date", countedBy: "countedBy" };

test("validateBaselines: a clean row creates, attributed to the owner by default", () => {
  const { rows, summary } = validateBaselines(rowsOf({ item: "Marlboro", quantity: "12" }), { item: "item", quantity: "quantity" }, baseCtx);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[0].fields.itemId, "i1");
  assert.equal(rows[0].fields.quantity, 12);
  assert.equal(rows[0].fields.unit, "carton");
  assert.equal(rows[0].fields.date, "2026-07-14"); // today default
  assert.equal(rows[0].fields.byId, "own1");
  assert.equal(rows[0].fields.byRole, "owner");
  assert.deepEqual(summary, { create: 1, update: 0, skip: 0, error: 0 });
});

test("validateBaselines: resolves an item by barcode too", () => {
  const { rows } = validateBaselines(rowsOf({ item: "012345", quantity: "3" }), { item: "item", quantity: "quantity" }, baseCtx);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[0].fields.itemId, "i1");
});

test("validateBaselines: quantity 0 is a real, valid opening count", () => {
  const { rows } = validateBaselines(rowsOf({ item: "Juul Pods", quantity: "0" }), { item: "item", quantity: "quantity" }, baseCtx);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[0].fields.quantity, 0);
});

test("validateBaselines: unknown item / negative or non-numeric quantity are errors", () => {
  const noItem = validateBaselines(rowsOf({ item: "Ghost", quantity: "5" }), { item: "item", quantity: "quantity" }, baseCtx);
  assert.equal(noItem.rows[0].status, "error");
  assert.match(noItem.rows[0].messages.join(" "), /catalog/i);
  const badQty = validateBaselines(rowsOf({ item: "Marlboro", quantity: "-2" }, { item: "Juul Pods", quantity: "lots" }), { item: "item", quantity: "quantity" }, baseCtx);
  assert.equal(badQty.rows[0].status, "error");
  assert.equal(badQty.rows[1].status, "error");
});

test("validateBaselines: a same-named item at two locations is ambiguous without a location column", () => {
  const ctx = {
    ...baseCtx,
    locations: [{ id: "l1", name: "A", active: true }, { id: "l2", name: "B", active: true }],
    items: [
      { id: "i1", name: "Gum", unit: "unit", locationId: "l1", active: true },
      { id: "i9", name: "Gum", unit: "unit", locationId: "l2", active: true },
    ],
  };
  const ambiguous = validateBaselines(rowsOf({ item: "Gum", quantity: "4" }), { item: "item", quantity: "quantity" }, ctx);
  assert.equal(ambiguous.rows[0].status, "error");
  assert.match(ambiguous.rows[0].messages.join(" "), /location/i);
  const narrowed = validateBaselines(rowsOf({ item: "Gum", quantity: "4", location: "B" }), baseMap, ctx);
  assert.equal(narrowed.rows[0].status, "create");
  assert.equal(narrowed.rows[0].fields.itemId, "i9");
});

test("validateBaselines: a bad date errors; a valid one is used", () => {
  const bad = validateBaselines(rowsOf({ item: "Marlboro", quantity: "1", date: "07/14/2026" }), baseMap, baseCtx);
  assert.equal(bad.rows[0].status, "error");
  const good = validateBaselines(rowsOf({ item: "Marlboro", quantity: "1", date: "2026-07-01" }), baseMap, baseCtx);
  assert.equal(good.rows[0].status, "create");
  assert.equal(good.rows[0].fields.date, "2026-07-01");
});

test("validateBaselines: countedBy resolves to the roster, or errors when unknown", () => {
  const known = validateBaselines(rowsOf({ item: "Marlboro", quantity: "1", countedBy: "sam rivera" }), baseMap, baseCtx);
  assert.equal(known.rows[0].status, "create");
  assert.equal(known.rows[0].fields.byId, "u1");
  assert.equal(known.rows[0].fields.byRole, "employee");
  const unknown = validateBaselines(rowsOf({ item: "Marlboro", quantity: "1", countedBy: "Nobody" }), baseMap, baseCtx);
  assert.equal(unknown.rows[0].status, "error");
  assert.match(unknown.rows[0].messages.join(" "), /roster/i);
});

test("validateBaselines: write-once — an item with any inventory entry is skipped", () => {
  const ctx = { ...baseCtx, baselinedItemIds: ["i1"] };
  const { rows, summary } = validateBaselines(rowsOf({ item: "Marlboro", quantity: "9" }), { item: "item", quantity: "quantity" }, ctx);
  assert.equal(rows[0].status, "skip");
  assert.match(rows[0].messages.join(" "), /already has/i);
  assert.equal(summary.skip, 1);
});

test("validateBaselines: in-file duplicate item skips the second row, citing the first line", () => {
  const { rows } = validateBaselines(rowsOf({ item: "Marlboro", quantity: "9" }, { item: "Marlboro", quantity: "11" }), { item: "item", quantity: "quantity" }, baseCtx);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[1].status, "skip");
  assert.match(rows[1].messages.join(" "), /line 2/);
});

test("validateBaselines: baselines never report update", () => {
  const ctx = { ...baseCtx, baselinedItemIds: ["i1", "i2"] };
  const { summary } = validateBaselines(rowsOf({ item: "Marlboro", quantity: "9" }, { item: "Juul Pods", quantity: "2" }), { item: "item", quantity: "quantity" }, ctx);
  assert.equal(summary.update, 0);
  assert.equal(summary.skip, 2);
});

test("missingRequired: item and quantity are required for baselines", () => {
  assert.deepEqual(missingRequired({}, "baselines"), ["item", "quantity"]);
  assert.deepEqual(missingRequired({ item: "Item", quantity: "Qty" }, "baselines"), []);
});

/* ----------------------------- validateStock ----------------------------- */

const stockCtx = {
  locations: [{ id: "l1", name: "Main St", active: true }],
  items: [
    { id: "i1", name: "Marlboro", unit: "carton", barcode: "012345", locationId: "l1", active: true },
    { id: "i2", name: "Juul Pods", unit: "pack", barcode: null, locationId: "l1", active: true },
  ],
};
const stockMap = { item: "item", quantity: "quantity", price: "price", expiry: "expiry" };

test("validateStock: a clean row is an UPDATE (never a create) carrying qty/price/expiry", () => {
  const { rows, summary } = validateStock(
    rowsOf({ item: "Marlboro", quantity: "12", price: "$89.50", expiry: "2026-09-01" }), stockMap, stockCtx);
  assert.equal(rows[0].status, "update");
  assert.equal(rows[0].fields.itemId, "i1");
  assert.equal(rows[0].fields.quantity, 12);
  assert.equal(rows[0].fields.price, 89.5); // leading $ stripped
  assert.equal(rows[0].fields.expiresAt, "2026-09-01");
  assert.deepEqual(summary, { create: 0, update: 1, skip: 0, error: 0 });
});

test("validateStock: resolves by barcode; blank price/expiry cells leave fields null (unchanged)", () => {
  const { rows } = validateStock(rowsOf({ item: "012345", quantity: "0", price: "", expiry: "" }), stockMap, stockCtx);
  assert.equal(rows[0].status, "update");
  assert.equal(rows[0].fields.itemId, "i1");
  assert.equal(rows[0].fields.quantity, 0); // 0 on hand is a real level
  assert.equal(rows[0].fields.price, null);
  assert.equal(rows[0].fields.expiresAt, null);
});

test("validateStock: unknown item, bad quantity, bad price, bad date are errors", () => {
  const r = validateStock(rowsOf(
    { item: "Ghost", quantity: "5" },
    { item: "Marlboro", quantity: "-1" },
    { item: "Marlboro", quantity: "5", price: "free" },
    { item: "Marlboro", quantity: "5", expiry: "soon" },
  ), stockMap, stockCtx);
  assert.deepEqual(r.rows.map((x) => x.status), ["error", "error", "error", "error"]);
  assert.match(r.rows[0].messages.join(" "), /catalog/i);
  assert.match(r.rows[2].messages.join(" "), /price/i);
  assert.match(r.rows[3].messages.join(" "), /YYYY-MM-DD/);
});

test("validateStock: an in-file duplicate item keeps the first row and skips the later one", () => {
  const { rows, summary } = validateStock(rowsOf(
    { item: "Marlboro", quantity: "10" },
    { item: "012345", quantity: "4" }, // same item by barcode
  ), stockMap, stockCtx);
  assert.equal(rows[0].status, "update");
  assert.equal(rows[1].status, "skip");
  assert.match(rows[1].messages.join(" "), /line 2/);
  assert.deepEqual(summary, { create: 0, update: 1, skip: 1, error: 0 });
});

test("validateStock: inactive items don't match; missingRequired needs item + quantity", () => {
  const ctx = { ...stockCtx, items: [{ ...stockCtx.items[0], active: false }] };
  const { rows } = validateStock(rowsOf({ item: "Marlboro", quantity: "5" }), stockMap, ctx);
  assert.equal(rows[0].status, "error");
  assert.deepEqual(missingRequired({}, "stock"), ["item", "quantity"]);
  assert.deepEqual(missingRequired({ item: "a", quantity: "b" }, "stock"), []);
});

/* --------------------------- validateCustomers --------------------------- */

const custCtx = { existingCustomers: [{ id: "c1", phone: "5551234567", name: "Alex" }, { id: "c2", phone: "5559990000", name: null }] };
const custMap = { phone: "phone", name: "name" };

test("validateCustomers: a clean row creates at 0 points; formats normalize to one customer", () => {
  const { rows, summary } = validateCustomers(rowsOf({ phone: "(555) 777-8888", name: "Sam" }), custMap, custCtx);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[0].fields.phone, "5557778888");
  assert.equal(rows[0].fields.customerName, "Sam");
  assert.deepEqual(summary, { create: 1, update: 0, skip: 0, error: 0 });
  // +1 US prefix collapses to the same number
  const plus1 = validateCustomers(rowsOf({ phone: "+1 555 777 8888" }), custMap, custCtx);
  assert.equal(plus1.rows[0].fields.phone, "5557778888");
});

test("validateCustomers: an enrolled phone is skipped — points never touched, never duplicated", () => {
  const { rows } = validateCustomers(rowsOf({ phone: "555-123-4567", name: "Alex" }), custMap, custCtx);
  assert.equal(rows[0].status, "skip");
  assert.match(rows[0].messages.join(" "), /already enrolled/i);
});

test("validateCustomers: an enrolled phone with a NEW name becomes a name-only update", () => {
  const { rows } = validateCustomers(rowsOf({ phone: "5559990000", name: "Brenda" }), custMap, custCtx);
  assert.equal(rows[0].status, "update");
  assert.equal(rows[0].fields.newName, "Brenda");
  assert.equal(rows[0].fields.id, "c2");
});

test("validateCustomers: missing/invalid phones error; in-file duplicates skip", () => {
  const { rows, summary } = validateCustomers(rowsOf(
    { phone: "", name: "NoPhone" },
    { phone: "12345" },
    { phone: "5551112222" },
    { phone: "+1 (555) 111-2222" }, // same number, different format
  ), custMap, custCtx);
  assert.deepEqual(rows.map((r) => r.status), ["error", "error", "create", "skip"]);
  assert.match(rows[3].messages.join(" "), /line 4/);
  assert.deepEqual(summary, { create: 1, update: 0, skip: 1, error: 2 });
});

test("validateCustomers: name-less rows preview as the number; missingRequired needs phone", () => {
  const { rows } = validateCustomers(rowsOf({ phone: "5553334444" }), { phone: "phone" }, custCtx);
  assert.equal(rows[0].fields.name, "5553334444"); // display fallback
  assert.equal(rows[0].fields.customerName, null); // what commits
  assert.deepEqual(missingRequired({}, "customers"), ["phone"]);
  assert.deepEqual(missingRequired({ phone: "p" }, "customers"), []);
});

test("validateCustomers: a mapped points column seeds NEW customers only", () => {
  const map = { ...custMap, points: "points" };
  const { rows, summary } = validateCustomers(rowsOf(
    { phone: "5557778888", name: "Sam", points: "1,250" }, // new — starting balance (Excel commas ok)
    { phone: "5551234567", name: "Alex", points: "900" },  // enrolled — skipped, points ignored
    { phone: "5552223333", points: "" },                   // blank points → starts at 0
  ), map, custCtx);
  assert.deepEqual(rows.map((r) => r.status), ["create", "skip", "create"]);
  assert.equal(rows[0].fields.points, 1250);
  assert.match(rows[0].messages.join(" "), /1250 points/);
  assert.equal(rows[2].fields.points, null);
  assert.deepEqual(summary, { create: 2, update: 0, skip: 1, error: 0 });
});

test("validateCustomers: junk or out-of-range points error the row; fractions round", () => {
  const map = { ...custMap, points: "points" };
  const { rows } = validateCustomers(rowsOf(
    { phone: "5557778888", points: "lots" },
    { phone: "5556667777", points: "-5" },
    { phone: "5554445555", points: "2000000" },
    { phone: "5553334444", points: "12.4" },
  ), map, custCtx);
  assert.deepEqual(rows.map((r) => r.status), ["error", "error", "error", "create"]);
  assert.match(rows[0].messages.join(" "), /whole number between 0 and 100,000/);
  assert.equal(rows[3].fields.points, 12);
});

test("validateCustomers: without a mapped points column the CSV's points are inert", () => {
  const { rows } = validateCustomers(rowsOf({ phone: "5557778888", points: "500" }), custMap, custCtx);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[0].fields.points, null);
});

/* ----------------------------- validateGames ----------------------------- */

const gameMap = { game: "game", name: "name", price: "price", perPack: "perPack" };
// existing stored catalog: game 1801 already known
const gameCtx = { existingGames: { 1801: { name: "Glinda", price: 1, perPack: 100 } } };

test("validateGames: a clean new row creates; game # normalizes leading zeros", () => {
  const { rows, summary } = validateGames(
    rowsOf({ game: "01799", name: "Yellow Brick Road", price: "$5", perPack: "60" }), gameMap, gameCtx);
  assert.equal(rows[0].status, "create");
  assert.equal(rows[0].fields.game, "1799"); // leading zero dropped
  assert.equal(rows[0].fields.name, "Yellow Brick Road");
  assert.equal(rows[0].fields.price, 5); // leading $ stripped
  assert.equal(rows[0].fields.perPack, 60);
  assert.deepEqual(summary, { create: 1, update: 0, skip: 0, error: 0 });
});

test("validateGames: an already-stored game is a skip when identical, an update when a field differs", () => {
  const same = validateGames(rowsOf({ game: "1801", name: "Glinda", price: "1", perPack: "100" }), gameMap, gameCtx);
  assert.equal(same.rows[0].status, "skip");
  const diff = validateGames(rowsOf({ game: "1801", name: "Glinda", price: "2", perPack: "100" }), gameMap, gameCtx);
  assert.equal(diff.rows[0].status, "update");
  assert.match(diff.rows[0].messages.join(" "), /price/);
});

test("validateGames: missing game #, missing name, and bad/zero price are errors", () => {
  const r = validateGames(rowsOf(
    { game: "", name: "X", price: "1" },
    { game: "1700", name: "", price: "1" },
    { game: "1700", name: "Y", price: "free" },
    { game: "1700", name: "Y", price: "0" },
    { game: "abc", name: "Y", price: "1" },
  ), gameMap, gameCtx);
  assert.deepEqual(r.rows.map((x) => x.status), ["error", "error", "error", "error", "error"]);
  assert.match(r.rows[0].messages.join(" "), /game number/i);
  assert.match(r.rows[1].messages.join(" "), /name/i);
  assert.match(r.rows[2].messages.join(" "), /price/i);
});

test("validateGames: tickets-per-pack is optional but must be a whole number ≥ 1 when given", () => {
  const ok = validateGames(rowsOf({ game: "1700", name: "Y", price: "1" }), { game: "game", name: "name", price: "price" }, {});
  assert.equal(ok.rows[0].status, "create");
  assert.equal(ok.rows[0].fields.perPack, null);
  const bad = validateGames(rowsOf({ game: "1700", name: "Y", price: "1", perPack: "2.5" }), gameMap, {});
  assert.equal(bad.rows[0].status, "error");
  assert.match(bad.rows[0].messages.join(" "), /pack/i);
});

test("validateGames: in-file duplicate game # skips the second row, citing the first line", () => {
  const { rows, summary } = validateGames(rowsOf(
    { game: "1700", name: "A", price: "1" },
    { game: "1700", name: "A again", price: "1" },
  ), gameMap, {});
  assert.equal(rows[0].status, "create");
  assert.equal(rows[1].status, "skip");
  assert.match(rows[1].messages.join(" "), /line 2/);
  assert.equal(summary.skip, 1);
});

test("missingRequired: game, name and price are required for games", () => {
  assert.deepEqual(missingRequired({}, "games"), ["game", "name", "price"]);
  assert.deepEqual(missingRequired({ game: "g", name: "n", price: "p" }, "games"), []);
});

test("guessMapping: PA-style headers map onto game targets (# Tickets → perPack, $$ Amount → price)", () => {
  const mapping = guessMapping(["Number", "Name", "$$ Amount", "# Tickets"], "games");
  assert.equal(mapping.game, "Number");
  assert.equal(mapping.name, "Name");
  assert.equal(mapping.price, "$$ Amount"); // "amount" alias
  assert.equal(mapping.perPack, "# Tickets"); // "tickets" alias
});
