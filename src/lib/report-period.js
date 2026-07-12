// Period presets + prev/next date math for the Reports center — pure and
// isomorphic (no Firebase, no DOM), so the report UI and the tests share one
// module. All math is UTC, matching the app's date convention (weekStartMonday /
// weekDates in schedule.js are UTC-based), so a "day" is one calendar day
// everywhere on earth and no timezone drift ever leaks into a saved report.
//
// A period is an INCLUSIVE [startISO, endISO] date range plus a stable `key`
// (for filenames / dedupe) and a human `label` (for the report header).
// `periodRange` turns a preset + reference date into that range; `stepPeriod`
// walks the reference date to the previous/next period for a ◀ ▶ stepper.
//
// Calendar year only for v1; a fiscal-year start offset is a noted future option.

import { weekStartMonday, addDays } from "./schedule.js";

const DAY_MS = 86_400_000;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const parse = (dateStr) => {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
const pad2 = (n) => String(n).padStart(2, "0");
const partsOf = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m0: m - 1, d };
};

// Accept a YYYY-MM-DD string or a Date; return a validated YYYY-MM-DD string.
// Rejects malformed strings and impossible dates (e.g. 2026-02-30) so a bad
// caller fails loudly instead of silently producing a wrong period.
function toISODate(ref, field = "refDate") {
  if (ref instanceof Date) {
    if (Number.isNaN(ref.getTime())) throw new Error(`Invalid ${field}: ${ref}`);
    return ref.toISOString().slice(0, 10);
  }
  const s = String(ref ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Invalid ${field}: ${ref}`);
  if (fmt(parse(s)) !== s) throw new Error(`Invalid ${field}: ${ref}`); // round-trip rejects Feb 30, etc.
  return s;
}

// Shift a date by n calendar months, clamping the day to the target month's
// length (Jan 31 + 1mo -> Feb 28/29). Used by stepPeriod on already-normalized
// month/quarter/half starts, so clamping is a safety net rather than the norm.
function addMonths(dateStr, n) {
  const { y, m0, d } = partsOf(dateStr);
  const t = y * 12 + m0 + n;
  const ny = Math.floor(t / 12);
  const nm0 = ((t % 12) + 12) % 12;
  const dim = new Date(Date.UTC(ny, nm0 + 1, 0)).getUTCDate();
  return fmt(Date.UTC(ny, nm0, Math.min(d, dim)));
}

// ISO-8601 week number + week-numbering year for the week containing dateStr.
// The week-year is fixed by the week's Thursday, so a week straddling Dec/Jan
// keys to whichever year owns four-or-more of its days (e.g. 2025-12-29 -> W01
// of 2026), exactly as ISO 8601 requires.
function isoWeek(dateStr) {
  const ms = parse(dateStr);
  const dow = (new Date(ms).getUTCDay() + 6) % 7;   // Mon=0 … Sun=6
  const thu = ms - dow * DAY_MS + 3 * DAY_MS;        // Thursday determines the year
  const year = new Date(thu).getUTCFullYear();
  const week = Math.floor((thu - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return { year, week };
}

// Compact inclusive-range label:
//   same month:  "Jul 6–12, 2026"
//   same year:   "Jul 1 – Aug 15, 2026"
//   cross-year:  "Dec 29, 2025 – Jan 4, 2026"
function rangeLabel(startISO, endISO) {
  const a = partsOf(startISO), b = partsOf(endISO);
  if (a.y === b.y && a.m0 === b.m0) return `${MON[a.m0]} ${a.d}–${b.d}, ${a.y}`;
  if (a.y === b.y) return `${MON[a.m0]} ${a.d} – ${MON[b.m0]} ${b.d}, ${a.y}`;
  return `${MON[a.m0]} ${a.d}, ${a.y} – ${MON[b.m0]} ${b.d}, ${b.y}`;
}

// Preset descriptors for the UI dropdown (value = the id periodRange expects).
export const PRESETS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "half", label: "Half-year" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
];
const KNOWN = new Set(PRESETS.map((p) => p.value));

export function isPreset(preset) {
  return KNOWN.has(preset);
}

/**
 * Resolve a preset + reference date into an inclusive period.
 * @param {string} preset  one of PRESETS' values.
 * @param {string|Date} refDate  any date within the desired period (YYYY-MM-DD
 *   or a Date). For "custom" it is the start unless opts.start is given.
 * @param {{start?: string|Date, end?: string|Date}} [opts]  custom bounds.
 * @returns {{ startISO: string, endISO: string, key: string, label: string }}
 *   bounds INCLUSIVE.
 */
export function periodRange(preset, refDate, opts = {}) {
  if (!KNOWN.has(preset)) throw new Error(`Unknown period preset: ${preset}`);

  if (preset === "custom") {
    const startISO = toISODate(opts.start ?? refDate, "start");
    const endISO = toISODate(opts.end ?? opts.start ?? refDate, "end");
    if (startISO > endISO) throw new Error(`Custom period start ${startISO} is after end ${endISO}`);
    return { startISO, endISO, key: `${startISO}_${endISO}`, label: rangeLabel(startISO, endISO) };
  }

  const ref = toISODate(refDate, "refDate");
  const { y, m0, d } = partsOf(ref);

  if (preset === "day") {
    return { startISO: ref, endISO: ref, key: ref, label: `${MON[m0]} ${d}, ${y}` };
  }

  if (preset === "week") {
    const startISO = weekStartMonday(ref);
    const endISO = addDays(startISO, 6);
    const { year, week } = isoWeek(startISO);
    return { startISO, endISO, key: `${year}-W${pad2(week)}`, label: `Week of ${rangeLabel(startISO, endISO)}` };
  }

  if (preset === "month") {
    const startISO = fmt(Date.UTC(y, m0, 1));
    const endISO = fmt(Date.UTC(y, m0 + 1, 1) - DAY_MS);
    return { startISO, endISO, key: `${y}-${pad2(m0 + 1)}`, label: `${MONTH[m0]} ${y}` };
  }

  if (preset === "quarter") {
    const q = Math.floor(m0 / 3);                        // 0..3
    const startISO = fmt(Date.UTC(y, q * 3, 1));
    const endISO = fmt(Date.UTC(y, q * 3 + 3, 1) - DAY_MS);
    return { startISO, endISO, key: `${y}-Q${q + 1}`, label: `Q${q + 1} ${y}` };
  }

  if (preset === "half") {
    const h = m0 < 6 ? 0 : 1;                             // H1 Jan–Jun, H2 Jul–Dec
    const startISO = fmt(Date.UTC(y, h * 6, 1));
    const endISO = fmt(Date.UTC(y, h * 6 + 6, 1) - DAY_MS);
    return { startISO, endISO, key: `${y}-H${h + 1}`, label: `H${h + 1} ${y}` };
  }

  // year
  return { startISO: fmt(Date.UTC(y, 0, 1)), endISO: fmt(Date.UTC(y, 11, 31)), key: `${y}`, label: `${y}` };
}

/**
 * Reference date for the period one step earlier (dir < 0) or later (dir >= 0),
 * for a ◀ ▶ stepper. Returns a YYYY-MM-DD you can hand straight back to
 * periodRange. Month/quarter/half/year normalize to the period's start before
 * stepping, so repeated stepping never drifts (Jan 31 -> Feb -> Mar stays
 * month-aligned) and always lands squarely inside the neighbouring period; day
 * and week just shift by 1 day / 7 days (periodRange re-normalizes the week).
 * Custom has no stepper (its bounds are entered directly), so it returns
 * refDate unchanged.
 */
export function stepPeriod(preset, refDate, dir) {
  if (!KNOWN.has(preset)) throw new Error(`Unknown period preset: ${preset}`);
  const step = dir >= 0 ? 1 : -1;
  if (preset === "custom") return toISODate(refDate, "refDate");

  const ref = toISODate(refDate, "refDate");
  const { y, m0 } = partsOf(ref);
  switch (preset) {
    case "day": return addDays(ref, step);
    case "week": return addDays(ref, step * 7);
    case "month": return addMonths(fmt(Date.UTC(y, m0, 1)), step);
    case "quarter": return addMonths(fmt(Date.UTC(y, Math.floor(m0 / 3) * 3, 1)), step * 3);
    case "half": return addMonths(fmt(Date.UTC(y, m0 < 6 ? 0 : 6, 1)), step * 6);
    case "year": return fmt(Date.UTC(y + step, 0, 1));
    default: return ref;
  }
}
