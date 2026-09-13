// The privacy notice enumerates every browser-storage key by NAME, which means
// it goes silently stale the moment a feature stores something new. That has
// already happened twice (print-sections, then the install banner), and a
// privacy notice that under-reports what a device stores is the one kind of
// documentation bug with a legal edge to it.
//
// This test pins the prose to the code: every `duocount-*` key literal in src/
// must appear in BOTH privacy notices, and neither notice may name a key the
// app no longer writes.
//
// Run: node --test tests/privacy-doc-keys.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const NOTICES = ["docs/privacy-and-data.md", "docs/privacy-and-data-es.md"];

// Every .js under src/, so a key added in a new file is caught without anyone
// remembering to update a list here.
function srcFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) srcFiles(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const uniq = (a) => [...new Set(a)].sort();
const matchAll = (text, re) => uniq([...text.matchAll(re)].map((m) => m[1]));

// Double-quoted string literals only: a bare `duocount-theme` inside a code
// comment is a cross-reference, not a key the app writes.
const codeKeys = uniq(
  srcFiles(path.join(ROOT, "src")).flatMap((f) =>
    matchAll(fs.readFileSync(f, "utf8"), /"(duocount-[a-z0-9-]+)"/g)));

// In the notices the keys are written as markdown code spans.
const docKeys = (rel) =>
  matchAll(fs.readFileSync(path.join(ROOT, rel), "utf8"), /`(duocount-[a-z0-9-]+)`/g);

test("the app actually writes some device-storage keys (guards the guard)", () => {
  // If the scan silently returns nothing, every assertion below passes
  // vacuously and the test protects nothing.
  assert.ok(codeKeys.length >= 5, `expected several duocount-* keys, found ${codeKeys.length}`);
});

for (const rel of NOTICES) {
  test(`${rel} documents every device-storage key the app writes`, () => {
    const documented = new Set(docKeys(rel));
    const missing = codeKeys.filter((k) => !documented.has(k));
    assert.deepEqual(missing, [],
      `${rel} does not mention ${missing.join(", ")}. A new browser-storage key was `
      + "added without updating the privacy notice — add it to the "
      + "'Device preferences' list (and to its translated twin).");
  });

  test(`${rel} does not name a key the app no longer writes`, () => {
    const known = new Set(codeKeys);
    const stale = docKeys(rel).filter((k) => !known.has(k));
    assert.deepEqual(stale, [],
      `${rel} still documents ${stale.join(", ")}, which no longer exists in src/. `
      + "Remove it so the notice does not over-report what is stored.");
  });
}

test("both language notices document the same key set", () => {
  // A key added to English only would leave Spanish-reading staff with an
  // incomplete notice — the same lockstep rule the i18n catalog is held to.
  assert.deepEqual(docKeys(NOTICES[0]), docKeys(NOTICES[1]),
    "the English and Spanish privacy notices list different storage keys");
});
