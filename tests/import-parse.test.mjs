import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, guessMapping, validateItems, missingRequired, ITEM_UNITS } from "../src/lib/import-parse.js";

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
