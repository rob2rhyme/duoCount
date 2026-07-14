// applyLogFilter is pure. Run: npm run test:log-filter
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLogFilter, normalizeLogFilter, logSearchable } from "../src/lib/log-filter.js";
import { searchTerms, matchesTerms } from "../src/lib/text-match.js";

const causeLabel = (c) => ({ "human-error": "Human error", "suspected-theft": "Suspected theft" }[c] || c || "");

const E = [
  { id: "a", kind: "cash", by: "Eve", byId: "u1", drawerName: "POS", diff: -8, date: "2026-07-10", varianceStatus: "open", disputeStatus: "none", ts: new Date("2026-07-10") },
  { id: "b", kind: "cash", by: "Bob", byId: "u2", drawerName: "Safe", diff: 3, date: "2026-07-11", varianceStatus: "none", ts: new Date("2026-07-11") },
  { id: "c", kind: "inventory", by: "Eve", byId: "u1", itemName: "Marlboro Red", diff: -2, unit: "pack", date: "2026-07-11", varianceStatus: "resolved", causeCode: "human-error", ts: new Date("2026-07-11") },
  { id: "d", kind: "scratch", by: "Ada", byId: "u3", game: "Lucky 7s", pack: "12345", sold: 4, date: "2026-07-12", disputeStatus: "open", ts: new Date("2026-07-12") },
  { id: "e", kind: "cash", by: "Bob", byId: "u2", drawerName: "POS", diff: 0, date: "2026-07-12", varianceStatus: "under-review", ts: new Date("2026-07-12") },
];

// A verbatim copy of the pre-refactor inline Log filter, to prove the shared
// function reproduces it exactly across a matrix of filter combinations.
function oldFilter(entries, { fType, fWho, fDrawer, fStatus, terms }) {
  const searchable = (e) =>
    `${e.by} ${e.drawerName || ""} ${e.itemName || ""} ${e.game || ""} ${e.pack || ""} ${e.locationName || ""} ${e.shift || ""} ${causeLabel(e.causeCode)}`;
  return entries.filter((e) =>
    (fType === "all" || e.kind === fType) &&
    (fWho === "all" || e.by === fWho) &&
    (fDrawer === "all" || e.drawerName === fDrawer) &&
    (fStatus === "all"
      || (fStatus === "needs-review" && e.varianceStatus === "open")
      || (fStatus === "under-review" && e.varianceStatus === "under-review")
      || (fStatus === "resolved" && e.varianceStatus === "resolved")
      || (fStatus === "disputed" && ["open", "under-review"].includes(e.disputeStatus))) &&
    matchesTerms(searchable(e), terms));
}

test("applyLogFilter reproduces the old inline filter across a matrix", () => {
  const types = ["all", "cash", "scratch", "inventory"];
  const whos = ["all", "Eve", "Bob", "Ada"];
  const drawers = ["all", "POS", "Safe"];
  const statuses = ["all", "needs-review", "under-review", "resolved", "disputed"];
  const queries = ["", "eve", "marlboro", "lucky", "human", "pos", "12345"];
  let combos = 0;
  for (const fType of types) for (const fWho of whos) for (const fDrawer of drawers)
    for (const fStatus of statuses) for (const q of queries) {
      const terms = searchTerms(q);
      const expected = oldFilter(E, { fType, fWho, fDrawer, fStatus, terms }).map((e) => e.id);
      const got = applyLogFilter(E, {
        kind: fType,
        who: fWho === "all" ? null : fWho,
        drawer: fDrawer === "all" ? null : fDrawer,
        status: fStatus,
        terms,
      }, { causeLabel }).map((e) => e.id);
      assert.deepEqual(got, expected, `mismatch @ ${fType}/${fWho}/${fDrawer}/${fStatus}/"${q}"`);
      combos++;
    }
  assert.ok(combos > 500);
});

test("an empty / all-defaults filter is a no-op", () => {
  assert.deepEqual(applyLogFilter(E, {}).map((e) => e.id), E.map((e) => e.id));
  assert.deepEqual(applyLogFilter(E, normalizeLogFilter()).map((e) => e.id), E.map((e) => e.id));
});

test("outcome predicate: short / over / balanced / flagged", () => {
  const ids = (outcome) => applyLogFilter(E, { outcome }, { causeLabel }).map((e) => e.id);
  assert.deepEqual(ids("short"), ["a", "c"]);       // diff < 0
  assert.deepEqual(ids("over"), ["b"]);             // diff > 0
  assert.deepEqual(ids("balanced").sort(), ["d", "e"]); // diff ~0 (scratch has no diff → 0)
  assert.deepEqual(ids("flagged").sort(), ["a", "d", "e"]); // open/under-review variance or dispute
});

test("date range is inclusive over the entry date", () => {
  const ids = (dateFrom, dateTo) => applyLogFilter(E, { dateFrom, dateTo }).map((e) => e.id);
  assert.deepEqual(ids("2026-07-11", "2026-07-11").sort(), ["b", "c"]);
  assert.deepEqual(ids("2026-07-12", null).sort(), ["d", "e"]);
  assert.deepEqual(ids(null, "2026-07-10"), ["a"]);
});

test("predicates compose (AND) — Eve's shorts in the window", () => {
  const got = applyLogFilter(E, { who: "Eve", outcome: "short", dateFrom: "2026-07-01", dateTo: "2026-07-31" }, { causeLabel });
  assert.deepEqual(got.map((e) => e.id), ["a", "c"]);
});

test("logSearchable covers the human labels, not amounts", () => {
  const s = logSearchable(E[0], causeLabel);
  assert.ok(s.includes("Eve") && s.includes("POS"));
  assert.ok(!s.includes("-8")); // the diff/amount is never in the searchable text
});
