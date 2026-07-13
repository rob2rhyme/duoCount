// Shared, pure text-search helpers used by every search surface in the app — the
// docs/guide search and the Inventory / Log / Notes / Incidents list filters — so
// searching and match-highlighting behave identically everywhere. No DOM, no
// React, so the matching logic is unit-tested on its own.

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Lowercase word tokens (unicode letters/digits), de-duplicated. `minLength` lets
// a knowledge-base search drop 1-char noise (minLength 2) while a list filter
// matches from the first character typed (minLength 1, the default).
export function searchTerms(query, minLength = 1) {
  const words = String(query || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return [...new Set(words)].filter((t) => t.length >= minLength);
}

// AND semantics: every term must appear somewhere in the haystack. No terms → a
// match (an empty query filters nothing out).
export function matchesTerms(haystack, terms) {
  if (!terms || !terms.length) return true;
  const s = String(haystack ?? "").toLowerCase();
  return terms.every((t) => s.includes(t));
}

// Split `text` into ordered { text, match } segments for highlighting —
// case-insensitive, matched substrings kept in their original case. Always
// returns at least one segment so callers can render uniformly.
export function highlightSegments(text, terms) {
  const str = String(text ?? "");
  if (!terms || !terms.length || !str) return [{ text: str, match: false }];
  const set = new Set(terms.map((t) => t.toLowerCase()));
  const re = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return str.split(re).filter((p) => p !== "").map((p) => ({ text: p, match: set.has(p.toLowerCase()) }));
}
