// Gaming ledger split + summary — pure. Run: node --test tests/gaming.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSplit, normalizeMachine, buildGamingSummary, DEFAULT_STORE_PCT } from "../src/lib/gaming.js";

test("a profitable machine splits the remainder by the store percentage", () => {
  const r = computeSplit(1000, 400, 60); // net 600, store 60%
  assert.equal(r.net, 600);
  assert.equal(r.storeShare, 360);
  assert.equal(r.companyShare, 240);
  assert.equal(r.storePct, 60);
});

test("50/50 is the default split", () => {
  const r = computeSplit(500, 100); // net 400
  assert.equal(r.storePct, DEFAULT_STORE_PCT);
  assert.equal(r.storeShare, 200);
  assert.equal(r.companyShare, 200);
});

test("payout above collection: store floors at $0, the loss is the company's", () => {
  const r = computeSplit(300, 500, 60); // net -200
  assert.equal(r.net, -200);
  assert.equal(r.storeShare, 0);          // store never goes negative
  assert.equal(r.companyShare, -200);     // the whole loss lands on the company
});

test("exactly break-even pays nobody", () => {
  const r = computeSplit(250, 250, 50);
  assert.equal(r.net, 0);
  assert.equal(r.storeShare, 0);
  assert.equal(r.companyShare, 0);
});

test("money rounds to cents and a bad percentage is clamped to [0,100]", () => {
  const r = computeSplit(100.005, 0.004, 33.33);
  assert.equal(r.collection, 100.01);
  assert.equal(r.payout, 0);
  assert.equal(computeSplit(100, 0, 150).storePct, 100);
  assert.equal(computeSplit(100, 0, -5).storePct, 0);
});

test("normalizeMachine requires a name, a company, and a valid store percentage", () => {
  assert.equal(normalizeMachine({ name: "", company: "A", storePct: "50" }).code, "name_missing");
  assert.equal(normalizeMachine({ name: "Slot 1", company: "", storePct: "50" }).code, "company_missing");
  assert.equal(normalizeMachine({ name: "Slot 1", company: "A", storePct: "" }).code, "pct_missing");
  assert.equal(normalizeMachine({ name: "Slot 1", company: "A", storePct: "120" }).code, "pct_invalid");
  const ok = normalizeMachine({ name: "Slot 1", company: "AcmeVend", type: "slot", storePct: "60", cadence: "monthly" });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { name: "Slot 1", company: "AcmeVend", type: "slot", storePct: 60, cadence: "monthly" });
});

test("normalizeMachine defaults an unknown type/cadence to sane values", () => {
  const r = normalizeMachine({ name: "X", company: "Y", type: "laser", cadence: "hourly", storePct: "50" });
  assert.equal(r.value.type, "other");
  assert.equal(r.value.cadence, "weekly");
});

test("buildGamingSummary rolls up grand totals, per-machine and per-company", () => {
  const rows = [
    { machineId: "m1", machineName: "Slot 1", company: "Acme", collectionDate: "2026-07-01", collection: 1000, payout: 400, net: 600, storeShare: 360, companyShare: 240 },
    { machineId: "m2", machineName: "ATM", company: "CashCo", collectionDate: "2026-07-08", collection: 200, payout: 0, net: 200, storeShare: 100, companyShare: 100 },
    { machineId: "m1", machineName: "Slot 1", company: "Acme", collectionDate: "2026-07-15", collection: 300, payout: 500, net: -200, storeShare: 0, companyShare: -200 },
  ];
  const s = buildGamingSummary(rows);
  assert.equal(s.count, 3);
  assert.equal(s.totals.collection, 1500);
  assert.equal(s.totals.storeShare, 460);
  assert.equal(s.totals.net, 600);
  // machines sorted by store take desc: Slot 1 (360) before ATM (100)
  assert.equal(s.machines[0].machineName, "Slot 1");
  assert.equal(s.machines[0].storeShare, 360);   // 360 + 0 across its two collections
  assert.equal(s.machines[0].count, 2);
  const acme = s.companies.find((c) => c.company === "Acme");
  assert.equal(acme.storeShare, 360);
  assert.equal(acme.companyShare, 40);           // 240 + (−200)
});

test("buildGamingSummary scopes by collectionDate range and orders the series", () => {
  const rows = [
    { machineId: "m1", machineName: "A", company: "C", collectionDate: "2026-06-30", collection: 100, payout: 0, net: 100, storeShare: 50, companyShare: 50 },
    { machineId: "m1", machineName: "A", company: "C", collectionDate: "2026-07-10", collection: 200, payout: 0, net: 200, storeShare: 100, companyShare: 100 },
    { machineId: "m1", machineName: "A", company: "C", collectionDate: "2026-07-20", collection: 300, payout: 0, net: 300, storeShare: 150, companyShare: 150 },
  ];
  const s = buildGamingSummary(rows, { from: "2026-07-01", to: "2026-07-15" });
  assert.equal(s.count, 1);
  assert.equal(s.totals.storeShare, 100);
  assert.equal(s.series.length, 1);
  assert.equal(s.series[0].date, "2026-07-10");
});
