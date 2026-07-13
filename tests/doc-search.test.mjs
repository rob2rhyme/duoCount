// Pure documentation search ranking — no browser, no build. Run: npm run test:doc-search
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchDocs, tokenize } from "../src/lib/doc-search.js";

const INDEX = [
  {
    slug: "reporting-spec", title: "Reports & Records Export",
    headings: [{ id: "period-math", text: "Period math" }, { id: "fiscal-year", text: "Fiscal year offset" }],
    text: "Generate and download a report for any period. Fiscal year offset shifts the year, quarter, and half boundaries for franchise records.",
  },
  {
    slug: "getting-started", title: "Getting Started",
    headings: [{ id: "for-owners", text: "For owners and managers" }, { id: "log-a-count", text: "Log a count" }],
    text: "A plain language walkthrough. Set up your store, log cash counts, and pull reports. Owners and managers can verify counts.",
  },
  {
    slug: "pwa-spec", title: "Mobile-first PWA",
    headings: [{ id: "install", text: "Install prompt" }],
    text: "Installable, offline app shell, safe-area, and an install prompt for a mobile first experience.",
  },
];

// ---------------------------------------------------------------- tokenize ----
test("tokenize: lowercases, de-dupes, drops <2-char noise, splits on punctuation", () => {
  assert.deepEqual(tokenize("Fiscal YEAR fiscal"), ["fiscal", "year"]);
  assert.deepEqual(tokenize("Reports & Records"), ["reports", "records"]);
  assert.deepEqual(tokenize("a I x"), []); // single chars are noise
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize(null), []);
});

// ------------------------------------------------------------- empty input ----
test("a blank or too-short query returns nothing", () => {
  assert.deepEqual(searchDocs(INDEX, ""), []);
  assert.deepEqual(searchDocs(INDEX, "a"), []); // single char tokenizes to nothing
  assert.deepEqual(searchDocs([], "report"), []);
});

// ------------------------------------------------------------- single term ----
test("single term matches the right doc and picks the matching heading anchor", () => {
  const r = searchDocs(INDEX, "fiscal");
  assert.equal(r.length, 1);
  assert.equal(r[0].slug, "reporting-spec");
  assert.equal(r[0].anchor, "fiscal-year"); // heading "Fiscal year offset" contains the term
  assert.deepEqual(r[0].terms, ["fiscal"]);
});

// --------------------------------------------------------------- ranking ----
test("a title hit outranks a body-only hit", () => {
  // "reports" is in reporting-spec's TITLE and in getting-started's body ("pull reports")
  const r = searchDocs(INDEX, "reports");
  assert.equal(r[0].slug, "reporting-spec");
  assert.ok(r.some((x) => x.slug === "getting-started"));
  assert.ok(r[0].score > r.find((x) => x.slug === "getting-started").score);
});

// --------------------------------------------------------- multi-term AND ----
test("all terms must appear (AND); a heading matching both wins the anchor", () => {
  const r = searchDocs(INDEX, "install prompt");
  assert.equal(r.length, 1);
  assert.equal(r[0].slug, "pwa-spec");
  assert.equal(r[0].anchor, "install"); // "Install prompt" matches both terms
});

test("a term absent from a doc disqualifies it entirely", () => {
  assert.deepEqual(searchDocs(INDEX, "fiscal install"), []); // no doc has both
});

// ---------------------------------------------------------------- anchor ----
test("anchor is null when no heading matches, snippet still comes from the body", () => {
  const r = searchDocs(INDEX, "walkthrough"); // only in getting-started body, no heading
  assert.equal(r.length, 1);
  assert.equal(r[0].slug, "getting-started");
  assert.equal(r[0].anchor, null);
  assert.ok(r[0].snippet.toLowerCase().includes("walkthrough"));
});

// ------------------------------------------------------- case + snippet ----
test("matching is case-insensitive and the snippet surrounds the hit", () => {
  const r = searchDocs(INDEX, "FISCAL");
  assert.equal(r[0].slug, "reporting-spec");
  assert.ok(r[0].snippet.toLowerCase().includes("fiscal"));
  assert.ok(r[0].snippet.length > 0 && r[0].snippet.length < 220);
});

// ----------------------------------------------------------------- limit ----
test("results are capped by the limit argument", () => {
  const r = searchDocs(INDEX, "and", 2); // "and" appears in all three docs' bodies
  assert.equal(r.length, 2);
});

test("no matches yields an empty list", () => {
  assert.deepEqual(searchDocs(INDEX, "nonexistentword"), []);
});
