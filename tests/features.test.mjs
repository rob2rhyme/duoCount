// Per-store feature toggles — pure. Run: node --test tests/features.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURES, FEATURE_KEYS, resolveFeatures, featureEnabled } from "../src/lib/features.js";

test("an existing store with no `features` map keeps every default (backward-compatible)", () => {
  assert.deepEqual(resolveFeatures({}), FEATURES);
  assert.deepEqual(resolveFeatures(undefined), FEATURES);
  assert.deepEqual(resolveFeatures({ features: {} }), FEATURES);
  // defaults: the count modules on, the new gaming module off
  assert.equal(FEATURES.scratch, true);
  assert.equal(FEATURES.inventory, true);
  assert.equal(FEATURES.gaming, false);
});

test("only the booleans the owner actually flipped override a default", () => {
  const v = { features: { scratch: false, gaming: true } };
  const r = resolveFeatures(v);
  assert.equal(r.scratch, false);   // flipped off
  assert.equal(r.gaming, true);     // flipped on
  assert.equal(r.inventory, true);  // untouched → default
});

test("non-boolean / junk stored values fall back to the default (never partly-off)", () => {
  const v = { features: { scratch: "no", inventory: null, gaming: 1 } };
  const r = resolveFeatures(v);
  assert.equal(r.scratch, true);    // "no" isn't a boolean → default on
  assert.equal(r.inventory, true);  // null → default on
  assert.equal(r.gaming, false);    // 1 isn't a boolean → default off
});

test("featureEnabled reads a single module; unknown keys are never hidden", () => {
  assert.equal(featureEnabled({ features: { scratch: false } }, "scratch"), false);
  assert.equal(featureEnabled({}, "scratch"), true);
  assert.equal(featureEnabled({ features: { gaming: true } }, "gaming"), true);
  // a screen that isn't a toggleable module (e.g. cash) is always on
  assert.equal(featureEnabled({ features: { scratch: false } }, "cash"), true);
});

test("FEATURE_KEYS lists exactly the toggleable modules", () => {
  assert.deepEqual([...FEATURE_KEYS].sort(), ["gaming", "inventory", "scratch"]);
});
