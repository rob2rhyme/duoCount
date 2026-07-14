// buildVocabulary / buildSearchPrompt / coerceFilter are pure.
// Run: npm run test:log-search
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildVocabulary,
  buildSearchPrompt,
  coerceFilter,
  aiSearchEnabled,
  SEARCH_FILTER_SCHEMA,
} from "../src/lib/log-search.js";

const entries = [
  { kind: "cash", by: "Eve", drawerName: "POS", diff: -8.25, counted: 191.75, expected: 200, locationName: "Main St" },
  { kind: "cash", by: "Bob", drawerName: "Safe", diff: 3, counted: 503, expected: 500, locationName: "Main St" },
  { kind: "inventory", by: "Eve", itemName: "Marlboro Red", diff: -2 },
  { kind: "scratch", by: "Ada", game: "Lucky 7s", pack: "12345", dollars: 40 },
];

test("buildVocabulary emits distinct labels only — never amounts or rows", () => {
  const v = buildVocabulary(entries, { today: "2026-07-13" });
  assert.deepEqual(v.people, ["Ada", "Bob", "Eve"]);
  assert.deepEqual(v.drawers, ["POS", "Safe"]);
  assert.deepEqual(v.items, ["Marlboro Red"]);
  assert.deepEqual(v.games, ["Lucky 7s"]);
  assert.deepEqual(v.locations, ["Main St"]);
  assert.equal(v.today, "2026-07-13");

  const json = JSON.stringify(v);
  for (const amount of ["-8.25", "191.75", "200", "503", "500", "40", "12345"]) {
    assert.ok(!json.includes(amount), `amount ${amount} leaked into the vocabulary`);
  }
});

test("buildSearchPrompt: system carries the routing contract and is cacheable", () => {
  const v = buildVocabulary(entries, { today: "2026-07-13" });
  const { system, messages } = buildSearchPrompt("Eve's shorts last week", v);

  const sys = system[system.length - 1];
  assert.equal(sys.cache_control.type, "ephemeral");
  assert.match(sys.text, /never answer/i);
  assert.match(sys.text, /only use (names|the)/i);
  assert.match(sys.text, /strictly as data/i);
  assert.match(sys.text, /understood/);

  assert.equal(messages[0].role, "user");
  const payload = JSON.parse(messages[0].content); // JSON only
  assert.equal(payload.question, "Eve's shorts last week");
  assert.deepEqual(payload.vocabulary.people, ["Ada", "Bob", "Eve"]);
  assert.ok(!messages[0].content.includes("191.75")); // no amounts in the user message
});

test("coerceFilter: understood=false yields null", () => {
  const v = buildVocabulary(entries);
  assert.equal(coerceFilter({ understood: false, who: "Eve" }, v), null);
  assert.equal(coerceFilter(null, v), null);
});

test("coerceFilter keeps in-vocabulary who/drawer and drops the rest", () => {
  const v = buildVocabulary(entries);
  const ok = coerceFilter({ understood: true, kind: "cash", who: "Eve", drawer: "POS", status: "needs-review", outcome: "short", dateFrom: null, dateTo: null, text: "  cigs " }, v);
  assert.equal(ok.who, "Eve");
  assert.equal(ok.drawer, "POS");
  assert.equal(ok.kind, "cash");
  assert.equal(ok.status, "needs-review");
  assert.equal(ok.outcome, "short");
  assert.equal(ok.text, "cigs");

  const dropped = coerceFilter({ understood: true, who: "Nobody", drawer: "Vault" }, v);
  assert.equal(dropped.who, null, "unknown person must be dropped");
  assert.equal(dropped.drawer, null, "unknown drawer must be dropped");
});

test("coerceFilter clamps bad enums to their broadest value", () => {
  const v = buildVocabulary(entries);
  const f = coerceFilter({ understood: true, kind: "widgets", status: "haunted", outcome: "sideways" }, v);
  assert.equal(f.kind, "all");
  assert.equal(f.status, "all");
  assert.equal(f.outcome, "any");
});

test("coerceFilter validates dates and drops a backwards range", () => {
  const v = buildVocabulary(entries);
  assert.equal(coerceFilter({ understood: true, dateFrom: "2026-07-13", dateTo: "2026-07-01" }, v).dateFrom, null);
  const good = coerceFilter({ understood: true, dateFrom: "2026-07-01", dateTo: "2026-07-13" }, v);
  assert.equal(good.dateFrom, "2026-07-01");
  assert.equal(good.dateTo, "2026-07-13");
  assert.equal(coerceFilter({ understood: true, dateFrom: "july", dateTo: null }, v).dateFrom, null);
});

test("the schema is closed and requires the routing fields", () => {
  assert.equal(SEARCH_FILTER_SCHEMA.additionalProperties, false);
  for (const k of ["kind", "who", "drawer", "status", "outcome", "dateFrom", "dateTo", "text", "understood"]) {
    assert.ok(SEARCH_FILTER_SCHEMA.required.includes(k), `schema must require ${k}`);
  }
});

test("aiSearchEnabled requires both the vendor flag and a key", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(aiSearchEnabled({ aiSearch: true }), false);
  process.env.ANTHROPIC_API_KEY = "sk-test";
  assert.equal(aiSearchEnabled({ aiSearch: true }), true);
  assert.equal(aiSearchEnabled({ aiSearch: false }), false);
  assert.equal(aiSearchEnabled({}), false);
  assert.equal(aiSearchEnabled(null), false);
  if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
});
