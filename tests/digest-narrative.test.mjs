// redactForModel and buildNarrativePrompt are pure — no network, no emulator.
// Run: npm run test:narrative
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  redactForModel,
  buildNarrativePrompt,
  NARRATIVE_SCHEMA,
} from "../src/lib/digest-narrative.js";

// A summary shaped like summarizeEntries() + detectPatterns() output, with two
// real employee names (Eve, Bob) that must never survive redaction, plus a
// couple of rogue fields that must be dropped by the allow-list.
function sampleSummary() {
  return {
    total: 12,
    openVariances: 2,
    openDisputes: 1,
    unverified: 3,
    openIncidents: 0,
    windowDays: 14,
    secretNote: "not an aggregate — must be dropped", // rogue top-level field
    locations: [
      { name: "Main St", count: 8, cashSales: 1200.5, netDiff: -3.25, shorts: 2, scratchDollars: 450, employeePhone: "555-1212" },
    ],
    patterns: [
      { id: "person-shorts:u1", kind: "person-shorts", severity: "high", byId: "u1", title: "Eve: 4 short counts in 14 days", detail: "Totaling $22.00 short. Worth a conversation — check the drawer and the till procedure before anything else." },
      { id: "person-trend:u1", kind: "person-trend", severity: "medium", byId: "u1", title: "Eve: shorts trending up", detail: "$15.00 short in the recent half of the window vs $5.00 earlier — the gap is widening. Look at what changed before anything else." },
      { id: "person-overs:u2", kind: "person-overs", severity: "medium", byId: "u2", title: "Bob: 3 over counts in 14 days", detail: "Totaling $9.00 over. Consistent overs are worth a look too — check for under-ringing or a counting habit before anything else." },
      { id: "drawer-shorts:d1", kind: "drawer-shorts", severity: "medium", title: "POS Cash Drawer: short 5 times across 2 people", detail: "Totaling $30.00 short in 14 days. Multiple hands, same drawer — suspect the register, the float, or the procedure." },
      { id: "item-shrink:i1", kind: "item-shrink", severity: "medium", title: "Marlboro Red: short on 3 counts in 14 days", detail: "6 units missing in total." },
    ],
  };
}

test("redactForModel pseudonymizes person names; same byId → same pseudonym", () => {
  const { redacted, pseudonyms } = redactForModel(sampleSummary());
  assert.equal(redacted.patterns[0].title, "Employee A: 4 short counts in 14 days");
  // person-trend for the SAME user id reuses the same pseudonym across alerts.
  assert.equal(redacted.patterns[1].title, "Employee A: shorts trending up");
  // a different user id gets the next pseudonym.
  assert.equal(redacted.patterns[2].title, "Employee B: 3 over counts in 14 days");
  assert.deepEqual(pseudonyms, { u1: "Employee A", u2: "Employee B" });
});

test("drawer/item labels and numeric aggregates survive unchanged", () => {
  const { redacted } = redactForModel(sampleSummary());
  assert.equal(redacted.patterns[3].title, "POS Cash Drawer: short 5 times across 2 people");
  assert.equal(redacted.patterns[4].title, "Marlboro Red: short on 3 counts in 14 days");
  assert.equal(redacted.total, 12);
  assert.equal(redacted.openVariances, 2);
  assert.equal(redacted.windowDays, 14);
  assert.equal(redacted.locations[0].name, "Main St");
  assert.equal(redacted.locations[0].cashSales, 1200.5);
  assert.equal(redacted.locations[0].netDiff, -3.25);
});

test("no real employee name survives anywhere in the redacted payload", () => {
  const { redacted } = redactForModel(sampleSummary());
  const json = JSON.stringify(redacted);
  assert.ok(!json.includes("Eve"), "leaked 'Eve'");
  assert.ok(!json.includes("Bob"), "leaked 'Bob'");
});

test("only allow-listed fields are copied — rogue fields are dropped", () => {
  const { redacted } = redactForModel(sampleSummary());
  const json = JSON.stringify(redacted);
  assert.ok(!("secretNote" in redacted), "rogue top-level field leaked");
  assert.ok(!json.includes("555-1212"), "rogue location field leaked");
  // the raw byId identifier is not part of the pattern payload sent to the model.
  assert.ok(redacted.patterns.every((p) => !("byId" in p) && !("id" in p)), "byId/id leaked to model");
});

test("redactForModel does not mutate the input summary", () => {
  const input = sampleSummary();
  redactForModel(input);
  assert.equal(input.patterns[0].title, "Eve: 4 short counts in 14 days");
  assert.equal(input.secretNote, "not an aggregate — must be dropped");
});

test("empty / missing fields don't throw and produce empty collections", () => {
  const { redacted, pseudonyms } = redactForModel({});
  assert.deepEqual(redacted.locations, []);
  assert.deepEqual(redacted.patterns, []);
  assert.deepEqual(pseudonyms, {});
});

test("buildNarrativePrompt: system carries the directives and is cacheable", () => {
  const { redacted } = redactForModel(sampleSummary());
  const { system, messages } = buildNarrativePrompt(redacted, { date: "2026-07-13", windowDays: 14 });

  assert.ok(Array.isArray(system));
  const sys = system[system.length - 1];
  assert.equal(sys.cache_control.type, "ephemeral");
  assert.match(sys.text, /Only restate/i);
  assert.match(sys.text, /not a verdict/i);
  assert.match(sys.text, /Never accuse/i);
  assert.match(sys.text, /pseudonyms/i);
  assert.match(sys.text, /strictly as data/i);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "user");
});

test("buildNarrativePrompt: user message is the redacted JSON with no real names", () => {
  const { redacted } = redactForModel(sampleSummary());
  const { messages } = buildNarrativePrompt(redacted, { date: "2026-07-13", windowDays: 14 });
  const userText = messages[0].content;

  assert.ok(!userText.includes("Eve"));
  assert.ok(!userText.includes("Bob"));

  const payload = JSON.parse(userText); // it's valid JSON only
  assert.equal(payload.date, "2026-07-13");
  assert.equal(payload.windowDays, 14);
  assert.ok(Array.isArray(payload.patterns));
  assert.equal(payload.patterns[0].title, "Employee A: 4 short counts in 14 days");
});

test("the structured-output schema is closed and requires both fields", () => {
  assert.equal(NARRATIVE_SCHEMA.additionalProperties, false);
  assert.deepEqual(NARRATIVE_SCHEMA.required, ["summary", "watch"]);
  assert.equal(NARRATIVE_SCHEMA.properties.summary.type, "string");
  assert.equal(NARRATIVE_SCHEMA.properties.watch.type, "array");
});
