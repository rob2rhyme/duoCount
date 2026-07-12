// Pure CSV builder — no DOM needed. Run: npm run test:report-csv
import { test } from "node:test";
import assert from "node:assert/strict";
import { entriesToCSV, csvCell } from "../src/lib/utils.js";

test("csvCell guards formula injection but leaves plain numbers alone (L4)", () => {
  // A spreadsheet-formula payload is neutralized with a leading apostrophe...
  assert.equal(csvCell("=1+1"), `"'=1+1"`);
  assert.equal(csvCell("+44 20"), `"'+44 20"`);
  assert.equal(csvCell("@SUM(A1)"), `"'@SUM(A1)"`);
  assert.equal(csvCell("-2+3"), `"'-2+3"`);        // leading - but not a number
  // ...while a legitimate negative amount stays a real number (no apostrophe).
  assert.equal(csvCell("-1.00"), `"-1.00"`);
  assert.equal(csvCell("-42"), `"-42"`);
  assert.equal(csvCell("Cash"), `"Cash"`);
  assert.equal(csvCell('a "quote"'), `"a ""quote"""`); // normal quoting still applies
});

test("a malicious drawer name can't smuggle a formula into the export (L4)", () => {
  const evil = {
    kind: "cash", date: "2026-03-10", shift: "close", by: "Sam", byRole: "employee",
    drawerName: "=HYPERLINK(0)", expected: 100, counted: 100, diff: 0, verifiedBy: null,
    ts: new Date("2026-03-10T22:00:00Z"),
  };
  const line = entriesToCSV([evil]).split("\n")[1];
  assert.ok(line.includes(`"'=HYPERLINK(0)"`), `formula not neutralized: ${line}`);
});

const cash = {
  kind: "cash", date: "2026-03-10", shift: "close", by: "Sam", byRole: "employee",
  drawerName: "Drawer A", expected: 580, counted: 585, diff: 5, verifiedBy: "Mgr",
  ts: new Date("2026-03-10T22:00:00Z"),
};
const scratch = {
  kind: "scratch", date: "2026-03-11", shift: "close", by: "Alex", byRole: "employee",
  game: "Lucky 7s", pack: "0450-208", price: 2, sold: 12, dollars: 24, verifiedBy: "",
  ts: new Date("2026-03-11T21:00:00Z"),
};
const inv = {
  kind: "inventory", date: "2026-03-12", shift: "close", by: "Sam", byRole: "employee",
  itemName: "Marlboro Gold", unit: "pack", expected: 40, counted: 38, diff: -2, verifiedBy: null,
  ts: null,
};

test("header row is the fixed schema, unquoted", () => {
  const lines = entriesToCSV([]).split("\n");
  assert.equal(lines.length, 1);
  assert.equal(lines[0], "Type,Date,Shift,By,Role,Detail1,Detail2,Expected/Price,Counted/Sold,OverShort/Dollars,VerifiedBy,Timestamp");
});

test("cash row: drawer in Detail1, money fields to 2dp, ISO timestamp", () => {
  const line = entriesToCSV([cash]).split("\n")[1];
  for (const cell of ['"Cash"', '"2026-03-10"', '"close"', '"Sam"', '"Drawer A"', '"580.00"', '"585.00"', '"5.00"', '"Mgr"', '"2026-03-10T22:00:00.000Z"'])
    assert.ok(line.includes(cell), `cash row missing ${cell}: ${line}`);
});

test("scratch row: game, pack label, price/dollars to 2dp, tickets sold", () => {
  const line = entriesToCSV([scratch]).split("\n")[1];
  for (const cell of ['"Scratch"', '"Lucky 7s"', '"pack 0450-208"', '"2.00"', '"12"', '"24.00"'])
    assert.ok(line.includes(cell), `scratch row missing ${cell}: ${line}`);
});

test("inventory row: item, unit, integer diff (negative shrink)", () => {
  const line = entriesToCSV([inv]).split("\n")[1];
  for (const cell of ['"Inventory"', '"Marlboro Gold"', '"pack"', '"40"', '"38"', '"-2"'])
    assert.ok(line.includes(cell), `inventory row missing ${cell}: ${line}`);
});

test("rows are emitted in the order given (no implicit reversal)", () => {
  const lines = entriesToCSV([cash, scratch, inv]).split("\n");
  assert.equal(lines.length, 4);
  assert.ok(lines[1].includes('"2026-03-10"'));
  assert.ok(lines[2].includes('"2026-03-11"'));
  assert.ok(lines[3].includes('"2026-03-12"'));
});

test("quotes and commas inside a field are escaped, not broken across cells", () => {
  const line = entriesToCSV([{ ...cash, drawerName: 'He said "hi", ok' }]).split("\n")[1];
  assert.ok(line.includes('"He said ""hi"", ok"'), `escaping failed: ${line}`);
});

test("null / undefined fields render as empty cells, never 'null'/'undefined'", () => {
  const line = entriesToCSV([inv]).split("\n")[1]; // inv has verifiedBy null, ts null
  assert.ok(!/null|undefined/.test(line), `leaked null/undefined: ${line}`);
  assert.ok(line.endsWith('"",""'), `expected trailing empty VerifiedBy + Timestamp: ${line}`);
});
