// Pure settlement reconciliation. No emulator needed. Run: npm run test:settlement
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, guessColumns, reconcileSettlement } from "../src/lib/settlement.js";

test("parseCSV handles quotes, embedded commas, escaped quotes, and blank lines", () => {
  const csv = `Pack,Game,Amount\n"0012345","Lucky 7s","$1,200.00"\n\n"0067890","He said ""hi""",300\n`;
  const rows = parseCSV(csv);
  assert.equal(rows.length, 3); // header + 2 data (blank line dropped)
  assert.deepEqual(rows[1], ["0012345", "Lucky 7s", "$1,200.00"]);
  assert.equal(rows[2][1], 'He said "hi"');
});

test("guessColumns finds pack-number and amount columns by common header names", () => {
  assert.deepEqual(guessColumns(["Book Number", "Game Name", "Net Due"]), { packNumber: 0, amount: 2 });
  assert.deepEqual(guessColumns(["date", "pack no.", "settled amount"]), { packNumber: 1, amount: 2 });
  assert.equal(guessColumns(["foo", "bar"]).packNumber, -1); // nothing matches
});

const packs = [
  { packNumber: "0012345", game: "Lucky 7s", price: 5, soldAtSettle: 40 },   // recorded $200
  { packNumber: "0067890", game: "Cash Blast", price: 10, soldAtSettle: 30 }, // recorded $300
  { packNumber: "0099999", game: "Gold Rush", price: 2, soldAtSettle: 50 },   // recorded $100, NOT in file
];

test("reconcile matches by pack number and splits matched vs discrepancies (dollars)", () => {
  const rows = [
    { packNumber: "0012345", amount: "200.00" }, // matches recorded 200
    { packNumber: "0067890", amount: "312.50" }, // 12.50 over recorded 300
  ];
  const r = reconcileSettlement(packs, rows, { basis: "dollars" });
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].packNumber, "0012345");
  assert.equal(r.discrepancies.length, 1);
  assert.equal(r.discrepancies[0].delta, 12.5);
  assert.equal(r.totals.delta, 12.5);
});

test("reconcile flags file rows with no matching pack (unknown) and settled packs the file omits (missing)", () => {
  const rows = [
    { packNumber: "0012345", amount: "200" },
    { packNumber: "9999999", amount: "50" }, // not in records
  ];
  const r = reconcileSettlement(packs, rows);
  assert.equal(r.unknown.length, 1);
  assert.equal(r.unknown[0].packNumber, "9999999");
  // 0067890 and 0099999 were settled but not in the file
  assert.deepEqual(r.missing.map((m) => m.packNumber).sort(), ["0067890", "0099999"]);
});

test("reconcile can compare ticket counts instead of dollars", () => {
  const rows = [{ packNumber: "0012345", amount: "40" }, { packNumber: "0067890", amount: "31" }];
  const r = reconcileSettlement(packs, rows, { basis: "tickets" });
  assert.equal(r.matched.length, 1);          // 40 == 40 sold
  assert.equal(r.discrepancies.length, 1);    // 31 vs 30 sold
  assert.equal(r.discrepancies[0].delta, 1);
});

test("amount parsing strips $ and commas; tolerance absorbs rounding", () => {
  const rows = [{ packNumber: "0012345", amount: "$200.004" }];
  const r = reconcileSettlement(packs, rows, { basis: "dollars", tolerance: 0.01 });
  assert.equal(r.matched.length, 1);
  assert.equal(r.discrepancies.length, 0);
});

test("pack numbers are matched exactly (leading zeros preserved)", () => {
  const r = reconcileSettlement(packs, [{ packNumber: "12345", amount: "200" }]);
  // "12345" != "0012345" -> unknown, not a match
  assert.equal(r.unknown.length, 1);
  assert.equal(r.matched.length, 0);
});
