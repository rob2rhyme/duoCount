// classifyHighRiskScratch is pure — no emulator. Run: npm run test:scratch-countersign
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyHighRiskScratch, highRiskScratchIds } from "../src/lib/scratch-countersign.js";

const NOW = new Date("2026-07-15T12:00:00Z");
const D = (n) => new Date(NOW.getTime() - n * 86400000);
const ds = (d) => d.toISOString().slice(0, 10);
const c = (id, over = {}) => ({
  id, kind: "scratch", pack: "0447-1", game: "$5", price: 5, locationId: "loc1",
  by: "Eve", byId: "u1", startno: 0, endno: 10, verifiedBy: null,
  ts: D(1), date: ds(D(1)), ...over,
});

test("a continuity gap flags the OPEN (next) count, never the honest prior close", () => {
  const entries = [
    c("close1", { endno: 30, ts: D(2), date: ds(D(2)) }),
    c("open1", { startno: 35, endno: 40, byId: "u2", by: "Sam", ts: D(1), date: ds(D(1)) }),
  ];
  const m = classifyHighRiskScratch(entries, [], { now: NOW });
  assert.ok(m.has("open1"));
  assert.ok(m.get("open1").reasons.includes("gap-open"));
  assert.equal(m.has("close1"), false);              // prior close is not the accountable read
  assert.equal(m.get("open1").severity, "medium");   // lone gap-open, no escalator
});

test("a countersigned (verified) risky count drops out of the set", () => {
  const entries = [
    c("close1", { endno: 30, ts: D(2), date: ds(D(2)) }),
    c("open1", { startno: 35, endno: 40, verifiedBy: "Mgr", ts: D(1), date: ds(D(1)) }),
  ];
  assert.equal(classifyHighRiskScratch(entries, [], { now: NOW }).has("open1"), false);
});

test("an off-hours count with NO gap is NOT flagged (structural shift-boundary counts aren't theft)", () => {
  const punches = [
    { userId: "u1", userName: "Eve", type: "in", ts: new Date("2026-07-14T14:00:00Z") },
    { userId: "u1", userName: "Eve", type: "out", ts: new Date("2026-07-14T22:00:00Z") },
  ];
  // A lone opening count logged at 5am before anyone clocked in — clean, no gap.
  const entries = [c("lone", { startno: 0, endno: 10, ts: new Date("2026-07-15T05:00:00Z"), date: "2026-07-15" })];
  assert.equal(classifyHighRiskScratch(entries, punches, { now: NOW }).size, 0);
});

test("a gap-open that is ALSO off-hours escalates to high severity", () => {
  const punches = [
    { userId: "u1", userName: "Eve", type: "in", ts: new Date("2026-07-13T14:00:00Z") },
    { userId: "u1", userName: "Eve", type: "out", ts: new Date("2026-07-13T22:00:00Z") },
  ];
  const entries = [
    c("close1", { endno: 30, ts: new Date("2026-07-13T15:00:00Z"), date: "2026-07-13" }),            // during shift
    c("open1", { startno: 35, endno: 40, byId: "u2", by: "Sam", ts: new Date("2026-07-14T03:00:00Z"), date: "2026-07-14" }), // 3am, unmanned
  ];
  const m = classifyHighRiskScratch(entries, punches, { now: NOW });
  assert.ok(m.has("open1"));
  assert.equal(m.get("open1").severity, "high");
  assert.deepEqual(m.get("open1").reasons, ["gap-open", "off-shift"]);
});

test("a sold-out-short finaled book flags that book's own count (lastId)", () => {
  const entries = [c("sold1", { pack: "SK-1", perPack: 100, startno: 0, endno: 60, soldOut: true, ts: D(1), date: ds(D(1)) })];
  const m = classifyHighRiskScratch(entries, [], { now: NOW });
  assert.ok(m.has("sold1"));
  assert.ok(m.get("sold1").reasons.includes("sellout-short"));
});

test("highRiskScratchIds returns just the flagged ids", () => {
  const entries = [
    c("close1", { endno: 30, ts: D(2), date: ds(D(2)) }),
    c("open1", { startno: 35, endno: 40, ts: D(1), date: ds(D(1)) }),
  ];
  const ids = highRiskScratchIds(entries, [], { now: NOW });
  assert.ok(ids.has("open1"));
  assert.equal(ids.size, 1);
});

test("a clean chain (no gap) flags nothing", () => {
  const entries = [
    c("a", { startno: 0, endno: 20, ts: D(2), date: ds(D(2)) }),
    c("b", { startno: 20, endno: 30, ts: D(1), date: ds(D(1)) }),
  ];
  assert.equal(classifyHighRiskScratch(entries, [], { now: NOW }).size, 0);
});
