// The single source of truth for filtering the Log list. Both the manual
// dropdowns/search box (LogList) and the AI log-search feature
// (ai-log-search-spec.md) build a `filter` object and run it through
// applyLogFilter, so there is exactly one filtering implementation to reason
// about — no second, drifting copy.
//
// Pure and isomorphic (no Firebase, no React): unit-tested with `node --test`.

import { matchesTerms } from "./text-match.js";

// The concatenated text the free-text search matches against — the entry's
// human labels, never its amounts. Kept identical to the field set the Log box
// searched before this refactor so the behavior is preserved exactly.
export function logSearchable(e, causeLabel = (x) => x || "") {
  return `${e.by || ""} ${e.drawerName || ""} ${e.itemName || ""} ${e.game || ""} ${e.pack || ""} ${e.locationName || ""} ${e.shift || ""} ${causeLabel(e.causeCode)}`;
}

/** The entry's business date (YYYY-MM-DD), falling back to its timestamp. */
function dateOf(e) {
  if (e.date) return e.date;
  const ts = e.ts;
  const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : ts ? new Date(ts) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

function statusMatch(e, status) {
  switch (status) {
    case "needs-review": return e.varianceStatus === "open";
    case "under-review": return e.varianceStatus === "under-review";
    case "resolved": return e.varianceStatus === "resolved";
    case "disputed": return ["open", "under-review"].includes(e.disputeStatus);
    default: return true; // "all" / unknown
  }
}

function outcomeMatch(e, outcome) {
  if (!outcome || outcome === "any") return true;
  const diff = Number(e.diff) || 0;
  switch (outcome) {
    case "short": return diff < -0.005;
    case "over": return diff > 0.005;
    case "balanced": return Math.abs(diff) < 0.005;
    case "flagged":
      return ["open", "under-review"].includes(e.varianceStatus)
          || ["open", "under-review"].includes(e.disputeStatus);
    default: return true;
  }
}

function dateMatch(e, from, to) {
  if (!from && !to) return true;
  const d = dateOf(e);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/** Fill in defaults so a partial/AI-supplied filter is safe to apply. */
export function normalizeLogFilter(filter = {}) {
  return {
    kind: filter.kind || "all",
    who: filter.who || null,
    drawer: filter.drawer || null,
    status: filter.status || "all",
    outcome: filter.outcome || "any",
    dateFrom: filter.dateFrom || null,
    dateTo: filter.dateTo || null,
    terms: Array.isArray(filter.terms) ? filter.terms : [],
  };
}

/**
 * Filter `entries` by a normalized filter object.
 *
 * filter = { kind, who, drawer, status, outcome, dateFrom, dateTo, terms }
 *   kind    "all" | "cash" | "scratch" | "inventory"
 *   who     author display name, or null for everyone
 *   drawer  drawer name, or null for all drawers
 *   status  "all" | "needs-review" | "under-review" | "resolved" | "disputed"
 *   outcome "any" | "short" | "over" | "balanced" | "flagged"
 *   dateFrom/dateTo  YYYY-MM-DD bounds (inclusive) over the entry's date, or null
 *   terms   pre-tokenized free-text search terms (AND-matched), or []
 */
export function applyLogFilter(entries, filter, { causeLabel = (x) => x || "" } = {}) {
  const f = normalizeLogFilter(filter);
  return (entries || []).filter((e) =>
    (f.kind === "all" || e.kind === f.kind) &&
    (!f.who || e.by === f.who) &&
    (!f.drawer || e.drawerName === f.drawer) &&
    statusMatch(e, f.status) &&
    outcomeMatch(e, f.outcome) &&
    dateMatch(e, f.dateFrom, f.dateTo) &&
    matchesTerms(logSearchable(e, causeLabel), f.terms));
}
