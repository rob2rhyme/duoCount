// buildRewardAudit + outstandingLiability are pure — no emulator.
// Run: npm run test:reward-audit
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRewardAudit, outstandingLiability } from "../src/lib/reward-audit.js";

const NOW = new Date("2026-07-17T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);
const earn = (over = {}) => ({ kind: "earn", points: 10, saleDollars: 10, customerId: "c1", by: "Eve", byId: "u1", ts: daysAgo(1), ...over });
const redeem = (over = {}) => ({ kind: "redeem", points: -100, customerId: "c1", by: "Eve", byId: "u1", ts: daysAgo(1), ...over });
const cash = (sales, n = 1) => ({ kind: "cash", date: daysAgo(n).toISOString().slice(0, 10), sales, diff: 0 });

test("a quiet, sales-backed ledger produces zero alerts and honest totals", () => {
  const events = [earn(), earn({ ts: daysAgo(3), points: 25, saleDollars: 25 }), redeem({ ts: daysAgo(2) })];
  const { alerts, totals } = buildRewardAudit(events, [cash(500)], { now: NOW });
  assert.deepEqual(alerts, []);
  assert.equal(totals.earned, 35);
  assert.equal(totals.redeemed, 100);
  assert.equal(totals.earns, 2);
  assert.equal(totals.redemptions, 1);
});

test("points issued beyond what counted sales support raise a high alert", () => {
  // $100 of counted sales supports 100 points at the default $1=1pt; 200
  // issued = 100 unexplained (past the 10% slack and the 20-point floor).
  const events = [earn({ points: 200, saleDollars: 200 })];
  const { alerts } = buildRewardAudit(events, [cash(100)], { now: NOW });
  const a = alerts.find((x) => x.kind === "reward-outpaced-sales");
  assert.ok(a);
  assert.equal(a.severity, "high");
  assert.match(a.title, /outpace/i);
  assert.match(a.detail, /100 unexplained/);
  // within slack+floor: no alert (110 issued vs 100 supported)
  const ok = buildRewardAudit([earn({ points: 110 })], [cash(100)], { now: NOW });
  assert.ok(!ok.alerts.some((x) => x.kind === "reward-outpaced-sales"));
});

test("one customer earning 3+ times in a day flags; 5+ is high; masked phone shown", () => {
  const day = daysAgo(1);
  const three = [earn({ ts: day }), earn({ ts: day }), earn({ ts: day })];
  const customers = [{ id: "c1", phone: "5551234567", pointsBalance: 30 }];
  const { alerts } = buildRewardAudit(three, [cash(1000)], { now: NOW, customers });
  const a = alerts.find((x) => x.kind === "reward-multi-earn");
  assert.ok(a);
  assert.equal(a.severity, "medium");
  assert.match(a.title, /•••-4567: 3 point earns/);
  const five = Array.from({ length: 5 }, () => earn({ ts: day }));
  assert.equal(buildRewardAudit(five, [cash(1000)], { now: NOW, customers })
    .alerts.find((x) => x.kind === "reward-multi-earn").severity, "high");
  // two earns the same day, one another day: no flag
  const spread = [earn({ ts: day }), earn({ ts: day }), earn({ ts: daysAgo(3) })];
  assert.ok(!buildRewardAudit(spread, [cash(1000)], { now: NOW, customers })
    .alerts.some((x) => x.kind === "reward-multi-earn"));
});

test("a clerk recording 3+ redemptions in one day flags, titled 'Name: …' for the redactor", () => {
  const day = daysAgo(1);
  const events = Array.from({ length: 3 }, (_, i) => redeem({ ts: day, customerId: `c${i}` }));
  const { alerts } = buildRewardAudit(events, [], { now: NOW });
  const a = alerts.find((x) => x.kind === "reward-clerk-redemptions");
  assert.ok(a);
  assert.equal(a.severity, "medium");
  assert.match(a.title, /^Eve: 3 redemptions/);
});

test("events outside the window are ignored; Firestore Timestamp ts shapes are read", () => {
  const stale = [earn({ ts: daysAgo(40), points: 999 })];
  assert.equal(buildRewardAudit(stale, [], { now: NOW }).totals.earned, 0);
  const fsTs = { seconds: Math.floor(daysAgo(1).getTime() / 1000) };
  assert.equal(buildRewardAudit([earn({ ts: fsTs })], [], { now: NOW }).totals.earned, 10);
});

test("outstandingLiability: linear at the store's settings; negatives clamped; empty safe", () => {
  const customers = [{ pointsBalance: 150 }, { pointsBalance: 50 }, { pointsBalance: -5 }];
  const l = outstandingLiability(customers); // defaults: 100 pts = $5
  assert.equal(l.points, 200);
  assert.equal(l.dollars, 10);
  const custom = outstandingLiability(customers, { redeemPoints: 50, redeemValue: 2 });
  assert.equal(custom.dollars, 8);
  assert.deepEqual(outstandingLiability([]), { points: 0, dollars: 0 });
});

test("VIP-multiplied earns don't false-alarm outpaced-sales; raw excess still does", () => {
  // $100 of sales supports 100 base points. 150 points issued at a recorded
  // ×1.5 VIP multiplier normalize back to 100 — fully supported, no alert.
  const vipEarn = earn({ points: 150, saleDollars: 100, multiplier: 1.5, vipTier: "Gold" });
  const ok = buildRewardAudit([vipEarn], [cash(100)], { now: NOW });
  assert.ok(!ok.alerts.some((x) => x.kind === "reward-outpaced-sales"));

  // The same 150 points with NO recorded multiplier are 50 unexplained → alert.
  const bad = buildRewardAudit([earn({ points: 150, saleDollars: 100 })], [cash(100)], { now: NOW });
  const a = bad.alerts.find((x) => x.kind === "reward-outpaced-sales");
  assert.ok(a);
  assert.match(a.detail, /50 unexplained/);

  // A forged sub-1 multiplier can't shrink the normalization (floors at 1).
  const forged = buildRewardAudit([earn({ points: 150, saleDollars: 100, multiplier: 0.1 })], [cash(100)], { now: NOW });
  assert.ok(forged.alerts.some((x) => x.kind === "reward-outpaced-sales"));
});
