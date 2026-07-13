// Client-side search over the documentation — pure and isomorphic (no Firebase,
// no DOM), so the ranking logic is unit-tested without a browser. The searchable
// index is built at BUILD time by `searchIndex()` in ./docs.js (one entry per
// doc: { slug, title, headings:[{id,text}], text }) and shipped to the client;
// this module ranks that index against a user's words and returns the best
// matching docs, each with a jump-to heading anchor and a highlighted snippet.
//
// Matching is AND across terms (every word must appear somewhere in the doc) and
// weighted by where a term lands — title > heading > body — so the most relevant
// doc floats to the top. Kept deliberately small: no stemming or fuzzy matching,
// just honest substring word matching that behaves predictably for a help search.

const WEIGHT = { title: 12, heading: 5, body: 1 };
const SNIPPET_RADIUS = 90;
const MAX_BODY_HITS = 5; // cap per-term body contribution so one long doc can't dominate

// Split a query into lowercase word tokens (unicode letters/digits), ≥2 chars,
// de-duplicated. Single characters are dropped as noise.
export function tokenize(q) {
  const words = String(q || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return [...new Set(words)].filter((t) => t.length >= 2);
}

const countOccurrences = (haystack, needle) => (needle ? haystack.split(needle).length - 1 : 0);

// AND-scored relevance: every term must appear somewhere (else 0), and each term
// adds title/heading/body weight. Returns 0 for a non-match so callers can skip.
function scoreDoc(doc, terms) {
  const title = (doc.title || "").toLowerCase();
  const headings = (doc.headings || []).map((h) => (h.text || "").toLowerCase());
  const body = (doc.text || "").toLowerCase();
  let score = 0;
  for (const t of terms) {
    let termScore = 0;
    if (title.includes(t)) termScore += WEIGHT.title;
    if (headings.some((h) => h.includes(t))) termScore += WEIGHT.heading;
    termScore += Math.min(countOccurrences(body, t), MAX_BODY_HITS) * WEIGHT.body;
    if (termScore === 0) return 0; // AND semantics: a missing term disqualifies the doc
    score += termScore;
  }
  return score;
}

// The heading that best matches the query (most terms hit; ties → earliest), so
// a result can deep-link to the relevant section. Null when no heading matches.
function bestAnchor(doc, terms) {
  let best = null;
  let bestHits = 0;
  for (const h of doc.headings || []) {
    const text = (h.text || "").toLowerCase();
    const hits = terms.reduce((n, t) => n + (text.includes(t) ? 1 : 0), 0);
    if (hits > bestHits) { bestHits = hits; best = h.id; }
  }
  return best;
}

// A readable snippet around the earliest term hit, snapped to word boundaries and
// whitespace-collapsed, with leading/trailing ellipses when it's a middle slice.
function bestSnippet(text, terms) {
  if (!text) return "";
  const lower = text.toLowerCase();
  let pos = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0) return text.slice(0, 160).replace(/\s+/g, " ").trim();
  let start = Math.max(0, pos - SNIPPET_RADIUS);
  let end = Math.min(text.length, pos + SNIPPET_RADIUS);
  while (start > 0 && /\S/.test(text[start - 1])) start -= 1;       // extend left to a word start
  while (end < text.length && /\S/.test(text[end])) end += 1;        // extend right to a word end
  let s = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) s = `… ${s}`;
  if (end < text.length) s = `${s} …`;
  return s;
}

/**
 * Rank the doc index against a query.
 * @param {Array<{slug,title,headings,text}>} index  the build-time search index.
 * @param {string} query  the user's words.
 * @param {number} [limit=12]  max results.
 * @returns {Array<{slug,title,score,anchor,snippet,terms}>} best matches first.
 */
export function searchDocs(index = [], query = "", limit = 12) {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const out = [];
  for (const doc of index || []) {
    const score = scoreDoc(doc, terms);
    if (score <= 0) continue;
    out.push({
      slug: doc.slug,
      title: doc.title,
      score,
      anchor: bestAnchor(doc, terms),
      snippet: bestSnippet(doc.text || "", terms),
      terms,
    });
  }
  out.sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title)));
  return out.slice(0, limit);
}
