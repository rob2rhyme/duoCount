// renderPattern is pure — no emulator. Run: npm run test:pattern-format
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPattern } from "../src/lib/pattern-format.js";
import { detectPatterns } from "../src/lib/patterns.js";

const NOW = new Date("2026-07-11T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);
const dstr = (n) => daysAgo(n).toISOString().slice(0, 10);
const cash = (over = {}) => ({
  kind: "cash", date: dstr(1), by: "Eve", byId: "u1",
  drawerName: "POS", diff: 0, verifiedBy: "Mia", ts: daysAgo(1), ...over,
});

test("detectPatterns pre-renders English title/detail from code+params", () => {
  // Every alert carries code + params, and its own English title/detail must
  // equal renderPattern(alert, "en") — the single source the digest reads.
  const entries = [cash({ diff: -3 }), cash({ diff: -3, date: dstr(3) }), cash({ diff: -3, date: dstr(5) })];
  const alerts = detectPatterns(entries, { now: NOW });
  assert.ok(alerts.length);
  for (const a of alerts) {
    assert.ok(a.code, "alert has a code");
    assert.ok(a.params && typeof a.params === "object", "alert has params");
    const en = renderPattern(a, "en");
    assert.equal(en.title, a.title, `${a.code} en title matches`);
    assert.equal(en.detail, a.detail, `${a.code} en detail matches`);
  }
});

test("Spanish render is non-empty, interpolates params, and differs from English", () => {
  const alert = {
    code: "person-shorts",
    params: { name: "Eve", count: 3, windowDays: 14, total: "$9.00" },
  };
  const es = renderPattern(alert, "es");
  assert.ok(es.title.includes("Eve") && es.title.includes("3") && es.title.includes("14"));
  assert.ok(es.detail.includes("$9.00"));
  assert.notEqual(es.title, renderPattern(alert, "en").title);
  // no leftover {placeholder} tokens
  assert.ok(!/\{[a-z]+\}/i.test(es.title + es.detail), "all vars interpolated");
});

test("pack-gap pluralizes title on tickets and detail on boundaries, in both locales", () => {
  const one = { code: "pack-gap", params: { game: "$5 X", pack: "001", tickets: 1, dollars: "$5.00", boundaries: 1, windowDays: 14 } };
  const many = { code: "pack-gap", params: { game: "$5 X", pack: "001", tickets: 4, dollars: "$20.00", boundaries: 2, windowDays: 14 } };
  for (const loc of ["en", "es"]) {
    const r1 = renderPattern(one, loc), rN = renderPattern(many, loc);
    assert.notEqual(r1.title, rN.title, `${loc} singular/plural title differ`);
    assert.notEqual(r1.detail, rN.detail, `${loc} singular/plural detail differ`);
  }
  assert.match(renderPattern(one, "en").title, /1 ticket unaccounted/);
  assert.match(renderPattern(many, "en").title, /4 tickets unaccounted/);
  assert.match(renderPattern(one, "en").detail, /1 count boundary /);
  assert.match(renderPattern(many, "en").detail, /2 count boundaries /);
});

test("an unknown locale falls back to the English template", () => {
  const alert = { code: "person-trend", params: { name: "Eve", recent: "$15.00", earlier: "$5.00" } };
  assert.equal(renderPattern(alert, "fr").title, renderPattern(alert, "en").title);
});
