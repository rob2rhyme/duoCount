import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, LOCALES, DEFAULT_LOCALE, translate, resolveLocale } from "../src/lib/i18n.js";

test("catalog completeness: every locale's key set equals en's (the load-bearing test)", () => {
  const enKeys = Object.keys(CATALOG.en).sort();
  assert.ok(enKeys.length > 0);
  for (const loc of LOCALES) {
    const keys = Object.keys(CATALOG[loc]).sort();
    const missing = enKeys.filter((k) => !keys.includes(k));
    const stray = keys.filter((k) => !enKeys.includes(k));
    assert.deepEqual(missing, [], `${loc} is missing keys`);
    assert.deepEqual(stray, [], `${loc} has stray keys not in en`);
  }
});

test("every locale in LOCALES has a catalog; the default is en", () => {
  for (const loc of LOCALES) assert.ok(CATALOG[loc], loc);
  assert.equal(DEFAULT_LOCALE, "en");
  assert.ok(LOCALES.includes("es"));
});

test("no catalog value is an empty string (a blank translation is a bug)", () => {
  for (const loc of LOCALES) {
    for (const [k, v] of Object.entries(CATALOG[loc])) {
      assert.ok(typeof v === "string" && v.trim() !== "", `${loc}:${k} is blank`);
    }
  }
});

test("fallback chain: active locale → English → the key itself, never blank", () => {
  assert.equal(translate("es", "cash.title"), "Nuevo conteo de caja");
  // a key present nowhere returns the key string as a dev signal
  assert.equal(translate("es", "not.a.key"), "not.a.key");
  assert.equal(translate("en", "not.a.key"), "not.a.key");
  // an unknown locale falls back to English wholesale
  assert.equal(translate("fr", "cash.title"), "New drawer count");
});

test("interpolation substitutes vars; a missing var leaves its placeholder", () => {
  assert.equal(translate("en", "toast.over_amount", { amount: "$4.00" }), "over $4.00");
  assert.equal(translate("es", "toast.short_amount", { amount: "$4.00" }), "falta $4.00");
  assert.equal(translate("en", "login.your_pin", { n: 6 }), "Your PIN (6 digits)");
  assert.equal(translate("en", "toast.saved_result", {}), "Saved — {result}"); // missing var stays literal
  assert.equal(translate("en", "cash.title", { unused: 1 }), "New drawer count"); // no vars in string
});

test("resolveLocale: shipped locales pass through, anything else falls to the default", () => {
  assert.equal(resolveLocale("es"), "es");
  assert.equal(resolveLocale("en"), "en");
  assert.equal(resolveLocale("xx"), "en");
  assert.equal(resolveLocale(null), "en");
  assert.equal(resolveLocale(undefined), "en");
});
