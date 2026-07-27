// Pure print-sheet section chooser — no DOM, no emulator.
// Run: node --test tests/print-sections.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRINT_SECTIONS_KEY, resolvePrintSections, readPrintSections,
  printSection, printSectionsToolbarHtml,
} from "../src/lib/print-sections.js";

const IDS = ["summary", "game", "staff", "log"];
const SECS = [
  { id: "summary", label: "Summary", present: true },
  { id: "game", label: "By game", present: true },
  { id: "staff", label: "By staff", present: true },
  { id: "log", label: "Shift log", present: true },
];
const store = (val) => ({ getItem: () => val });

test("nothing stored → every section prints", () => {
  assert.deepEqual(resolvePrintSections(null, IDS), { summary: true, game: true, staff: true, log: true });
  assert.deepEqual(readPrintSections(store(null), IDS), { summary: true, game: true, staff: true, log: true });
});

test("an explicit false is the only thing that hides a section", () => {
  const got = resolvePrintSections({ summary: false, game: false, staff: false }, IDS);
  assert.deepEqual(got, { summary: false, game: false, staff: false, log: true });
});

test("only-the-shift-log survives a round trip through storage", () => {
  const saved = JSON.stringify({ summary: false, game: false, staff: false, log: true });
  assert.deepEqual(readPrintSections(store(saved), IDS),
    { summary: false, game: false, staff: false, log: true });
});

test("a section added after the choice was stored still prints", () => {
  // Forward-compat: a stale stored object must not silently suppress new work.
  const stale = JSON.stringify({ summary: true, game: false });
  assert.equal(resolvePrintSections(JSON.parse(stale), IDS).log, true);
  assert.equal(resolvePrintSections(JSON.parse(stale), IDS).staff, true);
});

test("corrupt, hostile, or unreadable storage falls back to printing everything", () => {
  for (const bad of ["{not json", "null", "[]", '"log"', "42", ""]) {
    assert.deepEqual(readPrintSections(store(bad), IDS),
      { summary: true, game: true, staff: true, log: true }, `stored=${bad}`);
  }
  const throws = { getItem() { throw new Error("private mode"); } };
  assert.deepEqual(readPrintSections(throws, IDS), { summary: true, game: true, staff: true, log: true });
  assert.deepEqual(readPrintSections(null, IDS), { summary: true, game: true, staff: true, log: true });
  assert.deepEqual(readPrintSections(undefined, IDS), { summary: true, game: true, staff: true, log: true });
});

test("printSection wraps its block so the toolbar can find it", () => {
  const html = printSection("log", "<table></table>");
  assert.match(html, /data-print-sec="log"/);
  assert.match(html, /<table><\/table>/);
});

test("a hidden section is present but display:none — re-checking needs no reprint", () => {
  const html = printSection("game", "<table></table>", false);
  assert.match(html, /style="display:none"/);
  assert.match(html, /<table><\/table>/, "the rows are still in the document");
});

test("an empty block renders nothing at all, not an empty wrapper", () => {
  assert.equal(printSection("log", ""), "");
  assert.equal(printSection("log", null), "");
});

test("the toolbar offers one checkbox per present section, pre-set to the stored choice", () => {
  const html = printSectionsToolbarHtml(SECS, { state: { summary: false, game: false, staff: false, log: true } });
  assert.match(html, /data-sec="summary"(?! checked)/);
  assert.match(html, /data-sec="log" checked/);
  assert.equal((html.match(/type="checkbox"/g) || []).length, 4);
});

test("a section with no rows gets no checkbox", () => {
  const html = printSectionsToolbarHtml(
    SECS.map((s) => (s.id === "log" ? { ...s, present: false } : s)), {});
  assert.doesNotMatch(html, /data-sec="log"/);
  assert.equal((html.match(/type="checkbox"/g) || []).length, 3);
});

test("one choice is no choice — the toolbar stays off the page", () => {
  assert.equal(printSectionsToolbarHtml([SECS[0]], {}), "");
  assert.equal(printSectionsToolbarHtml([], {}), "");
});

test("the toolbar never prints itself", () => {
  const html = printSectionsToolbarHtml(SECS, {});
  assert.match(html, /@media print\{\.dc-tools\{display:none\}\}/);
});

test("the re-print button appears only when a label is given", () => {
  assert.doesNotMatch(printSectionsToolbarHtml(SECS, {}), /window\.print\(\)/);
  assert.match(printSectionsToolbarHtml(SECS, { printLabel: "Print" }), /onclick="window\.print\(\)"/);
});

test("labels and ids are escaped — a store's own text can't inject markup", () => {
  const html = printSectionsToolbarHtml([
    { id: 'x" onload="evil', label: '<img src=x onerror=alert(1)>', present: true },
    { id: "log", label: "Shift log", present: true },
  ], { printLabel: '</button><script>evil()</script>' });
  // The text survives — as inert text. What must not survive is live markup.
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script>evil/);
  assert.doesNotMatch(html, /<\/button><script>/);
  assert.doesNotMatch(html, /onload="evil/);
  assert.match(html, /data-sec="x&quot; onload=&quot;evil"/);
});

test("printSection escapes its id too", () => {
  assert.doesNotMatch(printSection('a" onload="evil', "<p>x</p>"), /onload="evil/);
});

test("the persistence key is written into the toolbar script verbatim", () => {
  const html = printSectionsToolbarHtml(SECS, { storageKey: "custom-key" });
  assert.match(html, /localStorage\.setItem\("custom-key"/);
  assert.equal(PRINT_SECTIONS_KEY, "duocount-print-sections");
});
