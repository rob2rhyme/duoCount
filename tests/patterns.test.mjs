// detectPatterns is pure — no emulator needed. Run: npm run test:patterns
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPatterns, resolvePatternRules, PATTERN_RULES } from "../src/lib/patterns.js";

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

test("repeat OVERS by one person raise a person-overs alert; big totals are high", () => {
  const small = [cash({ diff: 1 }), cash({ diff: 2, date: dstr(3) }), cash({ diff: 1, date: dstr(5) })];
  const a1 = detectPatterns(small, { now: NOW });
  assert.equal(a1.length, 1);
  assert.equal(a1[0].kind, "person-overs");
  assert.equal(a1[0].severity, "medium");
  assert.match(a1[0].title, /3 over counts/);

  const big = small.map((e) => ({ ...e, diff: 10 }));
  assert.equal(detectPatterns(big, { now: NOW })[0].severity, "high");
});

test("stale open variances raise a variance-backlog alert, distinct from verify-backlog", () => {
  // verified (so no verify-backlog) but still flagged open and gone stale.
  const stale = Array.from({ length: PATTERN_RULES.minBacklog }, (_, i) =>
    cash({ varianceStatus: "open", verifiedBy: "Mia", ts: daysAgo(3 + i), date: dstr(3 + i), diff: -1 }));
  const alerts = detectPatterns(stale, { now: NOW });
  const vb = alerts.find((a) => a.kind === "variance-backlog");
  assert.ok(vb);
  assert.match(vb.title, new RegExp(`^${PATTERN_RULES.minBacklog} flagged counts open`));
  assert.ok(!alerts.some((a) => a.kind === "verify-backlog")); // they're verified
  // one under the threshold: no alert
  assert.ok(!detectPatterns(stale.slice(1), { now: NOW }).some((a) => a.kind === "variance-backlog"));
  // fresh (not stale) open variances don't count
  const fresh = stale.map((e) => ({ ...e, ts: NOW }));
  assert.ok(!detectPatterns(fresh, { now: NOW }).some((a) => a.kind === "variance-backlog"));
});

test("resolvePatternRules: defaults, clamping, and fallback for bad values", () => {
  assert.deepEqual(resolvePatternRules(), PATTERN_RULES);
  assert.deepEqual(resolvePatternRules({}), PATTERN_RULES);
  // out of range clamps to the bound (not to the default)
  assert.equal(resolvePatternRules({ windowDays: 500 }).windowDays, 90);
  assert.equal(resolvePatternRules({ windowDays: 0 }).windowDays, 1);
  assert.equal(resolvePatternRules({ minShorts: 1 }).minShorts, 2);
  // non-numeric / missing falls back to the default
  assert.equal(resolvePatternRules({ minShorts: "abc" }).minShorts, PATTERN_RULES.minShorts);
  assert.equal(resolvePatternRules({ minBacklog: null }).minBacklog, PATTERN_RULES.minBacklog);
  // numeric strings from form inputs are accepted and coerced
  assert.equal(resolvePatternRules({ windowDays: "7" }).windowDays, 7);
  assert.equal(resolvePatternRules({ highShortDollars: "12.5" }).highShortDollars, 12.5);
});

test("custom rules change what detectPatterns flags", () => {
  const two = [cash({ diff: -5 }), cash({ diff: -5, date: dstr(2) })]; // only 2 shorts
  // default minShorts=3 -> nothing
  assert.deepEqual(detectPatterns(two, { now: NOW }), []);
  // lower the bar to 2 -> a person-shorts alert appears
  const alerts = detectPatterns(two, { now: NOW, rules: { minShorts: 2 } });
  assert.ok(alerts.some((a) => a.kind === "person-shorts"));

  // a shorter lookback excludes an older short
  const spread = [cash({ diff: -5 }), cash({ diff: -5, date: dstr(2) }), cash({ diff: -5, date: dstr(10) })];
  assert.ok(detectPatterns(spread, { now: NOW }).some((a) => a.kind === "person-shorts")); // 14-day window: 3
  assert.ok(!detectPatterns(spread, { now: NOW, rules: { windowDays: 5 } }).some((a) => a.kind === "person-shorts")); // 5-day: only 2
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
