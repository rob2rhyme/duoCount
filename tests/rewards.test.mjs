// Pure rewards helpers — no emulator. Run: npm run test:rewards
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REWARDS, TIER_TYPES, resolveRewards, rewardTiers, tierDollarValue, vipTierFor, nextStreak,
  effectivePercent, pointsForSale, canRedeem, canRedeemTier, pointDollarValue,
  sanitizeProfile, daysSince, isNewCustomer, normalizePhone, maskPhone,
} from "../src/lib/rewards.js";

test("resolveRewards: defaults, off-by-default, clamps, and bad-value fallback", () => {
  assert.deepEqual(resolveRewards(), {
    enabled: false, earnPerDollar: REWARDS.earnPerDollar,
    redeemPoints: REWARDS.redeemPoints, redeemValue: REWARDS.redeemValue,
    streakHours: REWARDS.streakHours, tiers: [], vip: [],
  });
  assert.equal(resolveRewards({}).enabled, false);
  assert.equal(resolveRewards({ enabled: true }).enabled, true);
  assert.equal(resolveRewards({ enabled: "yes" }).enabled, false); // strict boolean
  assert.equal(resolveRewards({ earnPerDollar: 1000 }).earnPerDollar, 100);
  assert.equal(resolveRewards({ earnPerDollar: 0 }).earnPerDollar, 0.1);
  assert.equal(resolveRewards({ redeemPoints: 3 }).redeemPoints, 10);
  assert.equal(resolveRewards({ redeemPoints: "250" }).redeemPoints, 250);
  assert.equal(resolveRewards({ redeemPoints: 99.6 }).redeemPoints, 100); // whole points
  assert.equal(resolveRewards({ redeemValue: "abc" }).redeemValue, REWARDS.redeemValue);
});

test("effectivePercent: the defaults are 5.0% back; chain-style settings land near 1%", () => {
  assert.equal(effectivePercent(), 5);
  // 10 pts/$ with $1 per 1,000 pts (the 7-Eleven shape) = 1%
  assert.equal(effectivePercent({ earnPerDollar: 10, redeemPoints: 1000, redeemValue: 1 }), 1);
  assert.equal(effectivePercent({ earnPerDollar: 1, redeemPoints: 100, redeemValue: 2 }), 2);
});

test("pointsForSale: rounds to whole points; junk and non-positive sales earn 0", () => {
  assert.equal(pointsForSale(13.49), 13);
  assert.equal(pointsForSale(13.5), 14);
  assert.equal(pointsForSale(0.4), 0);
  assert.equal(pointsForSale(0), 0);
  assert.equal(pointsForSale(-5), 0);
  assert.equal(pointsForSale("lots"), 0);
  assert.equal(pointsForSale(10, { earnPerDollar: 2 }), 20);
});

test("canRedeem: threshold inclusive, driven by resolved rules", () => {
  assert.equal(canRedeem(100), true);
  assert.equal(canRedeem(99), false);
  assert.equal(canRedeem(50, { redeemPoints: 50 }), true);
});

test("normalizePhone: digits only, US leading-1 dropped, length-bounded", () => {
  assert.equal(normalizePhone("+1 (555) 123-4567"), "5551234567");
  assert.equal(normalizePhone("555-123-4567"), "5551234567");
  assert.equal(normalizePhone("5551234"), "5551234"); // 7 digits ok
  assert.equal(normalizePhone("12345"), "");          // too short
  assert.equal(normalizePhone("1".repeat(16)), "");   // too long
  assert.equal(normalizePhone(null), "");
});

test("maskPhone: shows only the last 4", () => {
  assert.equal(maskPhone("5551234567"), "•••-4567");
  assert.ok(!maskPhone("5551234567").includes("555123"));
});

/* ------------------------------ reward tiers ------------------------------ */

test("rewardTiers: no configured tiers → one implicit cash tier from the legacy reward", () => {
  const tiers = rewardTiers();
  assert.equal(tiers.length, 1);
  assert.deepEqual(tiers[0], { id: "default", name: "", points: 100, type: "cash", value: 5 });
});

test("resolveRewards: tiers are clamped, junk dropped, and sorted cheapest-first", () => {
  const r = resolveRewards({ tiers: [
    { id: "big", name: "Free hoodie", points: 300, value: 25 },
    { id: "small", name: "Free coffee", points: 50, value: 2 },
    { name: "", points: 40, value: 1 },      // no name → dropped
    { name: "No points", value: 5 },          // no points → dropped
    { name: "Clamp", points: 3, value: 9999 }, // points→10, value→1000
  ] });
  assert.deepEqual(r.tiers.map((t) => t.name), ["Clamp", "Free coffee", "Free hoodie"]);
  assert.equal(r.tiers[0].points, 10);   // clamped up
  assert.equal(r.tiers[0].value, 1000);  // clamped down
});

test("rewardTiers: configured tiers replace the legacy single reward, cheapest first", () => {
  const tiers = rewardTiers({ redeemPoints: 100, redeemValue: 5, tiers: [
    { id: "a", name: "A", points: 200, value: 10 },
    { id: "b", name: "B", points: 75, value: 3 },
  ] });
  assert.deepEqual(tiers.map((t) => t.id), ["b", "a"]);
});

test("canRedeem / canRedeemTier: cheapest-tier threshold and per-tier gating", () => {
  const rules = { tiers: [
    { id: "a", name: "A", points: 100, value: 5 },
    { id: "b", name: "B", points: 50, value: 2 },
  ] };
  assert.equal(canRedeem(50, rules), true);   // clears the cheapest (B)
  assert.equal(canRedeem(49, rules), false);
  const [b, a] = rewardTiers(rules);
  assert.equal(canRedeemTier(50, b), true);
  assert.equal(canRedeemTier(50, a), false);  // not enough for A
  assert.equal(canRedeemTier(100, a), true);
});

test("effectivePercent & pointDollarValue: costed at the MOST generous reward", () => {
  const rules = { earnPerDollar: 1, redeemPoints: 100, redeemValue: 5, tiers: [
    { id: "a", name: "A", points: 100, value: 5 },   // 5%
    { id: "b", name: "B", points: 100, value: 8 },   // 8% — the worst case
  ] };
  assert.equal(pointDollarValue(rules), 0.08);
  assert.equal(effectivePercent(rules), 8);
});

test("pointDollarValue: legacy (no tiers) equals redeemValue/redeemPoints", () => {
  assert.equal(pointDollarValue({ redeemPoints: 100, redeemValue: 5 }), 0.05);
});

/* ---------------------------- typed reward tiers ---------------------------- */

test("resolveTier types: untyped/unknown-type tiers stay cash (backward compatible)", () => {
  const r = resolveRewards({ tiers: [
    { id: "a", name: "Legacy", points: 100, value: 5 },
    { id: "b", name: "Weird", points: 100, value: 5, type: "jackpot" },
  ] });
  assert.deepEqual(r.tiers.map((t) => t.type), ["cash", "cash"]);
  assert.equal(TIER_TYPES.includes("cash"), true);
});

test("percent tier: clamped % and cap; an UNCAPPED percent tier is dropped", () => {
  const r = resolveRewards({ tiers: [
    { id: "p", name: "Happy hour", points: 50, type: "percent", percent: 10, cap: 8 },
    { id: "hi", name: "Overclamp", points: 50, type: "percent", percent: 250, cap: 9999 },
    { id: "nc", name: "No cap", points: 50, type: "percent", percent: 10 },          // dropped
    { id: "zc", name: "Zero cap", points: 50, type: "percent", percent: 10, cap: 0 }, // dropped
  ] });
  assert.deepEqual(r.tiers.map((t) => t.id), ["p", "hi"]);
  assert.deepEqual(r.tiers[0], { id: "p", name: "Happy hour", points: 50, type: "percent", percent: 10, cap: 8 });
  assert.equal(r.tiers[1].percent, 100);  // clamped
  assert.equal(r.tiers[1].cap, 1000);     // clamped
});

test("item tier: carries its $ value and the withPurchase flag (strict boolean)", () => {
  const r = resolveRewards({ tiers: [
    { id: "c", name: "Free coffee", points: 50, type: "item", value: 2.5, withPurchase: true },
    { id: "d", name: "Free donut", points: 30, type: "item", value: 1.5, withPurchase: "yes" },
  ] });
  const coffee = r.tiers.find((t) => t.id === "c");
  const donut = r.tiers.find((t) => t.id === "d");
  assert.equal(coffee.withPurchase, true);
  assert.equal(donut.withPurchase, false); // strict boolean, like `enabled`
  assert.equal(coffee.value, 2.5);
});

test("tierDollarValue: cash/item use value, percent uses its cap; null-safe", () => {
  assert.equal(tierDollarValue({ type: "cash", value: 5 }), 5);
  assert.equal(tierDollarValue({ type: "item", value: 2.5 }), 2.5);
  assert.equal(tierDollarValue({ type: "percent", percent: 10, cap: 8 }), 8);
  assert.equal(tierDollarValue(null), 0);
});

test("liability & % -back are costed at the worst-case tier across types", () => {
  const rules = { earnPerDollar: 1, redeemPoints: 100, redeemValue: 5, tiers: [
    { id: "c", name: "Coffee", points: 50, type: "item", value: 2 },              // $0.04/pt
    { id: "p", name: "Deal", points: 100, type: "percent", percent: 10, cap: 9 }, // $0.09/pt — worst
    { id: "k", name: "$5 off", points: 100, type: "cash", value: 5 },             // $0.05/pt
  ] };
  assert.equal(pointDollarValue(rules), 0.09);
  assert.equal(effectivePercent(rules), 9);
});

/* ------------------------------- VIP tiers ------------------------------- */

test("resolveRewards.vip: clamped, junk dropped, sorted by threshold; multiplier floors at 1", () => {
  const r = resolveRewards({ vip: [
    { id: "g", name: "Gold", threshold: 2000, multiplier: 1.5 },
    { id: "b", name: "Bronze", threshold: 500, multiplier: 0.5 }, // floors to 1
    { name: "", threshold: 100, multiplier: 2 },                  // nameless → dropped
    { id: "n", name: "NoBar", multiplier: 2 },                    // no threshold → dropped
    { id: "hi", name: "Absurd", threshold: 999999999999, multiplier: 99 }, // clamped
  ] });
  assert.deepEqual(r.vip.map((v) => v.id), ["b", "g", "hi"]);
  assert.equal(r.vip[0].multiplier, 1);        // floored — never earns less than base
  assert.equal(r.vip[2].threshold, 10000000);  // clamped
  assert.equal(r.vip[2].multiplier, 10);       // clamped
});

test("vipTierFor: highest crossed bar wins; below every bar (or none) → null", () => {
  const rules = { vip: [
    { id: "b", name: "Bronze", threshold: 500, multiplier: 1.2 },
    { id: "g", name: "Gold", threshold: 2000, multiplier: 1.5 },
  ] };
  assert.equal(vipTierFor(0, rules), null);
  assert.equal(vipTierFor(499, rules), null);
  assert.equal(vipTierFor(500, rules).name, "Bronze");  // threshold inclusive
  assert.equal(vipTierFor(1999, rules).name, "Bronze");
  assert.equal(vipTierFor(2000, rules).name, "Gold");
  assert.equal(vipTierFor(50000, rules).name, "Gold");
  assert.equal(vipTierFor(1000, {}), null); // no ladder configured
});

test("effectivePercent: worst case includes the highest VIP multiplier", () => {
  // base 5% at defaults; a ×2 Gold tier doubles the worst-case giveback
  assert.equal(effectivePercent({ vip: [{ id: "g", name: "Gold", threshold: 1000, multiplier: 2 }] }), 10);
});

/* ------------------------------ visit streaks ------------------------------ */

const at = (s) => new Date(s);

test("nextStreak: no history (or junk / future lastEarnAt) starts at 1", () => {
  assert.equal(nextStreak({}, at("2026-07-18T12:00:00Z")), 1);
  assert.equal(nextStreak({ lastEarnAt: "not a date", currentStreak: 4 }, at("2026-07-18T12:00:00Z")), 1);
  assert.equal(nextStreak({ lastEarnAt: "2026-07-19T12:00:00Z", currentStreak: 4 }, at("2026-07-18T12:00:00Z")), 1);
});

test("nextStreak: several earns the same day are ONE visit — streak unchanged", () => {
  const c = { lastEarnAt: "2026-07-18T09:00:00Z", currentStreak: 3 };
  assert.equal(nextStreak(c, at("2026-07-18T20:00:00Z")), 3);
  // a same-day earn on a legacy doc with no streak yet still reads as 1
  assert.equal(nextStreak({ lastEarnAt: "2026-07-18T09:00:00Z" }, at("2026-07-18T20:00:00Z")), 1);
});

test("nextStreak: a new day within the window extends; past the window resets", () => {
  const c = { lastEarnAt: "2026-07-17T20:00:00Z", currentStreak: 3 };
  assert.equal(nextStreak(c, at("2026-07-18T10:00:00Z")), 4);  // 14h later, new day
  assert.equal(nextStreak(c, at("2026-07-19T21:00:00Z")), 1);  // 49h later — reset
  // custom window: 24h kills the 30h gap that 48h would have kept alive
  assert.equal(nextStreak(c, at("2026-07-19T02:00:00Z"), { streakHours: 24 }), 1);
  assert.equal(nextStreak(c, at("2026-07-19T02:00:00Z"), { streakHours: 48 }), 4);
});

test("resolveRewards.streakHours: whole hours, clamped, defaulting to 48", () => {
  assert.equal(resolveRewards().streakHours, 48);
  assert.equal(resolveRewards({ streakHours: 1 }).streakHours, 12);    // clamped up
  assert.equal(resolveRewards({ streakHours: 500 }).streakHours, 168); // clamped down
  assert.equal(resolveRewards({ streakHours: "72" }).streakHours, 72);
  assert.equal(resolveRewards({ streakHours: "junk" }).streakHours, 48);
});

/* ------------------------- CRM profile helpers ------------------------- */

test("sanitizeProfile: partial-patch semantics — only provided keys appear", () => {
  assert.deepEqual(sanitizeProfile({}).patch, {});
  assert.deepEqual(sanitizeProfile({ note: "  likes menthols  " }).patch, { note: "likes menthols" });
  // blanks clear to null
  assert.deepEqual(sanitizeProfile({ note: "", email: "", address: "" }).patch,
    { note: null, email: null, address: null });
  // untouched keys stay absent
  assert.equal("email" in sanitizeProfile({ note: "x" }).patch, false);
});

test("sanitizeProfile: note/address clamp, email validated", () => {
  assert.equal(sanitizeProfile({ note: "x".repeat(400) }).patch.note.length, 300);
  assert.equal(sanitizeProfile({ address: "y".repeat(400) }).patch.address.length, 200);
  assert.equal(sanitizeProfile({ email: "sam@example.com" }).patch.email, "sam@example.com");
  assert.equal(sanitizeProfile({ email: "not-an-email" }).error, "bad_email");
  assert.equal(sanitizeProfile({ email: "a b@c.com" }).error, "bad_email");
});

test("sanitizeProfile: birthday bounds — month 1-12, day fits the month, day needs a month", () => {
  assert.deepEqual(sanitizeProfile({ birthdayMonth: "4", birthdayDay: "15" }).patch,
    { birthdayMonth: 4, birthdayDay: 15 });
  assert.deepEqual(sanitizeProfile({ birthdayMonth: "2", birthdayDay: "29" }).patch,
    { birthdayMonth: 2, birthdayDay: 29 }); // a birthday, not a calendar date
  assert.equal(sanitizeProfile({ birthdayMonth: "13" }).error, "bad_birthday");
  assert.equal(sanitizeProfile({ birthdayMonth: "4", birthdayDay: "31" }).error, "bad_birthday");
  assert.equal(sanitizeProfile({ birthdayMonth: "", birthdayDay: "12" }).error, "bad_birthday");
  // month alone is fine; blanks clear both
  assert.deepEqual(sanitizeProfile({ birthdayMonth: "7", birthdayDay: "" }).patch,
    { birthdayMonth: 7, birthdayDay: null });
});

test("daysSince + isNewCustomer: visited-ago line and the NEW badge", () => {
  const now = new Date("2026-07-19T12:00:00Z");
  assert.equal(daysSince("2026-07-19T08:00:00Z", now), 0);
  assert.equal(daysSince("2026-07-07T08:00:00Z", now), 12);
  assert.equal(daysSince(null, now), null);
  assert.equal(daysSince("junk", now), null);
  // Firestore Timestamp shape
  assert.equal(daysSince({ toDate: () => new Date("2026-07-18T00:00:00Z") }, now), 1);
  assert.equal(isNewCustomer({ createdAt: "2026-07-10T00:00:00Z" }, now), true);   // 9 days
  assert.equal(isNewCustomer({ createdAt: "2026-06-01T00:00:00Z" }, now), false);  // 48 days
  assert.equal(isNewCustomer({}, now), false);
});
