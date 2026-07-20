// Store-code slug helpers — pure. Run: node --test tests/slug.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, nextAvailableSlug } from "../src/lib/slug.js";

test("slugify lowercases, hyphenates non-alphanumerics, trims, and caps length", () => {
  assert.equal(slugify("Acme Market"), "acme-market");
  assert.equal(slugify("  Joe's  Corner Store!! "), "joe-s-corner-store");
  assert.equal(slugify("---A---"), "a");
  assert.equal(slugify("A really really really long business name here"), "a-really-really-really-l"); // 24 cap
  assert.equal(slugify(""), "store");          // empty → fallback
  assert.equal(slugify("!!!"), "store");       // nothing usable → fallback
  assert.equal(slugify(null), "store");
});

test("nextAvailableSlug returns the base when it's free", () => {
  assert.equal(nextAvailableSlug("acme-market", new Set()), "acme-market");
  assert.equal(nextAvailableSlug("acme-market", ["other-store"]), "acme-market");
});

test("nextAvailableSlug suffixes -2, -3, … past taken codes", () => {
  assert.equal(nextAvailableSlug("acme", new Set(["acme"])), "acme-2");
  assert.equal(nextAvailableSlug("acme", new Set(["acme", "acme-2", "acme-3"])), "acme-4");
  // gaps are filled: acme and acme-3 taken but acme-2 free → acme-2
  assert.equal(nextAvailableSlug("acme", new Set(["acme", "acme-3"])), "acme-2");
});

test("nextAvailableSlug accepts an array or a Set", () => {
  assert.equal(nextAvailableSlug("s", ["s", "s-2"]), "s-3");
});
