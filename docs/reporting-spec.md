---
title: Reports & records export
---

# DuoCount — Reports & Records Export Spec

**Status:** shipped (phases 1–4). Period + aggregation libs, bounded date-range
fetch, and the Report center — period picker + live preview, CSV export, a
period-native summary **PDF** (by location / drawer / game / item, integrity,
labor roll-up, incident tally, and an over/short sparkline), plus a line-by-line
**Print**. Future niceties are listed under "Out of scope" below.

**Goal.** Let an owner/manager generate and **download a report for any period** —
daily, weekly, monthly, quarterly, semi-annual, annual, or a custom date range —
to **save for their records** (accountant, franchise, tax, audit). This
generalized the original single-day End-of-Day report to arbitrary periods with
PDF, CSV, and print output — the aggregation now lives in the pure, unit-tested
`buildPeriodReport` (`src/lib/report-build.js`), driven by `ReportModal.js` —
without weakening the trust model (reports are read-only snapshots of the
append-only log).

## What the owner asked for

Presets: **daily · weekly · monthly · quarterly · semi-annual (H1/H2) · annual ·
custom dates.** A downloadable file to keep on record. Reports should cover
everything the period contains — cash over/short, sales, scratch settlement,
inventory shrink, flags/disputes, verification rate, staff hours, incidents.

## Design

### 1. Period math — `src/lib/report-period.js` (pure, unit-tested)
The one genuinely fiddly piece; isolate and test it first.
- `periodRange(preset, refDate)` → `{ startISO, endISO, key, label }`, bounds
  **inclusive**, using the app's existing UTC-date convention (see
  `weekStartMonday`/`weekDates` in `src/lib/schedule.js`, which are UTC-based).
  - `day` → the single date. Label `Jul 12, 2026`, key `2026-07-12`.
  - `week` → Mon–Sun containing ref (reuse `weekStartMonday`). Label `Week of Jul 6–12, 2026`, key `2026-W28`.
  - `month` → 1st–last. Label `July 2026`, key `2026-07`.
  - `quarter` → Q1 Jan–Mar … Q4 Oct–Dec. Label `Q3 2026`, key `2026-Q3`.
  - `half` → H1 Jan–Jun, H2 Jul–Dec. Label `H2 2026`, key `2026-H2`.
  - `year` → Jan 1–Dec 31. Label `2026`, key `2026`.
  - `custom` → caller-supplied start/end. Label `Jul 1 – Aug 15, 2026`, key `2026-07-01_2026-08-15`.
- `stepPeriod(preset, refDate, dir)` → prev/next ref (for a ◀ ▶ stepper).
- Correctness targets for tests: month lengths, **leap-year** Feb, quarter/half
  boundaries, year rollover, week spanning a month/year edge, custom start>end
  rejected.
- **Fiscal-year offset (shipped).** `periodRange`/`stepPeriod` accept
  `opts.fiscalStartMonth` (1–12; default 1 = calendar year). It reshapes only
  **year / quarter / half** — a fiscal year is named by the calendar year it
  *begins* in (July start ⇒ `FY2026` = Jul 2026 – Jun 2027, key `FY2026`; its
  quarters are `FY2026-Q1…Q4`), and the year label carries the full span so the
  naming convention is never ambiguous on a saved report. Day/week/month/custom
  are calendar units and never shift. The store sets its start month in Admin
  → Settings (owner-only); the Report center threads it into the period picker.

### 2. Aggregation — `src/lib/report-build.js` (pure, unit-tested)
Generalized the original single-day EOD rollup into `buildPeriodReport` — a range + richer rollups.
- `buildPeriodReport(entries, { startISO, endISO }, locId, { punches, incidents })`
  filters by `date` in range (and `locId`), then returns:
  - **Cash**: sales, paid-out, counted, **net over/short**, count; broken down
    **by drawer** and **by location**.
  - **Scratch**: tickets sold, gross dollars; by game.
  - **Inventory**: units counted, **net shrink** (Σ negative diff); by item.
  - **Integrity**: flagged, disputed, resolved-with-cause, **verification rate**.
    "Flagged" and "disputed" both mean **unresolved** (`status in ['open', 'under-review']`) — the shared `UNRESOLVED` definition (`lib/utils.js`) the dashboard tiles and digest also use, so the report agrees with the live views (M3).
  - **Trend**: per-sub-period subtotals (per-day for week/month, per-month for
    quarter+) so the PDF can show a small over/short trend.
  - **Labor** (optional, if punches passed): hours per employee via
    `summarizeHours` (`src/lib/timeclock.js`) bounded to the range — a payroll roll-up.
  - **Incidents**: opened / acknowledged / closed within the range.
- **Multi-location comparison (shipped).** `buildLocationComparison(entries,
  {startISO,endISO}, locations, opts)` runs `buildPeriodReport` once per location
  plus an all-locations total, returning a compact per-location KPI row
  (over/short, scratch $, net shrink, verification rate, counts) — so every
  number matches that location's own report exactly. The Report center renders it
  as a **By location** table (preview + PDF + print) whenever the scope is *All*
  and the store has two or more locations. Read-only; no new fetch (reuses the
  period's already-fetched rows).
- Empty period is valid: everything zeroes, and the report still downloads with a
  "No activity in this period" line.

### 3. Data access — bounded range fetch
`watchEntries` (`src/lib/data.js`) streams the **whole** log; fine for a day,
wasteful/limited for a year. A report is a one-shot snapshot, not a live view, so:
- `fetchEntriesInRange(vendorId, startISO, endISO, locId?)` — a one-shot
  `getDocs` that range-queries the business **`date` string**
  (`where('date','>=',startISO).where('date','<=',endISO)`, plus
  `where('locationId','==',locId)` when scoped). We query `date` rather than
  `ts` so a form-**backdated** count reports under the period it is *for*, not
  when it was written — matching exactly how `buildPeriodReport` filters. The
  unscoped range rides the automatic single-field `date` index; the scoped query
  uses a `locationId + date` composite index (added to `firestore.indexes.json`,
  and must be deployed for scoped fetches to work in production). No rules change
  — managers already read every entry.
- For very large ranges, paging the fetch is a future optimization.

### 4. UI — extend the report surface (`src/components/ReportModal.js` → a Report center)
- A **period picker**: preset dropdown (Day / Week / Month / Quarter / Half-year
  / Year / Custom) + a ◀ ▶ stepper for the chosen preset, with two date inputs
  revealed for Custom. Plus the existing **location scope** select (All / each).
- A live **"Will include"** preview (counts + net over/short), same pattern the
  current modal already shows.
- Two exports:
  - **Download PDF** — formatted for records (via `@react-pdf/renderer`, already a
    dependency and already used for the EOD PDF): header (business name + a
    DuoCount **DC** brand mark drawn with PDF primitives — no external image,
    which can fail to load and blank the render — period label, location,
    generated-at, prepared/reviewed signature line), then the summary tables and
    the trend. The print-to-HTML fallback carries the same mark.
  - **Download CSV** — the period's raw rows for a spreadsheet, generalizing
    `exportCSV` (`src/lib/utils.js`) to accept a filtered set. Every cell goes
    through `csvCell`, which guards against **CSV/formula injection** — a value a
    spreadsheet might execute (leading `=`, `+`, `-`, `@`, tab, or CR) is prefixed
    with an apostrophe, while a plain negative amount (−1.00) stays a real number.
    The same `csvCell` backs the payroll CSV in `TimeClock.js`.
- **Filenames**: `duocount-report-<scope>-<periodKey>.<ext>`, e.g.
  `duocount-report-all-2026-Q3.pdf`, `duocount-report-main-2026-07.csv`.
- **Access**: owner + manager (management artifact). Employees don't see it (or,
  if ever exposed, are locked to their own location). All generation is
  client-side; no new endpoint or rule.

### 5. Testing
- `tests/report-period.test.mjs` — every preset, boundary cases above, prev/next.
- `tests/report-build.test.mjs` — totals/breakdowns on a fixed fixture (the demo
  seed is a ready fixture), empty period, location scoping, labor roll-up.
- `tests/report-csv.test.mjs` — the pure `entriesToCSV` builder: per-kind rows,
  2dp money, escaping, ordering, null-safety.
- All pure (`node --test`), no emulator — same style as `settlement`/`patterns`.

## Phasing
1. ✅ **Period + aggregation libs + tests** (pure; no UI risk). Ships the hard logic first.
2. ✅ **`fetchEntriesInRange`** + wire the aggregation to real data.
3. ✅ **Report UI**: period picker + live preview + **CSV** download.
4. ✅ **PDF** export (period-formatted summary tables) + labor/incidents sections + trend sparkline.

## Out of scope (v1) / future
- ~~Fiscal-year start offset~~ **(shipped — see §1)**; ~~multi-location
  side-by-side comparison~~ **(shipped — see §2)**; scheduled/emailed periodic
  reports (the digest infra in `src/lib/digest.js` could later drive a monthly
  PDF email); saved/branded report templates; server-side PDF rendering for very
  large ranges.

## Why it fits the trust model
Reports only **read** the append-only log and render client-side — they never
mutate records, so they need no new Firestore rules and can't compromise the
signed, verified history. They're a lens over existing data, exportable to keep.
