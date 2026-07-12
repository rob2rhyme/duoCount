// Pure period math — no emulator needed. Run: npm run test:report-period
import { test } from "node:test";
import assert from "node:assert/strict";
import { periodRange, stepPeriod, isPreset, PRESETS } from "../src/lib/report-period.js";

// ---------------------------------------------------------------- presets ----
test("PRESETS lists every supported preset with UI labels", () => {
  assert.deepEqual(PRESETS.map((p) => p.value), ["day", "week", "month", "quarter", "half", "year", "custom"]);
  for (const p of PRESETS) assert.ok(typeof p.label === "string" && p.label.length);
  assert.ok(isPreset("quarter") && !isPreset("decade"));
});

// ------------------------------------------------------------------- day ----
test("day: the single date, inclusive, keyed and labelled", () => {
  const r = periodRange("day", "2026-07-12");
  assert.deepEqual(r, { startISO: "2026-07-12", endISO: "2026-07-12", key: "2026-07-12", label: "Jul 12, 2026" });
});

// ------------------------------------------------------------------ week ----
test("week: Mon–Sun containing the ref, ISO-week key, canonical label", () => {
  const r = periodRange("week", "2026-07-12"); // 2026-07-12 is a Sunday
  assert.equal(r.startISO, "2026-07-06");       // its Monday
  assert.equal(r.endISO, "2026-07-12");         // its Sunday
  assert.equal(r.key, "2026-W28");
  assert.equal(r.label, "Week of Jul 6–12, 2026");
  // any day in the week resolves to the same range
  assert.deepEqual(periodRange("week", "2026-07-06"), r);
});

test("week spanning a month edge labels and keys correctly", () => {
  const r = periodRange("week", "2026-08-01"); // Saturday; week is Jul 27 – Aug 2
  assert.equal(r.startISO, "2026-07-27");
  assert.equal(r.endISO, "2026-08-02");
  assert.equal(r.key, "2026-W31");
  assert.equal(r.label, "Week of Jul 27 – Aug 2, 2026");
});

test("week spanning a year edge uses the ISO week-year (not the calendar year)", () => {
  const r = periodRange("week", "2026-01-01"); // Thursday; week is Dec 29 2025 – Jan 4 2026
  assert.equal(r.startISO, "2025-12-29");
  assert.equal(r.endISO, "2026-01-04");
  assert.equal(r.key, "2026-W01");             // ISO: the week belongs to 2026
  assert.equal(r.label, "Week of Dec 29, 2025 – Jan 4, 2026");
});

// ----------------------------------------------------------------- month ----
test("month: first–last of the ref's month", () => {
  const r = periodRange("month", "2026-07-12");
  assert.deepEqual(r, { startISO: "2026-07-01", endISO: "2026-07-31", key: "2026-07", label: "July 2026" });
});

test("month length: non-leap February ends on the 28th", () => {
  assert.equal(periodRange("month", "2026-02-10").endISO, "2026-02-28");
});

test("month length: leap-year February ends on the 29th", () => {
  const r = periodRange("month", "2024-02-10"); // 2024 is a leap year
  assert.equal(r.startISO, "2024-02-01");
  assert.equal(r.endISO, "2024-02-29");
  assert.equal(r.key, "2024-02");
  assert.equal(r.label, "February 2024");
});

test("month length: 30- and 31-day months", () => {
  assert.equal(periodRange("month", "2026-04-15").endISO, "2026-04-30"); // April
  assert.equal(periodRange("month", "2026-12-25").endISO, "2026-12-31"); // December
});

// --------------------------------------------------------------- quarter ----
test("quarter: each of Q1–Q4 maps to its three-month span", () => {
  assert.deepEqual(periodRange("quarter", "2026-02-15"), { startISO: "2026-01-01", endISO: "2026-03-31", key: "2026-Q1", label: "Q1 2026" });
  assert.deepEqual(periodRange("quarter", "2026-05-15"), { startISO: "2026-04-01", endISO: "2026-06-30", key: "2026-Q2", label: "Q2 2026" });
  assert.deepEqual(periodRange("quarter", "2026-07-12"), { startISO: "2026-07-01", endISO: "2026-09-30", key: "2026-Q3", label: "Q3 2026" });
  assert.deepEqual(periodRange("quarter", "2026-11-20"), { startISO: "2026-10-01", endISO: "2026-12-31", key: "2026-Q4", label: "Q4 2026" });
});

test("quarter boundary days land in the right quarter", () => {
  assert.equal(periodRange("quarter", "2026-03-31").key, "2026-Q1");
  assert.equal(periodRange("quarter", "2026-04-01").key, "2026-Q2");
});

// ------------------------------------------------------------------ half ----
test("half: H1 Jan–Jun, H2 Jul–Dec", () => {
  assert.deepEqual(periodRange("half", "2026-06-30"), { startISO: "2026-01-01", endISO: "2026-06-30", key: "2026-H1", label: "H1 2026" });
  assert.deepEqual(periodRange("half", "2026-07-01"), { startISO: "2026-07-01", endISO: "2026-12-31", key: "2026-H2", label: "H2 2026" });
});

// ------------------------------------------------------------------ year ----
test("year: Jan 1 – Dec 31", () => {
  assert.deepEqual(periodRange("year", "2026-07-12"), { startISO: "2026-01-01", endISO: "2026-12-31", key: "2026", label: "2026" });
});

// ---------------------------------------------------------------- custom ----
test("custom: caller-supplied bounds; ref is the start, opts.end the end", () => {
  const r = periodRange("custom", "2026-07-01", { end: "2026-08-15" });
  assert.deepEqual(r, { startISO: "2026-07-01", endISO: "2026-08-15", key: "2026-07-01_2026-08-15", label: "Jul 1 – Aug 15, 2026" });
});

test("custom: opts.start/opts.end also work (ref ignored)", () => {
  const r = periodRange("custom", null, { start: "2026-01-05", end: "2026-03-20" });
  assert.equal(r.startISO, "2026-01-05");
  assert.equal(r.endISO, "2026-03-20");
  assert.equal(r.key, "2026-01-05_2026-03-20");
});

test("custom: a single-day range is allowed", () => {
  const r = periodRange("custom", "2026-01-05", { end: "2026-01-05" });
  assert.equal(r.key, "2026-01-05_2026-01-05");
  assert.equal(r.startISO, r.endISO);
});

test("custom: start after end is rejected", () => {
  assert.throws(() => periodRange("custom", "2026-08-15", { end: "2026-07-01" }), /after end/);
});

// ------------------------------------------------------ shape invariants ----
test("every calendar preset yields start <= end and a well-formed key", () => {
  const keyPat = {
    day: /^\d{4}-\d{2}-\d{2}$/, week: /^\d{4}-W\d{2}$/, month: /^\d{4}-\d{2}$/,
    quarter: /^\d{4}-Q[1-4]$/, half: /^\d{4}-H[12]$/, year: /^\d{4}$/,
  };
  for (const preset of Object.keys(keyPat)) {
    const r = periodRange(preset, "2026-07-12");
    assert.ok(r.startISO <= r.endISO, `${preset}: start after end`);
    assert.match(r.key, keyPat[preset], `${preset}: key ${r.key}`);
  }
});

// ------------------------------------------------------- input handling ----
test("periodRange accepts a Date and normalizes it to a UTC day", () => {
  assert.equal(periodRange("day", new Date("2026-07-12T08:30:00Z")).startISO, "2026-07-12");
});

test("periodRange rejects unknown presets and impossible dates", () => {
  assert.throws(() => periodRange("decade", "2026-01-01"), /Unknown period preset/);
  assert.throws(() => periodRange("day", "2026-13-01"), /Invalid/); // month 13
  assert.throws(() => periodRange("day", "2026-02-30"), /Invalid/); // Feb 30 never exists
  assert.throws(() => periodRange("day", "not-a-date"), /Invalid/);
});

// -------------------------------------------------------------- stepping ----
test("stepPeriod: day and week step by 1 day / 7 days", () => {
  assert.equal(stepPeriod("day", "2026-07-12", 1), "2026-07-13");
  assert.equal(stepPeriod("day", "2026-07-12", -1), "2026-07-11");
  assert.equal(stepPeriod("week", "2026-07-06", 1), "2026-07-13");
  assert.equal(stepPeriod("week", "2026-07-06", -1), "2026-06-29");
});

test("stepPeriod: month steps to the neighbouring month, drift-free", () => {
  assert.equal(stepPeriod("month", "2026-07-15", 1), "2026-08-01");
  assert.equal(stepPeriod("month", "2026-07-15", -1), "2026-06-01");
  // even from the 31st, stepping normalizes to the 1st (no Feb-28 drift)
  assert.equal(stepPeriod("month", "2026-01-31", 1), "2026-02-01");
  // round-trip through periodRange still lands on the right month
  assert.equal(periodRange("month", stepPeriod("month", "2026-07-01", 1)).label, "August 2026");
});

test("stepPeriod: month rolls over the year boundary", () => {
  assert.equal(stepPeriod("month", "2026-12-10", 1), "2027-01-01");
  assert.equal(stepPeriod("month", "2026-01-10", -1), "2025-12-01");
});

test("stepPeriod: quarter and half step by 3 / 6 months and roll the year", () => {
  assert.equal(stepPeriod("quarter", "2026-08-10", 1), "2026-10-01"); // Q3 -> Q4
  assert.equal(stepPeriod("quarter", "2026-08-10", -1), "2026-04-01"); // Q3 -> Q2
  assert.equal(stepPeriod("quarter", "2026-11-01", 1), "2027-01-01"); // Q4 -> Q1 next year
  assert.equal(stepPeriod("half", "2026-09-01", 1), "2027-01-01");    // H2 -> H1 next year
  assert.equal(stepPeriod("half", "2026-09-01", -1), "2026-01-01");   // H2 -> H1
});

test("stepPeriod: year rolls the calendar year and never yields Feb 29", () => {
  assert.equal(stepPeriod("year", "2026-05-05", 1), "2027-01-01");
  assert.equal(stepPeriod("year", "2026-05-05", -1), "2025-01-01");
  assert.equal(stepPeriod("year", "2024-02-29", 1), "2025-01-01"); // leap ref, safe result
});

test("stepPeriod: custom has no stepper — returns the ref unchanged", () => {
  assert.equal(stepPeriod("custom", "2026-07-01", 1), "2026-07-01");
});

test("stepPeriod: dir 0 counts as forward, unknown preset throws", () => {
  assert.equal(stepPeriod("day", "2026-07-12", 0), "2026-07-13");
  assert.throws(() => stepPeriod("decade", "2026-01-01", 1), /Unknown period preset/);
});

test("stepping forward then back returns to the same period", () => {
  for (const preset of ["day", "week", "month", "quarter", "half", "year"]) {
    const ref = "2026-07-12";
    const there = stepPeriod(preset, ref, 1);
    const back = stepPeriod(preset, there, -1);
    // the round-trip lands in the same period as the original ref
    assert.equal(periodRange(preset, back).key, periodRange(preset, ref).key, `${preset} round-trip`);
  }
});
