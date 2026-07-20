// Per-store feature toggles — pure. Run: node --test tests/features.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURES, FEATURE_KEYS, resolveFeatures, featureEnabled } from "../src/lib/features.js";

test("an existing store with no `features` map keeps every default (backward-compatible)", () => {
  assert.deepEqual(resolveFeatures({}), FEATURES);
  assert.deepEqual(resolveFeatures(undefined), FEATURES);
  assert.deepEqual(resolveFeatures({ features: {} }), FEATURES);
  // defaults: every main tab on, only the opt-in gaming module off
  assert.equal(FEATURES.cash, true);
  assert.equal(FEATURES.scratch, true);
  assert.equal(FEATURES.inventory, true);
  assert.equal(FEATURES.gaming, false);
  assert.equal(FEATURES.log, true);
  assert.equal(FEATURES.notes, true);
  assert.equal(FEATURES.incidents, true);
  assert.equal(FEATURES.time, true);
  assert.equal(FEATURES.portfolio, true);
});

test("only the booleans the owner actually flipped override a default", () => {
  const v = { features: { scratch: false, gaming: true, cash: false } };
  const r = resolveFeatures(v);
  assert.equal(r.scratch, false);   // flipped off
  assert.equal(r.gaming, true);     // flipped on
  assert.equal(r.cash, false);      // flipped off
  assert.equal(r.inventory, true);  // untouched → default
  assert.equal(r.time, true);       // untouched → default
});

test("non-boolean / junk stored values fall back to the default (never partly-off)", () => {
  const v = { features: { scratch: "no", inventory: null, gaming: 1, log: "" } };
  const r = resolveFeatures(v);
  assert.equal(r.scratch, true);    // "no" isn't a boolean → default on
  assert.equal(r.inventory, true);  // null → default on
  assert.equal(r.gaming, false);    // 1 isn't a boolean → default off
  assert.equal(r.log, true);        // "" isn't a boolean → default on
});

test("featureEnabled reads a single module; unknown keys are never hidden", () => {
  assert.equal(featureEnabled({ features: { scratch: false } }, "scratch"), false);
  assert.equal(featureEnabled({}, "scratch"), true);
  assert.equal(featureEnabled({ features: { gaming: true } }, "gaming"), true);
  assert.equal(featureEnabled({ features: { time: false } }, "time"), false);
  // a screen that isn't a toggleable module (Dashboard, Admin, Rewards) is always on
  assert.equal(featureEnabled({ features: { scratch: false } }, "dashboard"), true);
  assert.equal(featureEnabled({ features: { scratch: false } }, "admin"), true);
  assert.equal(featureEnabled({ features: { scratch: false } }, "rewards"), true);
});

test("FEATURE_KEYS lists exactly the toggleable main tabs (Dashboard/Admin/Rewards excluded)", () => {
  assert.deepEqual(
    [...FEATURE_KEYS].sort(),
    ["cash", "gaming", "incidents", "inventory", "log", "notes", "portfolio", "scratch", "time"],
  );
  // the two always-on ways back in, plus rewards (its own toggle), are never toggleable modules
  assert.ok(!FEATURE_KEYS.includes("dashboard"));
  assert.ok(!FEATURE_KEYS.includes("admin"));
  assert.ok(!FEATURE_KEYS.includes("rewards"));
});
