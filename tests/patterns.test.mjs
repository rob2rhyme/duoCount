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

test("two people who share a name get distinct alert ids (M6)", () => {
  // Same display name ("Eve"), different user ids — three shorts each. Buckets
  // key off the id, so the alert ids must differ; the old name-based id collided
  // and React's key={p.id} dropped one of the two.
  const a = [cash({ diff: -5, byId: "u1" }), cash({ diff: -5, byId: "u1", date: dstr(3) }), cash({ diff: -5, byId: "u1", date: dstr(5) })];
  const b = [cash({ diff: -5, byId: "u9" }), cash({ diff: -5, byId: "u9", date: dstr(3) }), cash({ diff: -5, byId: "u9", date: dstr(5) })];
  const alerts = detectPatterns([...a, ...b], { now: NOW }).filter((x) => x.kind === "person-shorts");
  assert.equal(alerts.length, 2);
  assert.equal(new Set(alerts.map((x) => x.id)).size, 2);
  assert.ok(alerts.map((x) => x.id).includes("person-shorts:u1"));
  assert.ok(alerts.map((x) => x.id).includes("person-shorts:u9"));
});

test("two drawers sharing a name get distinct alert ids (M6)", () => {
  // Same drawerName, different drawerId, each short under two different people.
  const mk = (drawerId) => [
    cash({ diff: -3, drawerId, byId: "u1" }),
    cash({ diff: -3, drawerId, byId: "u2", date: dstr(2) }),
    cash({ diff: -3, drawerId, byId: "u1", date: dstr(4) }),
  ];
  const alerts = detectPatterns([...mk("dA"), ...mk("dB")], { now: NOW }).filter((x) => x.kind === "drawer-shorts");
  assert.equal(alerts.length, 2);
  assert.equal(new Set(alerts.map((x) => x.id)).size, 2);
  assert.ok(alerts.map((x) => x.id).includes("drawer-shorts:dA"));
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

// ---- 7. escalating short trend (person) ----------------------------------
// midCut for the default 14-day window is 7 days ago: dates >= dstr(7) are the
// "recent" half, older ones the "earlier" half.

test("shorts materially worse in the recent half raise a person-trend alert", () => {
  const esc = [
    cash({ diff: -2, date: dstr(10), ts: daysAgo(10) }), // earlier half: $2 short
    cash({ diff: -5, date: dstr(1) }),                    // recent half: $10 short over 2 counts
    cash({ diff: -5, date: dstr(2) }),
  ];
  const t = detectPatterns(esc, { now: NOW }).find((a) => a.kind === "person-trend");
  assert.ok(t, "escalation ($10 recent vs $2 earlier, >=2x) should flag");
  assert.equal(t.severity, "medium");        // recent $10 < highShortDollars ($20)
  assert.equal(t.id, "person-trend:u1");
});

test("person-trend goes high when the recent half is big", () => {
  const big = [
    cash({ diff: -5, date: dstr(10), ts: daysAgo(10) }),
    cash({ diff: -15, date: dstr(1) }), cash({ diff: -15, date: dstr(2) }), // $30 recent
  ];
  assert.equal(detectPatterns(big, { now: NOW }).find((a) => a.kind === "person-trend").severity, "high");
});

test("a flat short rate across both halves is not a trend", () => {
  const flat = [
    cash({ diff: -5, date: dstr(9), ts: daysAgo(9) }), cash({ diff: -5, date: dstr(10), ts: daysAgo(10) }),
    cash({ diff: -5, date: dstr(1) }), cash({ diff: -5, date: dstr(2) }),
  ];
  assert.ok(!detectPatterns(flat, { now: NOW }).some((a) => a.kind === "person-trend"));
});

test("a fresh streak (nothing earlier) is a person-shorts signal, not a trend", () => {
  const fresh = [cash({ diff: -5 }), cash({ diff: -5, date: dstr(2) }), cash({ diff: -5, date: dstr(3) })];
  const a = detectPatterns(fresh, { now: NOW });
  assert.ok(a.some((x) => x.kind === "person-shorts"));
  assert.ok(!a.some((x) => x.kind === "person-trend"), "no earlier shorts => not an escalation");
});

test("a single recent short over a small earlier one is not a trend (blip guard)", () => {
  const blip = [cash({ diff: -1, date: dstr(10), ts: daysAgo(10) }), cash({ diff: -9, date: dstr(1) })];
  assert.ok(!detectPatterns(blip, { now: NOW }).some((a) => a.kind === "person-trend"));
});

// ---- 8. pack continuity gaps (entry-based; replaced settle-shortfall) ----
const scratch = (over = {}) => ({
  kind: "scratch", date: dstr(1), by: "Eve", byId: "u1", verifiedBy: "Mia",
  game: "$5 Diamond", pack: "0447-233", price: 5, locationId: "loc1",
  startno: 0, endno: 10, ts: daysAgo(1), ...over,
});

test("a start # above the previous end # raises a pack-gap alert", () => {
  const es = [
    scratch({ startno: 0, endno: 37, date: dstr(2), ts: daysAgo(2) }),
    scratch({ startno: 41, endno: 50, by: "Sam", byId: "u2", date: dstr(1), ts: daysAgo(1) }),
  ];
  const s = detectPatterns(es, { now: NOW }).find((a) => a.kind === "pack-gap");
  assert.ok(s);
  assert.equal(s.severity, "high");            // 4 tickets * $5 = $20 >= $20
  assert.equal(s.id, "pack-gap:loc1|0447-233");
  assert.match(s.title, /4 tickets unaccounted/);
  assert.match(s.detail, /\$20\.00/);
});

test("small-dollar gaps are medium; a clean chain never alerts", () => {
  const small = [
    scratch({ price: 1, startno: 0, endno: 10, date: dstr(2), ts: daysAgo(2) }),
    scratch({ price: 1, startno: 12, endno: 20, date: dstr(1), ts: daysAgo(1) }),
  ];
  assert.equal(detectPatterns(small, { now: NOW }).find((a) => a.kind === "pack-gap").severity, "medium");

  const clean = [
    scratch({ startno: 0, endno: 10, date: dstr(2), ts: daysAgo(2) }),
    scratch({ startno: 10, endno: 20, date: dstr(1), ts: daysAgo(1) }),
  ];
  assert.ok(!detectPatterns(clean, { now: NOW }).some((a) => a.kind === "pack-gap"));
});

// ---- 9. mass pack jump (after-hours batch signature) ----
test("many packs jumping in one window raise a SINGLE rolled-up mass-jump alert", () => {
  const closeTs = new Date("2026-07-10T22:00:00Z"); // night before
  const openTs = new Date("2026-07-11T08:00:00Z");  // this morning
  const pk = (pack, closeEnd, openStart) => [
    scratch({ pack, startno: 0, endno: closeEnd, ts: closeTs, date: "2026-07-10" }),
    scratch({ pack, startno: openStart, endno: openStart + 5, by: "Sam", byId: "u2", ts: openTs, date: "2026-07-11" }),
  ];
  const es = [...pk("0447-1", 30, 40), ...pk("0447-2", 50, 62), ...pk("0447-3", 10, 15)];
  const mass = detectPatterns(es, { now: NOW }).filter((a) => a.kind === "pack-mass-jump");
  assert.equal(mass.length, 1);                       // one rollup, not three
  assert.equal(mass[0].params.count, 3);
  assert.equal(mass[0].severity, "high");             // 27 tickets × $5 = $135 ≥ $20
  assert.match(mass[0].title, /3 scratch packs jumped together/);
  assert.ok(!/\{[a-z]+\}/i.test(mass[0].detail), "all params interpolated");
});

test("two packs jumping together do not reach the mass threshold", () => {
  const closeTs = new Date("2026-07-10T22:00:00Z"), openTs = new Date("2026-07-11T08:00:00Z");
  const pk = (pack) => [
    scratch({ pack, startno: 0, endno: 30, ts: closeTs, date: "2026-07-10" }),
    scratch({ pack, startno: 40, endno: 45, ts: openTs, date: "2026-07-11" }),
  ];
  const es = [...pk("A"), ...pk("B")];
  assert.ok(!detectPatterns(es, { now: NOW }).some((a) => a.kind === "pack-mass-jump"));
});

// ---- 10. off-shift count (store unmanned) ----
test("a scratch count signed while nobody was clocked in raises an off-shift alert", () => {
  const punches = [
    { userId: "u1", userName: "Eve", type: "in", ts: new Date("2026-07-10T09:00:00Z") },
    { userId: "u1", userName: "Eve", type: "out", ts: new Date("2026-07-10T17:00:00Z") },
  ];
  // Eve signs a scratch count at 2am — hours after the store emptied.
  const es = [scratch({ startno: 0, endno: 10, ts: new Date("2026-07-11T02:00:00Z"), date: "2026-07-11" })];
  const off = detectPatterns(es, { now: NOW, punches }).find((x) => x.kind === "count-off-shift");
  assert.ok(off);
  assert.equal(off.params.name, "Eve");
  assert.match(off.title, /nobody was clocked in/);
});

test("without punches the off-shift detector stays silent (store not using the clock)", () => {
  const es = [scratch({ startno: 0, endno: 10, ts: new Date("2026-07-11T02:00:00Z"), date: "2026-07-11" })];
  assert.ok(!detectPatterns(es, { now: NOW }).some((x) => x.kind === "count-off-shift"));
});

test("pack-gap ignores rollbacks, other locations' packs, and out-of-window counts", () => {
  // next start BELOW previous end — a re-count, not missing tickets
  const rollback = [
    scratch({ startno: 0, endno: 30, date: dstr(2), ts: daysAgo(2) }),
    scratch({ startno: 27, endno: 33, date: dstr(1), ts: daysAgo(1) }),
  ];
  assert.ok(!detectPatterns(rollback, { now: NOW }).some((a) => a.kind === "pack-gap"));
  // same pack # at two locations never cross-chains
  const twoStores = [
    scratch({ locationId: "loc1", startno: 0, endno: 10, date: dstr(2), ts: daysAgo(2) }),
    scratch({ locationId: "loc2", startno: 50, endno: 60, date: dstr(1), ts: daysAgo(1) }),
  ];
  assert.ok(!detectPatterns(twoStores, { now: NOW }).some((a) => a.kind === "pack-gap"));
  // the earlier count fell out of the window, so there's no pair to compare
  const stale = [
    scratch({ startno: 0, endno: 10, date: dstr(40), ts: daysAgo(40) }),
    scratch({ startno: 90, endno: 95, date: dstr(1), ts: daysAgo(1) }),
  ];
  assert.ok(!detectPatterns(stale, { now: NOW }).some((a) => a.kind === "pack-gap"));
});

test("pack-gap reads Firestore Timestamp `ts` shapes (what the digest passes)", () => {
  const fsTs = (d) => ({ seconds: Math.floor(daysAgo(d).getTime() / 1000) });
  const es = [
    scratch({ startno: 0, endno: 10, date: dstr(2), ts: fsTs(2) }),
    scratch({ startno: 15, endno: 20, by: "Sam", byId: "u2", date: dstr(1), ts: fsTs(1) }),
  ];
  assert.ok(detectPatterns(es, { now: NOW }).some((a) => a.kind === "pack-gap"));
});
