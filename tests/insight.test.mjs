// Feature 3 (in-app pattern narrative) pure cores. Run: npm run test:insight
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInsightSummary,
  buildNarrativePrompt,
  redactForModel,
  aiInsightsEnabled,
  aiNarrativeEnabled,
  generateNarrative,
} from "../src/lib/digest-narrative.js";

const patterns = [
  { id: "person-shorts:u1", kind: "person-shorts", severity: "high", title: "Eve: 4 short counts in 14 days", detail: "Totaling $22.00 short. Worth a conversation." },
  { id: "drawer-shorts:d1", kind: "drawer-shorts", severity: "medium", title: "POS: short 5 times across 2 people", detail: "Multiple hands, same drawer." },
];

test("buildInsightSummary shapes patterns + counts into the redactor's summary shape", () => {
  const s = buildInsightSummary(patterns, { openVariances: 2, openDisputes: 1, unverified: 3, windowDays: 14 });
  assert.deepEqual(s.patterns, patterns);
  assert.equal(s.openVariances, 2);
  assert.equal(s.openDisputes, 1);
  assert.equal(s.unverified, 3);
  assert.equal(s.windowDays, 14);
  assert.deepEqual(s.locations, []);
});

test("buildInsightSummary tolerates missing/empty input", () => {
  const s = buildInsightSummary(undefined, {});
  assert.deepEqual(s.patterns, []);
  assert.equal(s.openVariances, 0);
  assert.ok(!("windowDays" in s)); // omitted when not a finite number
});

test("the insight summary redacts person names (reuses redactForModel)", () => {
  const { redacted } = redactForModel(buildInsightSummary(patterns, { windowDays: 14 }));
  const json = JSON.stringify(redacted);
  assert.ok(!json.includes("Eve"), "leaked a real employee name");
  assert.ok(json.includes("Employee A"));
  assert.ok(json.includes("POS")); // drawer label is a process label — kept
});

test("buildNarrativePrompt adds surface only when provided (digest stays byte-identical)", () => {
  const { redacted } = redactForModel(buildInsightSummary(patterns, { windowDays: 14 }));
  const digest = buildNarrativePrompt(redacted, { date: "2026-07-13", windowDays: 14 });
  assert.ok(!digest.messages[0].content.includes("surface"), "digest payload must not carry a surface key");
  const dash = buildNarrativePrompt(redacted, { windowDays: 14, surface: "dashboard" });
  assert.equal(JSON.parse(dash.messages[0].content).surface, "dashboard");
});

test("aiInsightsEnabled needs the aiInsights flag AND a key, independent of the digest flag", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(aiInsightsEnabled({ aiInsights: true }), false);
  process.env.ANTHROPIC_API_KEY = "sk-test";
  assert.equal(aiInsightsEnabled({ aiInsights: true }), true);
  assert.equal(aiInsightsEnabled({ aiInsights: false }), false);
  assert.equal(aiInsightsEnabled({}), false);
  // Independence: neither flag enables the other's surface.
  assert.equal(aiInsightsEnabled({ digest: { narrative: true } }), false);
  assert.equal(aiNarrativeEnabled({ aiInsights: true }), false);
  if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
});

test("generateNarrative returns null when the digest flag is off (no network)", async () => {
  assert.equal(await generateNarrative(buildInsightSummary(patterns, {}), { digest: { narrative: false } }), null);
});
