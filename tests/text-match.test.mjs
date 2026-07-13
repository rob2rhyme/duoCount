// Shared text-search helpers — pure, no DOM. Run: npm run test:text-match
import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeRegExp, searchTerms, matchesTerms, highlightSegments } from "../src/lib/text-match.js";

// -------------------------------------------------------------- escapeRegExp ----
test("escapeRegExp neutralizes regex metacharacters", () => {
  assert.equal(escapeRegExp("a.b*c+"), "a\\.b\\*c\\+");
  assert.equal(escapeRegExp("$5 (each)"), "\\$5 \\(each\\)");
});

// --------------------------------------------------------------- searchTerms ----
test("searchTerms lowercases, de-dupes, and splits on non-word chars", () => {
  assert.deepEqual(searchTerms("Red BULL red"), ["red", "bull"]);
  assert.deepEqual(searchTerms("marlboro-gold, 12oz"), ["marlboro", "gold", "12oz"]);
  assert.deepEqual(searchTerms(""), []);
  assert.deepEqual(searchTerms(null), []);
});

test("searchTerms keeps single chars by default, drops them at minLength 2", () => {
  assert.deepEqual(searchTerms("a 5 bull"), ["a", "5", "bull"]); // list filters match from char 1
  assert.deepEqual(searchTerms("a 5 bull", 2), ["bull"]);        // doc search drops 1-char noise
});

// -------------------------------------------------------------- matchesTerms ----
test("matchesTerms requires every term (AND), case-insensitive substring", () => {
  const hay = "Marlboro Gold Box — Cigarettes";
  assert.ok(matchesTerms(hay, ["marl"]));            // partial word
  assert.ok(matchesTerms(hay, ["gold", "box"]));     // all present
  assert.ok(!matchesTerms(hay, ["gold", "vape"]));   // one missing → no match
  assert.ok(matchesTerms(hay, []));                  // empty query matches everything
  assert.ok(!matchesTerms(null, ["x"]));
});

// ----------------------------------------------------------- highlightSegments ----
test("highlightSegments flags matched substrings, preserving original case", () => {
  const segs = highlightSegments("Marlboro Gold", searchTerms("marl"));
  assert.deepEqual(segs, [{ text: "Marl", match: true }, { text: "boro Gold", match: false }]);
});

test("highlightSegments handles multiple terms and rejoins to the original text", () => {
  const terms = searchTerms("red bull");
  const segs = highlightSegments("Red Bull 12oz", terms);
  assert.equal(segs.filter((s) => s.match).length, 2);
  assert.equal(segs.map((s) => s.text).join(""), "Red Bull 12oz"); // lossless
  assert.deepEqual(segs.filter((s) => s.match).map((s) => s.text), ["Red", "Bull"]);
});

test("highlightSegments returns one plain segment when there are no terms", () => {
  assert.deepEqual(highlightSegments("anything", []), [{ text: "anything", match: false }]);
  assert.deepEqual(highlightSegments("", ["x"]), [{ text: "", match: false }]);
});

test("highlightSegments is case-insensitive on the match", () => {
  const segs = highlightSegments("SHORTAGE", searchTerms("short"));
  assert.deepEqual(segs, [{ text: "SHORT", match: true }, { text: "AGE", match: false }]);
});
