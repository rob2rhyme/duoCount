// Guards the contract between the client's editable-settings allow-list and the
// firestore.rules vendor-update rule. Drift here is exactly the bug that made
// rewards/stockAlerts appear to save but reset on refresh. Pure — no emulator.
// Run: npm run test:vendor-settings
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { VENDOR_SETTING_KEYS } from "../src/lib/vendor-settings.js";

const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(join(here, "..", "firestore.rules"), "utf8");

// Pull the keys out of the vendor-update `...affectedKeys().hasOnly([ ... ])`.
// The vendor doc rule is the FIRST hasOnly in the file that lists 'name' — it's
// the branding/settings allow-list (subcollection rules gate single fields).
function vendorRuleKeys() {
  const m = rules.match(/affectedKeys\(\)\s*\.hasOnly\(\[([\s\S]*?)\]\)/g) || [];
  for (const block of m) {
    const keys = [...block.matchAll(/'([^']+)'/g)].map((x) => x[1]);
    if (keys.includes("name") && keys.includes("rewards")) return keys;
  }
  throw new Error("vendor-update hasOnly([...]) allow-list not found in firestore.rules");
}

test("client allow-list matches the firestore.rules vendor-update allow-list", () => {
  const ruleKeys = vendorRuleKeys();
  assert.deepEqual(
    [...VENDOR_SETTING_KEYS].sort(),
    [...ruleKeys].sort(),
    "VENDOR_SETTING_KEYS must equal the rules' vendor-update hasOnly() set",
  );
});

test("the once-dropped settings are present (regression: rewards + stockAlerts persist)", () => {
  assert.ok(VENDOR_SETTING_KEYS.includes("rewards"), "rewards must be editable");
  assert.ok(VENDOR_SETTING_KEYS.includes("stockAlerts"), "stockAlerts must be editable");
});

test("no duplicate keys", () => {
  assert.equal(new Set(VENDOR_SETTING_KEYS).size, VENDOR_SETTING_KEYS.length);
});
