// Pure rewards helpers — no emulator. Run: npm run test:rewards
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REWARDS, resolveRewards, effectivePercent, pointsForSale, canRedeem,
  normalizePhone, maskPhone,
} from "../src/lib/rewards.js";

test("resolveRewards: defaults, off-by-default, clamps, and bad-value fallback", () => {
  assert.deepEqual(resolveRewards(), { enabled: false, ...((({ earnPerDollar, redeemPoints, redeemValue }) => ({ earnPerDollar, redeemPoints, redeemValue }))(REWARDS)) });
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
