// Pure accounting-export shaping — no DOM. Run: npm run test:report-accounting
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildJournalEntries, buildJournalCSV, buildFranchiseCSV, FRANCHISE_PROFILES, JOURNAL_HEADER, DEFAULT_ACCOUNTS } from "../src/lib/report-accounting.js";
import { buildPeriodReport } from "../src/lib/report-build.js";

const RANGE = { startISO: "2026-07-13", endISO: "2026-07-14" };
const cash = (date, loc, { sales = 0, paidout = 0, diff = 0 } = {}) => ({
  kind: "cash", date, locationId: loc.toLowerCase(), locationName: loc,
  sales, paidout, counted: 0, diff,
});
const scratch = (date, loc, dollars) => ({
  kind: "scratch", date, locationId: loc.toLowerCase(), locationName: loc, sold: 1, dollars,
});
const inv = (date, loc, diff) => ({
  kind: "inventory", date, locationId: loc.toLowerCase(), locationName: loc, counted: 5, diff,
});

// The spec's worked example: sales 2140, scratch 312, paid-outs 85, short 4.
const DAY = [
  cash("2026-07-14", "Main St", { sales: 2140, paidout: 85, diff: -4 }),
  scratch("2026-07-14", "Main St", 312),
];

/* ------------------------------- entries ------------------------------- */

test("the spec's worked day produces one balanced entry with the right sides", () => {
  const [e] = buildJournalEntries(DAY, RANGE);
  assert.equal(e.journalNo, "DC-2026-07-14-main-st");
  const by = Object.fromEntries(e.lines.map((l) => [l.description, l]));
  assert.equal(by["Cash to deposit"].debit, 2363); // 2452 credits − 85 − 4
  assert.equal(by["Paid-outs"].debit, 85);
  assert.equal(by["Cash short"].debit, 4);
  assert.equal(by["Cash sales"].credit, 2140);
  assert.equal(by["Lottery/scratch sales"].credit, 312);
  const debits = e.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credits = e.lines.reduce((s, l) => s + (l.credit || 0), 0);
  assert.equal(debits, credits);
});

test("every entry balances to the cent on a messy multi-day multi-location fixture", () => {
  const entries = [
    ...DAY,
    cash("2026-07-13", "Main St", { sales: 1010.55, paidout: 20.2, diff: 6.13 }),   // over day
    cash("2026-07-13", "Riverside", { sales: 480.33, paidout: 0, diff: -12.01 }),
    scratch("2026-07-13", "Riverside", 55.5),
    cash("2026-07-14", "Riverside", { sales: 0, paidout: 30, diff: -5 }),           // negative plug day
    inv("2026-07-13", "Main St", -3), // inventory never journals
  ];
  const groups = buildJournalEntries(entries, RANGE);
  assert.equal(groups.length, 4); // 2 days × 2 locations
  for (const g of groups) {
    const debits = Math.round(g.lines.reduce((s, l) => s + (l.debit || 0), 0) * 100);
    const credits = Math.round(g.lines.reduce((s, l) => s + (l.credit || 0), 0) * 100);
    assert.equal(debits, credits, g.journalNo);
    for (const l of g.lines) {
      assert.ok((l.debit != null) !== (l.credit != null), "exactly one side populated");
      assert.ok((l.debit ?? l.credit) > 0, "amounts are positive; the side carries the sign");
    }
  }
});

test("an over day credits Cash Over/Short; a short day debits it", () => {
  const over = buildJournalEntries([cash("2026-07-13", "A", { sales: 100, diff: 6 })], RANGE)[0];
  const overLine = over.lines.find((l) => l.account === DEFAULT_ACCOUNTS.overShort);
  assert.equal(overLine.credit, 6);
  const short = buildJournalEntries([cash("2026-07-13", "A", { sales: 100, diff: -6 })], RANGE)[0];
  const shortLine = short.lines.find((l) => l.account === DEFAULT_ACCOUNTS.overShort);
  assert.equal(shortLine.debit, 6);
});

test("a negative plug flips the deposit line to a credit and still balances", () => {
  // paid-outs + shortage exceed the day's sales
  const [e] = buildJournalEntries([cash("2026-07-13", "A", { sales: 10, paidout: 30, diff: -5 })], RANGE);
  const dep = e.lines.find((l) => l.description === "Cash shortfall funded");
  assert.equal(dep.credit, 25); // 30 + 5 − 10
  const debits = e.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credits = e.lines.reduce((s, l) => s + (l.credit || 0), 0);
  assert.equal(debits, credits);
});

test("journal totals reconcile with buildPeriodReport for the same window", () => {
  const entries = [
    ...DAY,
    cash("2026-07-13", "Riverside", { sales: 480.33, paidout: 12.5, diff: -12.01 }),
    scratch("2026-07-13", "Riverside", 55.5),
  ];
  const report = buildPeriodReport(entries, RANGE, "all");
  const groups = buildJournalEntries(entries, RANGE);
  const all = groups.flatMap((g) => g.lines);
  const sum = (desc) => Math.round(all.filter((l) => l.description === desc)
    .reduce((s, l) => s + (l.debit ?? l.credit ?? 0), 0) * 100) / 100;
  assert.equal(sum("Cash sales"), report.cash.sales);
  assert.equal(sum("Paid-outs"), report.cash.paidout);
  assert.equal(sum("Lottery/scratch sales"), report.scratch.dollars);
  // net over/short: credits (over) − debits (short) === report netDiff
  const os = all.filter((l) => l.account === DEFAULT_ACCOUNTS.overShort)
    .reduce((s, l) => s + (l.credit ?? 0) - (l.debit ?? 0), 0);
  assert.equal(Math.round(os * 100) / 100, report.cash.netDiff);
});

test("days with only inventory (or nothing) emit no journal entry", () => {
  assert.deepEqual(buildJournalEntries([inv("2026-07-13", "A", -2)], RANGE), []);
  assert.deepEqual(buildJournalEntries([], RANGE), []);
});

test("entries outside the range are ignored; a bad range throws", () => {
  const outside = [cash("2026-06-30", "A", { sales: 999 })];
  assert.deepEqual(buildJournalEntries(outside, RANGE), []);
  assert.throws(() => buildJournalEntries([], { startISO: "2026-07-14", endISO: "2026-07-13" }));
  assert.throws(() => buildJournalEntries([], {}));
});

test("overriding the account map changes account names and nothing else", () => {
  const [e] = buildJournalEntries(DAY, RANGE, { accounts: { sales: "4000 · Store Sales" } });
  assert.ok(e.lines.some((l) => l.account === "4000 · Store Sales" && l.credit === 2140));
  assert.ok(e.lines.some((l) => l.account === DEFAULT_ACCOUNTS.lottery)); // untouched default
});

/* --------------------------------- CSV --------------------------------- */

test("header is the fixed 9-column string, byte for byte", () => {
  assert.equal(buildJournalCSV([], RANGE).split("\n")[0], JOURNAL_HEADER);
  assert.equal(JOURNAL_HEADER, "JournalNo,JournalDate,AccountName,Debit,Credit,Description,Name,Location,Memo");
});

test("empty period yields a header-only file", () => {
  assert.equal(buildJournalCSV([], RANGE), JOURNAL_HEADER);
});

test("amounts are raw 2-decimal — no $, no thousands separators", () => {
  const csv = buildJournalCSV(DAY, RANGE);
  assert.ok(csv.includes(`"2363.00"`));
  assert.ok(csv.includes(`"2140.00"`));
  assert.ok(!csv.includes("$"));
  assert.ok(!/"\d{1,3},\d{3}/.test(csv), "no thousands separators inside amounts");
});

test("dates default to MM/DD/YYYY; opts.dateFormat iso keeps ISO", () => {
  assert.ok(buildJournalCSV(DAY, RANGE).includes(`"07/14/2026"`));
  assert.ok(buildJournalCSV(DAY, RANGE, { dateFormat: "iso" }).includes(`"2026-07-14"`));
});

test("a malicious location name can't smuggle a formula into the journal", () => {
  const evil = [cash("2026-07-13", "=HYPERLINK(0)", { sales: 50 })];
  const csv = buildJournalCSV(evil, RANGE);
  assert.ok(csv.includes(`"'=HYPERLINK(0)"`), csv);
});

test("memo carries provenance and blank fields are empty cells, never null", () => {
  const csv = buildJournalCSV(DAY, RANGE);
  assert.ok(csv.includes(`"DuoCount close · Main St · 2026-07-14"`));
  assert.ok(!csv.includes("null") && !csv.includes("undefined"));
  const salesRow = csv.split("\n").find((l) => l.includes(`"Cash sales"`));
  assert.ok(salesRow.includes(`"",`), "Debit cell is empty on a credit row");
});

/* ------------------------------- franchise ------------------------------- */

test("franchise: fixed column order for the generic profile, byte for byte", () => {
  const header = buildFranchiseCSV([], RANGE).split("\n")[0];
  assert.equal(header, "StoreNo,BusinessDate,GrossSales,CashSales,LotterySales,PaidOuts,OverShort,DeptCount,VerifiedPct");
});

test("franchise: the spec's worked day maps correctly, GrossSales = Cash + Lottery", () => {
  const csv = buildFranchiseCSV(DAY, RANGE, "generic", { storeNo: "1234" });
  const row = csv.split("\n")[1];
  assert.equal(row,
    `"1234","2026-07-14","2452.00","2140.00","312.00","85.00","-4.00","2","0"`);
});

test("franchise: one row per business date, sorted; days outside the range dropped", () => {
  const entries = [
    ...DAY,
    cash("2026-07-13", "Main St", { sales: 100, diff: 2 }),
    cash("2026-06-30", "Main St", { sales: 999 }), // outside
  ];
  const lines = buildFranchiseCSV(entries, RANGE).split("\n");
  assert.equal(lines.length, 3); // header + 2 days
  assert.ok(lines[1].includes(`"2026-07-13"`));
  assert.ok(lines[2].includes(`"2026-07-14"`));
});

test("franchise: OverShort keeps DuoCount's sign — positive on an over day", () => {
  const csv = buildFranchiseCSV([cash("2026-07-13", "A", { sales: 100, diff: 6 })], RANGE);
  assert.ok(csv.split("\n")[1].includes(`"6.00"`));
});

test("franchise: zero-activity aggregates render as 0.00 / 0, never blank or NaN", () => {
  const csv = buildFranchiseCSV([inv("2026-07-13", "A", -2)], RANGE); // inventory-only day
  const row = csv.split("\n")[1];
  assert.ok(row.includes(`"0.00"`));
  assert.ok(!row.includes("NaN"));
  assert.ok(row.includes(`"1"`)); // DeptCount = 1 (inventory)
});

test("franchise: VerifiedPct is rounded; verified rows counted across kinds", () => {
  const entries = [
    { ...cash("2026-07-13", "A", { sales: 100 }), verifiedBy: "Mgr" },
    cash("2026-07-13", "A", { sales: 50 }),
    { ...scratch("2026-07-13", "A", 20), verifiedBy: "Mgr" },
  ];
  const row = buildFranchiseCSV(entries, RANGE).split("\n")[1];
  assert.ok(row.endsWith(`"67"`), row); // 2 of 3 verified
});

test("franchise: a malicious storeNo can't smuggle a formula; empty period is header-only", () => {
  const csv = buildFranchiseCSV(DAY, RANGE, "generic", { storeNo: "=CMD()" });
  assert.ok(csv.includes(`"'=CMD()"`));
  assert.equal(buildFranchiseCSV([], RANGE).split("\n").length, 1);
});

test("franchise: an unknown profile throws; a custom profile object works", () => {
  assert.throws(() => buildFranchiseCSV(DAY, RANGE, "seven-eleven"));
  const custom = {
    id: "x", label: "X", dateFormat: "us",
    columns: [
      { header: "Date", value: (d, ctx) => d.date && ctx.dateFormat === "us" ? d.date : d.date },
      { header: "Net", value: (d) => d.overShort.toFixed(2) },
    ],
  };
  const csv = buildFranchiseCSV(DAY, RANGE, custom);
  assert.equal(csv.split("\n")[0], "Date,Net");
  assert.ok(csv.includes(`"-4.00"`));
  assert.ok(FRANCHISE_PROFILES.generic.columns.length === 9); // ships exactly the generic profile
});
