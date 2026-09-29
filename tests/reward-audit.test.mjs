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
  // Punch-card obligations joined this figure; an empty store zeroes all of it.
  assert.deepEqual(outstandingLiability([]), { points: 0, dollars: 0, stamps: 0, stampRewards: 0 });
});

test("outstandingLiability excludes points already lapsed under the inactivity policy", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  const customers = [
    { pointsBalance: 150, lastEarnAt: new Date("2026-07-01") },  // active → counts
    { pointsBalance: 200, lastEarnAt: new Date("2025-01-01") },  // 18mo idle → lapsed, excluded
  ];
  const l = outstandingLiability(customers, { expiryMonths: 12 }, now);
  assert.equal(l.points, 150);
  assert.equal(l.dollars, 7.5);
  // with expiry off, the lapsed balance is a liability again
  const off = outstandingLiability(customers, { expiryMonths: 0 }, now);
  assert.equal(off.points, 350);
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

// A referrer-credit ledger line (the one that pays the referrer — it alone
// carries referredCustomerId). points default to the 50-pt referrer bonus.
const referral = (over = {}) => ({
  kind: "referral", points: 50, customerId: "ref1", referredCustomerId: "new1",
  by: "Eve", byId: "u1", ts: daysAgo(1), ...over,
});

test("a clerk booking a burst of referral enrollments in one day is flagged (the actor)", () => {
  // 3 referrals by one clerk, same day, each naming a DIFFERENT referrer account
  // (so only the clerk-burst fires, not the account-farm).
  const events = [
    referral({ customerId: "ref1", referredCustomerId: "n1" }),
    referral({ customerId: "ref2", referredCustomerId: "n2" }),
    referral({ customerId: "ref3", referredCustomerId: "n3" }),
  ];
  const { alerts } = buildRewardAudit(events, [], { now: NOW });
  const a = alerts.find((x) => x.kind === "reward-referral-burst");
  assert.ok(a);
  assert.equal(a.params.name, "Eve");
  assert.equal(a.params.count, 3);
  assert.equal(a.severity, "medium"); // 3..4 medium, >=5 high
  assert.ok(!alerts.some((x) => x.kind === "reward-referral-farm"));
});

test("one account farmed as referrer across days/clerks is flagged, phone masked", () => {
  // 4 referrals crediting ref1, spread across 4 clerks and 4 days (so the
  // per-day clerk-burst never trips — only the window-wide account farm).
  const events = [
    referral({ byId: "u1", by: "A", ts: daysAgo(1), referredCustomerId: "n1" }),
    referral({ byId: "u2", by: "B", ts: daysAgo(2), referredCustomerId: "n2" }),
    referral({ byId: "u3", by: "C", ts: daysAgo(3), referredCustomerId: "n3" }),
    referral({ byId: "u4", by: "D", ts: daysAgo(4), referredCustomerId: "n4" }),
  ];
  const { alerts } = buildRewardAudit(events, [], { now: NOW, customers: [{ id: "ref1", phone: "5551234567" }] });
  const a = alerts.find((x) => x.kind === "reward-referral-farm");
  assert.ok(a);
  assert.equal(a.params.count, 4);
  assert.equal(a.params.points, 200); // 4 × 50
  assert.notEqual(a.params.who, "?"); // resolved to a masked phone
  assert.ok(!alerts.some((x) => x.kind === "reward-referral-burst"));
});

test("severity escalates: 5 same-day referrals => high burst; 8 farmed => high farm", () => {
  const burst = buildRewardAudit(
    Array.from({ length: 5 }, (_, i) => referral({ customerId: `r${i}`, referredCustomerId: `n${i}` })),
    [], { now: NOW });
  assert.equal(burst.alerts.find((x) => x.kind === "reward-referral-burst").severity, "high");

  const farm = buildRewardAudit(
    Array.from({ length: 8 }, (_, i) => referral({ byId: `u${i}`, by: `C${i}`, ts: daysAgo(i + 1), referredCustomerId: `n${i}` })),
    [], { now: NOW });
  assert.equal(farm.alerts.find((x) => x.kind === "reward-referral-farm").severity, "high");
});

test("friend-credit lines (no referredCustomerId) and reversed referrals don't count", () => {
  const events = [
    // friend-side credits — real referral lines but NOT the referrer payout
    { kind: "referral", points: 25, customerId: "new1", referredBy: "ref1", by: "Eve", byId: "u1", ts: daysAgo(1) },
    { kind: "referral", points: 25, customerId: "new2", referredBy: "ref1", by: "Eve", byId: "u1", ts: daysAgo(1) },
    { kind: "referral", points: 25, customerId: "new3", referredBy: "ref1", by: "Eve", byId: "u1", ts: daysAgo(1) },
    // reversed referrer payouts — undone, so not fraud signal
    referral({ referredCustomerId: "n1", reversedBy: "x1" }),
    referral({ referredCustomerId: "n2", reversedBy: "x2" }),
    referral({ referredCustomerId: "n3", reversedBy: "x3" }),
  ];
  const { alerts } = buildRewardAudit(events, [], { now: NOW });
  assert.equal(alerts.some((x) => x.kind?.startsWith("reward-referral")), false);
});

test("a lone occasional referral raises nothing", () => {
  const { alerts } = buildRewardAudit([referral()], [], { now: NOW });
  assert.equal(alerts.some((x) => x.kind?.startsWith("reward-referral")), false);
});

/* ------------------ clerk affinity + punch-card coverage ------------------ */
// The patient skim: a clerk attaching their own account to OTHER people's real
// purchases. OUTPACED SALES is blind to it by construction (the points ARE
// supported by the cash denominator) and two earns a day never trips
// MULTI-EARN. Who rang them is the only signal left.

import { binomialTail, clerkAffinity } from "../src/lib/reward-audit.js";

const atDay = (n) => new Date(Date.UTC(2026, 0, n)).toISOString();
const earnBy = (customerId, byId, n, by = byId) =>
  ({ kind: "earn", customerId, byId, by, points: 10, ts: atDay(n) });

test("binomialTail: a single-clerk store can never look suspicious", () => {
  // p = 1 means that clerk rings everything anyway; the tail is 1, so no alert.
  assert.equal(binomialTail(5, 5, 1), 1);
  assert.equal(binomialTail(40, 40, 1), 1);
});

test("binomialTail matches the exact binomial", () => {
  // P(X>=5 | n=5, p=0.7) = 0.7^5
  assert.ok(Math.abs(binomialTail(5, 5, 0.7) - 0.7 ** 5) < 1e-12);
  // P(X>=1 | n=3, p=0.5) = 1 - 0.5^3
  assert.ok(Math.abs(binomialTail(1, 3, 0.5) - (1 - 0.5 ** 3)) < 1e-12);
  assert.equal(binomialTail(0, 5, 0.5), 1, "k=0 is certain");
  assert.equal(binomialTail(6, 5, 0.5), 0, "more than every trial is impossible");
});

test("affinity flags an account rung almost only by one otherwise-quiet clerk", () => {
  // Clerk B rings a small share of the window, but all 6 of victim account X.
  const lines = [
    ...Array.from({ length: 6 }, (_, i) => earnBy("X", "B", i + 1)),
    ...Array.from({ length: 30 }, (_, i) => earnBy(`c${i}`, "A", (i % 14) + 1)),
  ];
  const hits = clerkAffinity(lines);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].customerId, "X");
  assert.equal(hits[0].byId, "B");
  assert.ok(hits[0].p < 0.001, `p was ${hits[0].p}`);
});

test("affinity does NOT flag a regular in a store where one clerk works most shifts", () => {
  // The false positive that would make this unusable. Clerk A rings ~70% of
  // everything, so ringing 5 of one customer's 7 visits is unremarkable.
  const others = [];
  for (let i = 0; i < 40; i++) others.push(earnBy(`c${i}`, i % 10 < 7 ? "A" : "B", (i % 14) + 1));
  const lines = [
    ...others,
    ...Array.from({ length: 5 }, (_, i) => earnBy("R", "A", i + 1)),
    earnBy("R", "B", 6), earnBy("R", "B", 7),
  ];
  assert.deepEqual(clerkAffinity(lines).filter((h) => h.customerId === "R"), []);
});

test("affinity ignores accounts with too few visits to mean anything", () => {
  const lines = [
    earnBy("X", "B", 1), earnBy("X", "B", 2),
    ...Array.from({ length: 30 }, (_, i) => earnBy(`c${i}`, "A", (i % 14) + 1)),
  ];
  assert.deepEqual(clerkAffinity(lines), [], "2 visits is not evidence");
});

test("affinity's baseline excludes the account under test", () => {
  // Otherwise a dominant account inflates the very rate it is measured against
  // and hides itself. B rings ONLY account X, 8 times, out of a 40-line window.
  const lines = [
    ...Array.from({ length: 8 }, (_, i) => earnBy("X", "B", i + 1)),
    ...Array.from({ length: 32 }, (_, i) => earnBy(`c${i}`, "A", (i % 14) + 1)),
  ];
  const hit = clerkAffinity(lines).find((h) => h.customerId === "X");
  assert.ok(hit, "must be flagged");
  assert.equal(hit.baseline, 0, "B rang nothing else, so the baseline is 0");
});

test("reversed lines never count toward affinity", () => {
  const lines = Array.from({ length: 8 }, (_, i) => ({ ...earnBy("X", "B", i + 1), reversedBy: "u1" }));
  assert.deepEqual(clerkAffinity([...lines, ...Array.from({ length: 30 }, (_, i) => earnBy(`c${i}`, "A", 1))]), []);
});

test("the audit surfaces affinity and punch-card alerts", () => {
  const events = [
    // 6 earns on X, all by the otherwise-quiet clerk B
    ...Array.from({ length: 6 }, (_, i) => earnBy("X", "B", i + 1)),
    ...Array.from({ length: 30 }, (_, i) => earnBy(`c${i}`, "A", (i % 14) + 1)),
    // and one card stamped 4 times in a day
    ...Array.from({ length: 4 }, () => ({ kind: "stamp", customerId: "Y", cardId: "c1", byId: "A", by: "A", points: 0, ts: atDay(3) })),
  ];
  const { alerts } = buildRewardAudit(events, [], {
    rules: { enabled: true }, customers: [{ id: "X", phone: "5551234567" }, { id: "Y", phone: "5557654321" }],
    windowDays: 60, now: new Date(Date.UTC(2026, 0, 20)),
  });
  const codes = alerts.map((a) => a.code);
  assert.ok(codes.includes("reward-clerk-affinity"), `got ${codes.join(", ")}`);
  assert.ok(codes.includes("reward-multi-stamp"), `got ${codes.join(", ")}`);
  for (const a of alerts) {
    assert.ok(a.title && !a.title.includes("{"), `unrendered title: ${a.title}`);
    assert.ok(a.detail && !a.detail.includes("{"), `unrendered detail: ${a.detail}`);
  }
});

test("punch-card obligations appear in the liability, as counts not invented dollars", () => {
  const rules = { enabled: true, stamps: [{ id: "c1", name: "Coffee", goal: 10, reward: "Free coffee" }] };
  const out = outstandingLiability([
    { id: "a", pointsBalance: 250, stamps: { c1: 12 } },
    { id: "b", pointsBalance: 40, stamps: { c1: 7 } },
  ], rules);
  assert.equal(out.stamps, 19);
  assert.equal(out.stampRewards, 1, "12 stamps on a goal of 10 is one card owed");
  assert.ok(typeof out.dollars === "number", "points still costed");
});
