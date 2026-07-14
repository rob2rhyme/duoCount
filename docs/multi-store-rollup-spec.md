---
title: Multi-store owner rollup / portfolio view
---

# DuoCount — Multi-Store Rollup (Owner Portfolio) Spec

**Status: analysis / design only — NOT built.** No code, no route, no rules, no
UI ships from this document. It is the design for an **owner-facing portfolio
view** that consolidates a vendor's locations into one cockpit: a cross-store
over/short + shrink + verification-rate **leaderboard**, a **consolidated
period close**, and a **per-employee comparison across locations**. It is
deliberately scoped to reuse machinery that already exists and is unit-tested —
`buildPeriodReport` / `buildLocationComparison` (`src/lib/report-build.js`), the
period math in `src/lib/report-period.js`, and the bounded fetch in
`src/lib/data.js` — so the honest new surface area is small: a pure derived
rollup lib, one owner-only view, and its tests. It is **read-only** over the
append-only log, stays **strictly within one vendor's own locations** (tenancy
unchanged), and adds **no Firestore rules**.

**What already exists (and why this is mostly assembly, not invention).**
DuoCount is *already* multi-location per vendor: every entry carries
`locationId` / `locationName`, and `buildLocationComparison(entries, range,
locations)` already runs `buildPeriodReport` once per location plus an
all-locations total and returns a per-location KPI row (over/short, scratch $,
net shrink, verification rate, counts). The Report center already renders that
as a **By location** table (`ReportModal.js`). So the *aggregation substrate for
a rollup is built and tested*. What is missing is (a) an **owner** surface that
isn't buried inside a single-period export modal, (b) a **ranked, rate-normalized
leaderboard** (the existing comparison row is flat totals — it doesn't normalize
a big store against a small one, or order stores by who needs attention), and
(c) a **per-employee cross-location** rollup (today's Dashboard groups employees
by author *name* within one location's `visibleEntries`; nothing follows a person
across stores by stable id). This spec designs exactly those three, and nothing
that the existing report code already does.

---

## Goal

Give the owner of a 3–8 location operation a **single view of the whole
business** for any period they can already pick in Reports (day … year, or
custom dates):

- a **consolidated close** — total over/short, cash sales, scratch $, net
  shrink, and verification rate across every location, reconciling exactly with
  what each store's own report shows;
- a **store leaderboard** — every location ranked on the KPIs that matter for
  loss and discipline (over/short **rate**, shrink, flag rate, verification
  rate), so the store that needs attention this week is at the top, not buried;
- a **per-employee comparison across locations** — one person's over/short,
  shorts, scratch $, and verification rate, split by the stores they worked, so
  an owner can see the employee who balances at Main but runs short at Riverside;
- **drill-down**: tap any store and land in that store's existing single-location
  report — no second, drifting number.

It is a **lens over recorded history**, exactly like the Report center: it only
reads the append-only log, renders client-side, and never mutates a record.

---

## Why it matters

The single-store operator is served today — the Dashboard and the Report center
are enough for one location. **The multi-store owner is the highest-value buyer
and is currently underserved.** A 3–8 store owner is the one who:

- has the most to lose to shrink and drawer over/short, and the least time to log
  into each store's Dashboard one at a time to find it;
- is the actual *purchaser* and renewer of a per-vendor SaaS seat (the employees
  are users; the owner pays);
- already has all the data in DuoCount — every location writes to the same
  `vendors/{vendorId}` tree — but has **no consolidated view of it**, which is
  the single most common "does it do X?" gap for a growing operator.

Concretely: `buildLocationComparison` was shipped as a *table inside a report*.
Promoting the same numbers into an **owner cockpit** — ranked, period-scoped,
drill-downable, with a cross-location employee view the report never had — is the
feature that turns "DuoCount tracks my store" into "DuoCount runs my portfolio,"
which is the difference between a one-store trial and a multi-seat account.

---

## Integration point

Concrete files and functions. The intent is that the portfolio computes nothing
the report doesn't already compute — it *reuses* the tested aggregation and only
adds a thin derived layer plus a surface.

1. **Fetch — reuse `fetchEntriesInRange` unscoped (`src/lib/data.js`), one query,
   no fan-out.** The portfolio always wants *every* location's rows for the
   window, which is exactly what the **unscoped** call already returns:
   `fetchEntriesInRange(vendor.id, startISO, endISO)` (no `locationId`) is a
   single `getDocs` on the automatic single-field `date` index. Store count does
   **not** multiply the fetch — there is no per-store query fan-out, so a portfolio
   of eight stores costs the same one bounded read as a one-store report. No new
   index, no rules change (the comment on `fetchEntriesInRange` already notes
   managers read every entry). Optional labor uses the existing
   `fetchPunchesInRange(vendor.id, startISO, endISO)`.

2. **Period — reuse `report-period.js` verbatim.** `PRESETS`, `periodRange`,
   `stepPeriod`, and the `fiscalStartMonth` option already drive the Report
   center's picker; the portfolio threads `vendor.fiscalStartMonth` through the
   same way (`ReportModal.js` lines 37–50 are the pattern to copy). No new period
   math — the portfolio is just another consumer of the same `{ startISO, endISO,
   key, label }`.

3. **New pure lib — `src/lib/portfolio-rollup.js`** (isomorphic, no Firebase, no
   DOM, unit-tested — same posture as `report-build.js`). Three functions, each
   built **on top of** the existing rollups so every number reconciles:
   - `buildStoreLeaderboard(entries, range, locations, opts)` — calls the tested
     `buildLocationComparison(entries, range, locations)`, then decorates each
     returned `comparisonRow` with **rates** it doesn't carry (over/short per
     cash count and per sales dollar, shrink per inventory count, flag rate =
     `flagged/total`, dispute rate, and the existing `verificationRate`), assigns
     a **rank**, and sorts by a caller-chosen key (default: an "attention" order
     — lowest verification rate and largest |over/short| first). Pure decoration
     + sort over an already-tested base; divide-by-zero guarded (an idle store
     yields `0`/`null` rates, never `NaN`).
   - `buildEmployeeRollup(entries, range, locations, opts)` — the genuinely new
     grouping. Filters to the window (same predicate `buildPeriodReport` uses:
     `e.date >= startISO && e.date <= endISO`), groups by **`e.byId`** (stable
     identity; falls back to `e.by` when an old row lacks an id, and prefers the
     latest `e.by` for display, the way `summarizeHours` reconciles `userName`),
     and within each person splits by `locationId`. Emits per employee: entries,
     cash net over/short, shorts, scratch $, verified-of-total rate, plus a
     `byLocation[]` breakdown. This is what the Dashboard's `byEmp` block
     (`Dashboard.js` lines 89–98) can't do — it keys on name within one location's
     `visibleEntries`.
   - `buildPortfolioSummary(entries, range, locations, opts)` — the consolidated
     close: thin wrapper returning `buildPeriodReport(entries, range, "all",
     opts)` for the header KPIs alongside the leaderboard, so the "all stores"
     total is the *same* function the report uses for scope = All (it must
     reconcile to the penny).

4. **New owner-only surface — `src/components/PortfolioView.js`**, reached from an
   owner-gated tab. `AppShell.js` already filters `TABS` by a `managerOnly` flag
   and already has `isOwner` available from `useSession()`; add an analogous
   `ownerOnly` entry (e.g. `{ id: "portfolio", label: "Portfolio", ownerOnly:
   true }`) and one line in the `tabs` filter (`!t.ownerOnly || isOwner`). The
   view owns a period picker + scope, fetches once, memoizes the three rollups
   (like `ReportModal` memoizes `report`/`comparison`), and renders the KPI
   header, the leaderboard, and the employee panel. Drill-down on a store row
   opens the existing `ReportModal` pre-scoped to that `locId` (or navigates to
   the Dashboard filtered to it) — the single-store numbers are the report's, not
   a re-derivation.

**Tenancy & trust — stated plainly.** Because every entry already lives under
`vendors/{vendorId}` and a signed-in manager/owner already reads all of them,
the portfolio exposes **no new data and needs no new rules** — the unscoped fetch
is the same one Reports uses. "Owner-only" here is therefore a **product/UI
affordance** (`isOwner`, mirroring how Admin → Business settings are owner-gated
in `AdminPanel.js`), **not a new security boundary**: a manager could already open
Reports at scope = All and see every location. The honest claim is *convenience
and framing for the owner*, not *new confidentiality*. Cross-vendor rollup is
impossible by construction — `locations` is the vendor's own list, and the fetch
is tenant-scoped by `vcol(vendorId, "entries")`.

---

## Data & UI design

### Consolidated close (header)
A KPI row identical in shape to the Report center's, but always all-stores:
**net over/short**, **cash sales**, **scratch $**, **net shrink (units)**,
**verification rate**, plus counts and open-flag/dispute totals. Sourced from
`buildPortfolioSummary` → `buildPeriodReport(…, "all")`, so it equals the
report's scope = All figures exactly. An empty period is valid and zeroes (same
contract as `buildPeriodReport`'s `empty`).

### Store leaderboard
The core new artifact. One row per location, ranked, columns:

| Column | Source (from `comparisonRow` unless noted) | Notes |
| --- | --- | --- |
| Store | `locName` | tap → drill-down to that store's report |
| Counts | `total` | denominator; an idle store shows 0 and sorts to a neutral rank |
| Over/short | `cashNet` | absolute $, tone by sign (reuse `money`, pos/neg classes) |
| Over/short rate | `cashNet / cashSales` (derived) | **normalizes** big vs small stores — the honest way to compare a $2k drawer store to a $20k one |
| Net shrink | `invShrink` (units) | see the shrink caveat below |
| Flag rate | `flagged / total` (derived) | share unresolved (`UNRESOLVED` definition, already used by report + Dashboard) |
| Verification rate | `verificationRate` | already a rate — directly comparable across stores |

Default sort is an **attention order** (worst verification rate and largest
|over/short rate| first) so the store that needs the owner is at the top;
column headers re-sort. Ranking and rates are all derived from
`buildLocationComparison`'s output — no second pass over raw entries.

**Honest shrink caveat.** `invShrink` is a sum of **units** (`Σ min(0, diff)`
across inventory counts), not dollars — DuoCount doesn't track per-unit cost. A
unit total is not comparable across item types, so the leaderboard presents
shrink as units (optionally per inventory count) and does **not** claim a
dollarized shrink figure. Dollarizing shrink is out of scope (it needs cost data
the app doesn't hold).

### Per-employee comparison across locations
A table from `buildEmployeeRollup`: one row per person, columns entries / net
over/short / shorts / scratch $ / verification rate, each expandable to a
`byLocation[]` split. The payoff is the person who appears at **two** stores with
a different profile at each — the exact training/loss signal a single store's
Dashboard cannot surface. Keyed on `byId` so name collisions and name drift don't
merge or split people incorrectly.

### Drill-down
Every store row and every employee's per-location cell links to the existing
single-location report (`ReportModal` opened with that `locId`, which already
scopes `buildPeriodReport` to one location). The portfolio never renders a
store's detail with its own math — it hands off to the tested report path so the
top-line and the drill-down can't disagree.

### Degenerate cases in the UI
With **fewer than two active locations** the portfolio is meaningless (it equals
the single store the Dashboard already shows). Hide the tab, or show a gentle
"Add a second location to see your portfolio" empty state — the same discipline
`ReportModal` uses when it only renders the By-location table for `locations.length
>= 2`.

---

## Performance

The design target is "many locations × entries, on a phone," so the honest costs:

- **Network is bounded and flat in store count.** One unscoped
  `fetchEntriesInRange` on the `date` index returns the window for all locations
  — there is **no per-store fetch fan-out**. Cost scales with the *window*, not
  the store count, which is why the window is always a bounded period (day … year
  / custom) and **never "all time"** — an unbounded portfolio fetch is
  disallowed by the same rule the Report center follows (`data.js` §
  `fetchEntriesInRange`).
- **CPU is O(L·N), and that's the lever to watch.** `buildLocationComparison`
  runs `buildPeriodReport` `L+1` times, each an O(N) filter over the fetched
  rows, so the leaderboard is O(L·N). At the target scale (L = 3–8, N = a
  month/quarter of rows) this is negligible on a phone and not worth optimizing.
  It is called out honestly as the growth lever: if a vendor ever ran dozens of
  locations or multi-year windows, a **single-pass** rollup that buckets entries
  by `locationId` in one O(N) sweep would replace the `L+1` passes. That
  optimization is deliberately deferred — premature at 8 stores.
- **Memoize, don't recompute.** The view memoizes the three rollups on
  `[rows, range, locations]`, exactly as `ReportModal` memoizes `report` and
  `comparison`, so scrolling/re-render doesn't re-aggregate.
- **Employee rollup is O(N)** — a single grouping pass over the same fetched
  rows; it does not add another per-store multiplier.

---

## Failure handling

Additive and safe by construction — a portfolio can only ever *summarize* rows
that are already readable; it never gates the app or mutates anything.

| Condition | Behavior |
| --- | --- |
| Viewer is not an owner | Tab absent (the `ownerOnly` filter); managers keep per-location Reports. |
| Fewer than 2 active locations | Portfolio hidden / "add a second location" empty state — no degenerate one-row cockpit. |
| Fetch error | "Couldn't load this period — try again." (reuse `ReportModal`'s `loadError` pattern); nothing else on screen breaks. |
| Empty period | Valid record: every KPI zeroes, the leaderboard lists all stores at zero, `empty` true — same contract as `buildPeriodReport`. |
| A store idle in the window | Still listed (0 counts, rates `0`/`—`, neutral rank) — an idle store is itself a signal, never silently dropped. |
| Divide-by-zero on a rate | Guarded: `cashSales`/`total`/`invCount` of 0 yields `0` or `null`, never `NaN`, and renders as "—". |
| Old rows missing `byId` | Employee rollup falls back to `by` (name) for grouping and display, the way `summarizeHours` reconciles `userName`. |
| "All time" / unbounded window requested | Not offered — the picker only produces bounded periods, so the fetch stays index-served and phone-sized. |

---

## Testing

Same posture as the report libs — the aggregation is a pure module unit-tested
with `node --test`, no emulator; the fetch is reused I/O already covered by the
reporting path, so nothing new to mock.

- **`tests/portfolio-rollup.test.mjs`** (new), over a fixed multi-location
  fixture (the demo seed already spans locations and is the ready fixture the
  reporting spec uses):
  - **Reconciliation (the load-bearing test).** The portfolio's consolidated
    total equals `buildPeriodReport(entries, range, "all")` for over/short, cash
    sales, scratch $, net shrink, verified, and total — the portfolio must not
    invent numbers that disagree with the report. Likewise each leaderboard row's
    raw fields equal that location's own `buildPeriodReport(entries, range, locId)`
    (inherited from `buildLocationComparison`, re-asserted here).
  - **Leaderboard rates & ranking.** Over/short rate, shrink-per-count, flag
    rate, and verification rate match hand-computed values; default sort puts the
    worst-attention store first; re-sort by a column reorders deterministically;
    an idle store yields guarded rates (no `NaN`) and ranks without throwing.
  - **Employee rollup.** A person with entries at two locations is grouped once
    by `byId` with a correct two-row `byLocation` split and summed totals; a
    per-employee verification rate matches; a row missing `byId` falls back to
    `by` and isn't merged into a different person.
  - **Edge cases.** Empty period → all zeros / `empty`; single-location input →
    a degenerate one-row leaderboard (so the UI's ≥2 guard is a UI choice, not a
    lib crash); `startISO > endISO` throws the same way `buildPeriodReport` does.
- **No new I/O test.** The portfolio reuses `fetchEntriesInRange` /
  `fetchPunchesInRange`, which the reporting work already exercises; the view is
  wiring only.

---

## Phasing

Honest about effort: Phase 1 is small because the comparison substrate exists;
Phase 2 is the real UI work; Phase 3 is optional polish.

1. **Phase 1 — pure `portfolio-rollup.js` + tests, shipped dark.** The
   leaderboard (rates + ranking over `buildLocationComparison`) and the
   `buildEmployeeRollup` grouping, with the reconciliation test that pins them to
   `buildPeriodReport`. No UI, no route, no rules — just tested logic behind an
   unused module. *Small–moderate: derived math + one new grouping.*
2. **Phase 2 — the owner Portfolio surface.** The `ownerOnly` tab in `AppShell`,
   the period picker (reused from `report-period.js`), the consolidated-close
   header, the leaderboard table with column sort, and drill-down that opens the
   existing `ReportModal` pre-scoped. *Moderate: it's the bulk of the work, but
   it renders numbers the lib already produced.*
3. **Phase 3 — later / optional.** The per-employee cross-location panel promoted
   to full UI with expandable per-location splits; an optional **portfolio
   PDF/CSV** export reusing `ReportModal`'s `@react-pdf/renderer` primitives (the
   DC mark, the styles) and `entriesToCSV`; optional labor-per-employee-across-
   stores via `fetchPunchesInRange` + `summarizeHours`.

---

## Acceptance criteria

- With **no owner role**, the Portfolio tab is absent; a manager's experience is
  unchanged (per-location Reports only). No new Firestore rules ship.
- With **fewer than two active locations**, the portfolio is hidden or shows the
  add-a-location empty state — never a one-row cockpit.
- For an owner with ≥2 locations, selecting any period shows a **consolidated
  close** whose totals equal `buildPeriodReport(rows, range, "all")` **exactly**,
  and a **leaderboard** whose per-store raw fields equal each store's own
  single-location report — a test asserts the reconciliation.
- The leaderboard ranks stores by an attention order by default, exposes
  normalized **rates** (over/short per sales, flag rate, verification rate), and
  never emits `NaN` for an idle store.
- The **employee rollup** groups a person across locations by `byId`, with a
  correct per-location split, and does not merge two different people or split
  one person by name drift.
- Tapping a store drills into that store's **existing** report — no re-derived,
  potentially-drifting single-store math.
- The whole feature is **read-only**: it issues one bounded, index-served
  unscoped fetch and never writes an entry — the append-only signed history is
  untouched, and `portfolio-rollup.js` is pure and unit-tested.

---

## Out of scope / later

- **Cross-vendor / cross-owner franchise rollup.** Tenancy is per `vendorId`; a
  view spanning *different owners' businesses* is a different product with a
  different trust model. The portfolio is one vendor's own locations, permanently.
- **Dollarized shrink.** Requires per-unit cost DuoCount doesn't track; the
  leaderboard reports shrink in units and says so, rather than fabricate dollars.
- **Any write or action from the portfolio.** It is a lens, read-only, forever —
  no verify/resolve/close from this surface (those stay in the Log/Incidents).
- **Scheduled / emailed portfolio digest.** The `src/lib/digest.js` infra could
  later drive a weekly owner rollup email, as the reporting spec anticipates for
  periodic reports; not v1.
- **Cross-store pattern narratives.** Rolling `detectPatterns` (`patterns.js`) up
  across locations is its own analysis surface (and an AI-narrative candidate) —
  a separate spec, not folded in here.
- **Server-side rollup / real-time streaming portfolio.** All aggregation is
  client-side over a bounded snapshot, like Reports — not a live `watch`. A
  server-rendered rollup for very large operators is a future optimization, tied
  to the O(L·N) single-pass note under Performance.
- **A single-pass locationId-bucketing rollup.** Deferred; premature at 3–8
  stores, worth it only if store count or window grows well beyond the target.
