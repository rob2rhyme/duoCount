// detectPatterns is pure — no emulator needed. Run: npm run test:patterns
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPatterns, PATTERN_RULES } from "../src/lib/patterns.js";

const NOW = new Date("2026-07-11T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);
const dstr = (n) => daysAgo(n).toISOString().slice(0, 10);

const cash = (over = {}) => ({
  kind: "cash", date: dstr(1), by: "Eve", byId: "u1",
  drawerName: "POS", diff: 0, verifiedBy: "Mia", ts: daysAgo(1),
  ...over,
});

test("quiet, verified books produce zero alerts", () => {
  const entries = [cash(), cash({ diff: 0.5 }), cash({ diff: -1 }), cash({ diff: -2, by: "Bob", byId: "u2" })];
  assert.deepEqual(detectPatterns(entries, { now: NOW }), []);
});

test("three shorts by one person in the window trigger a person alert; big totals are high", () => {
  const small = [cash({ diff: -1 }), cash({ diff: -2, date: dstr(3) }), cash({ diff: -1, date: dstr(5) })];
  const a1 = detectPatterns(small, { now: NOW });
  assert.equal(a1.length, 1);
  assert.equal(a1[0].kind, "person-shorts");
  assert.equal(a1[0].severity, "medium");

  const big = small.map((e) => ({ ...e, diff: -10 }));
  const a2 = detectPatterns(big, { now: NOW });
  assert.equal(a2[0].severity, "high");
});

test("shorts outside the window don't count", () => {
  const stale = [cash({ diff: -5, date: dstr(20) }), cash({ diff: -5, date: dstr(21) }), cash({ diff: -5, date: dstr(22) })];
  assert.deepEqual(detectPatterns(stale, { now: NOW }), []);
});

test("same drawer short under multiple hands raises a drawer hot-spot", () => {
  const entries = [
    cash({ diff: -3 }),
    cash({ diff: -3, by: "Bob", byId: "u2", date: dstr(2), ts: daysAgo(2) }),
    cash({ diff: -3, by: "Cal", byId: "u3", date: dstr(3), ts: daysAgo(3) }),
  ];
  const alerts = detectPatterns(entries, { now: NOW });
  assert.ok(alerts.some((a) => a.kind === "drawer-shorts"));
  // ...but one person alone on a drawer stays a person question, not a drawer one
  const solo = [cash({ diff: -3 }), cash({ diff: -3, date: dstr(2) }), cash({ diff: -3, date: dstr(3) })];
  assert.ok(!detectPatterns(solo, { now: NOW }).some((a) => a.kind === "drawer-shorts"));
});

test("unverified backlog alerts at the threshold, counting only stale entries", () => {
  const staleCount = PATTERN_RULES.minBacklog;
  const fresh = [cash({ verifiedBy: null, ts: NOW })];
  const stale = Array.from({ length: staleCount }, (_, i) =>
    cash({ verifiedBy: null, ts: daysAgo(3 + i), date: dstr(3 + i) }));
  const alerts = detectPatterns([...fresh, ...stale], { now: NOW });
  const backlog = alerts.find((a) => a.kind === "verify-backlog");
  assert.ok(backlog);
  assert.match(backlog.title, new RegExp(`^${staleCount} `));
  assert.ok(!detectPatterns([...fresh, ...stale.slice(1)], { now: NOW }).some((a) => a.kind === "verify-backlog"));
});

test("an item repeatedly counting short raises a shrink streak", () => {
  const inv = (over = {}) => ({
    kind: "inventory", date: dstr(1), by: "Eve", byId: "u1",
    itemName: "Elf Bar", unit: "unit", diff: -2, verifiedBy: "Mia", ts: daysAgo(1),
    ...over,
  });
  const alerts = detectPatterns([inv(), inv({ date: dstr(4) }), inv({ date: dstr(8) })], { now: NOW });
  const shrink = alerts.find((a) => a.kind === "item-shrink");
  assert.ok(shrink);
  assert.match(shrink.detail, /6 units missing/);
});

test("high-severity alerts sort first", () => {
  const entries = [
    // person streak totaling $30 short => high
    cash({ diff: -10 }), cash({ diff: -10, date: dstr(2) }), cash({ diff: -10, date: dstr(3) }),
    // separate drawer hot-spot => medium
    cash({ drawerName: "Safe", diff: -1, by: "Bob", byId: "u2", date: dstr(2) }),
    cash({ drawerName: "Safe", diff: -1, by: "Cal", byId: "u3", date: dstr(3) }),
    cash({ drawerName: "Safe", diff: -1, by: "Dee", byId: "u4", date: dstr(4) }),
  ];
  const alerts = detectPatterns(entries, { now: NOW });
  assert.ok(alerts.length >= 2);
  assert.equal(alerts[0].severity, "high");
});
