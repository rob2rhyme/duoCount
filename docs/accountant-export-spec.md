---
title: Accountant & franchise export
---

# DuoCount — Accountant & Franchise Export Spec

**Status: analysis/design only — not built.** This is a design for the *next*
layer on top of the shipped Reports center (`docs/reporting-spec.md`, phases 1–4):
three accountant/franchise-shaped outputs that reuse the existing period
aggregation (`buildPeriodReport`) and the existing PDF/CSV generation paths, add
**no new Firestore rules**, and stay read-only. Nothing here exists in the code
yet; the file names, functions, and formats below are the proposed design, not a
description of shipped behavior.

The three outputs:

- **(a) Close-of-day bookkeeper PDF** — a one-tap, single-day reconciliation sheet
  formatted for whoever does the books: cash reconciliation, lottery/scratch
  sales, over/short, and a preview of the journal entry the CSV exports (so paper
  and file agree).
- **(b) QuickBooks-friendly journal CSV** — a balanced, double-entry
  **general-journal** export (GL-account rows with Debit/Credit columns, over/short,
  cash sales, scratch, payouts) that a bookkeeper imports into QuickBooks (or any
  tool that reads a journal CSV) instead of re-keying the day by hand.
- **(c) Optional franchise report format** — a fixed-column layout a
  7-Eleven / Circle K–style operator submits to their franchisor. Off unless a
  profile is selected; a **scaffold**, honestly, because real franchisor schemas
  are contract-specific (see §Formats and §Out of scope).

---

## Goal

Turn the day (or period) DuoCount already reconciles into the exact artifact the
store's **bookkeeper or franchisor** wants — a reconciliation PDF and an
import-ready journal CSV — without the owner re-typing numbers into QuickBooks or a
franchise portal. The app already computes cash sales, paid-outs, over/short,
scratch dollars, and shrink in the pure, tested `buildPeriodReport`
(`src/lib/report-build.js`); this feature **reshapes those same aggregates** into
accounting- and franchise-native layouts. DuoCount stays the count-of-record and a
*lens*, never the book of record: the CSV is a **draft journal the bookkeeper
reviews and posts**, not a silent write into their ledger.

---

## Why

The recurring, unglamorous workflow is the retention hook. Every month (often every
day) the owner or their bookkeeper takes DuoCount's numbers and re-enters them
somewhere else — a shoebox of Z-tapes into QuickBooks, a daily sales figure into a
franchisor portal. That re-keying is where errors, disputes, and "why doesn't this
match" phone calls live.

- **Monthly close is a habit, and habits retain.** A store that closes its books
  *through* DuoCount every month is a store that renews. The reporting spec already
  framed reports as the "save for accountant/franchise/tax/audit" artifact; this
  makes that literal — the accountant asks for the export by name.
- **The bookkeeper becomes a second stakeholder.** Today only the owner/manager
  touches DuoCount. A clean journal CSV puts the tool in front of the person who
  actually decides whether the store keeps paying for it.
- **Franchise operators have no choice about the submission.** A 7-Eleven / Circle
  K operator *must* file a daily report. If DuoCount emits it, DuoCount is load-bearing.

This is a distribution/retention feature dressed as an export button.

---

## Integration point

Everything hangs off surfaces that already exist. No new fetch, no new endpoint, no
rules change.

### ReportModal export options (`src/components/ReportModal.js`)

The Reports center already fetches the period once (`fetchEntriesInRange`), builds
the aggregate (`buildPeriodReport` → `report`), and renders three export buttons
(`Download PDF` / `Download CSV` / `Print`). This feature adds an **Accountant**
export group beneath them, driven by the **same `report`/`rows`/`range` already in
memory**:

- **Close-of-day (bookkeeper) PDF** — a prominent one-tap action. It pins the
  period to a single **day** (defaults to today; respects the picker's selected day
  if the preset is already `day`) and calls a new `downloadBookkeeperPdf()` that
  reuses the existing `@react-pdf/renderer` code path from `downloadPdf` — same
  dynamic import, same `DC` brand mark drawn with PDF primitives, same
  Prepared-by / Reviewed-by signature line — with the reconciliation layout in
  §Formats. Single-day, so no punch fetch (labor is irrelevant to a bookkeeper close).
- **QuickBooks CSV (journal)** — calls `downloadCSV(buildJournalCSV(report, opts),
  \`${fileBase}-journal.csv\`)`, reusing the shipped `downloadCSV` DOM helper
  (`src/lib/utils.js`). Works for any period the picker allows: a day exports one
  entry, a month exports one balanced entry per day×location (see §Formats).
- **Franchise report (optional)** — hidden unless a franchise profile is chosen from
  a small dropdown in this group (default *None*). Selecting a profile is an
  **export-time choice, not a persisted setting**, precisely so the feature needs no
  `vendor` write and therefore no `firestore.rules` change (contrast the `aiSearch`
  flag, which did add a vendor allow-list key). Calls
  `downloadCSV(buildFranchiseCSV(report, profile), …)`.

The group is owner+manager only, same posture as the rest of the modal. Filenames
extend the shipped `fileBase` convention
(`duocount-report-<scope>-<periodKey>`): `…-journal.csv`,
`duocount-closeofday-<scope>-<date>.pdf`,
`duocount-franchise-<profile>-<periodKey>.csv`.

### report-csv.js extensions — new pure shaping module

The reporting spec refers to the CSV builder as `report-csv.js`; in the shipped
code that builder (`entriesToCSV` + the injection-safe `csvCell`) actually lives in
`src/lib/utils.js`, and its tests are `tests/report-csv.test.mjs`. The new
accounting shapes are a **different row shape** (balanced multi-row journal entries,
not one-row-per-count), so they belong in a **new pure sibling module**,
`src/lib/report-accounting.js`, rather than bent into `entriesToCSV`:

- `buildJournalCSV(report, opts)` — pure; takes a `buildPeriodReport` result and
  returns journal-CSV text.
- `buildFranchiseCSV(report, profile)` — pure; returns fixed-column franchise text.

Both **reuse `csvCell`** from `utils.js` for the exact same formula-injection guard
the existing export has (a malicious drawer/location/game name can't smuggle a
spreadsheet formula), and both follow the shipped money convention: amounts are
emitted as **raw `.toFixed(2)` decimals**, never through `money()` — `money()` adds
a `$` and thousands separators for *display*, which QuickBooks and franchise
importers reject. (This is exactly what `entriesToCSV` already does for its amount
cells.) They import nothing from Firebase or the DOM, so they unit-test like
`report-csv`/`report-build` under `node --test`.

### Reused aggregates (no new computation, no new fetch)

`buildJournalCSV`/`buildFranchiseCSV` read only fields the shipped aggregate
already returns:

| Journal/franchise line | Source on `buildPeriodReport` result |
| --- | --- |
| Cash sales | `report.cash.sales`, per-location `report.cash.byLocation[].sales` |
| Paid-outs | `report.cash.paidout` / `byLocation[].paidout` |
| Cash over/short | `report.cash.netDiff` / `byLocation[].netDiff` (`diff = counted − expected`; negative = short) |
| Counted / expected | `report.cash.counted`; expected derived as `counted − netDiff` (no new field) |
| Scratch / lottery sales | `report.scratch.dollars` |
| Net shrink (units) | `report.inventory.netShrink` |
| Verification rate | `report.integrity.verificationRate` |
| Per-day sub-totals (multi-day journals) | `report.trend[]` (`{ startISO, sales, netDiff }`) |

The only aggregate not already present is a per-day **opening float** sum (`Σ start`),
which the bookkeeper PDF's reconciliation block would show as its top line; it is a
one-line addition to `buildPeriodReport` and is called out as optional in §Formats
(the reconciliation is fully coherent without it, using sales / paid-outs /
expected / counted / over-short).

---

## Formats

### (a) Close-of-day bookkeeper PDF

Single-day, single sheet, reconciliation-first. Reuses the existing PDF styles
(`s.page`, `s.head`, `s.totals`, `s.neg`/`s.pos`, `s.sig`) and the `DC` mark.

```
┌───────────────────────────────────────────────────────────┐
│ [DC]  <vendor.name> — Close-of-Day Summary                 │
│ Store code: <vendor.slug> · <locLabel> · <date>            │
│ Prepared by <profile.name> at <generated-at>               │
├───────────────────────────────────────────────────────────┤
│ CASH RECONCILIATION                                        │
│   Opening float            (optional — Σ start)   $  200.00│
│   + Cash sales             report.cash.sales      $2,140.00│
│   − Paid-outs              report.cash.paidout    $   85.00│
│   = Expected in drawer     counted − netDiff      $2,255.00│
│   Counted                  report.cash.counted    $2,251.00│
│   OVER / (SHORT)           report.cash.netDiff    $  (4.00)│  ← s.neg if <0
├───────────────────────────────────────────────────────────┤
│ OTHER SALES                                                │
│   Lottery / scratch sales  report.scratch.dollars $  312.00│
├───────────────────────────────────────────────────────────┤
│ JOURNAL ENTRY (preview — matches the QuickBooks CSV)       │
│   Account                        Debit      Credit         │
│   Undeposited Funds            2,251.00                     │
│   Paid-Outs Clearing              85.00                     │
│   Cash Over/Short                   4.00                    │
│   Sales Revenue                             2,140.00        │
│   Lottery Sales                               312.00        │
│   ───────────────────────────────────────────────         │
│   Totals                       2,340.00     2,452.00  ??    │
├───────────────────────────────────────────────────────────┤
│ Prepared by · date            Reviewed by (manager) · date │
└───────────────────────────────────────────────────────────┘
```

The embedded **journal-entry preview renders the exact rows `buildJournalCSV`
emits**, so the paper the bookkeeper signs and the file they import are the same
numbers. (The `??` above is a placeholder in this sketch, not the real total — see
the balancing rule in (b); the shipped preview always shows Debits = Credits.) The
"over/(short)" line uses the shipped `s.neg` tone for a shortage, matching the rest
of the app's convention.

Multi-day is possible (the same layout with a per-day table), but the *default and
the one-tap button* are the single-day close — that is the bookkeeper's unit of work.

### (b) QuickBooks-friendly journal CSV — columns defined explicitly

A **balanced general-journal** export. Each accounting day (per location) is one
journal entry: a set of rows sharing a `JournalNo` + `JournalDate` whose Debits
total equals its Credits total to the cent. The column schema is the widely
supported QuickBooks-journal import layout (native QBO journal import via the common
CSV bridges, and readable by Xero/Wave/sheets):

**Header (fixed, in this order):**

```
JournalNo,JournalDate,AccountName,Debit,Credit,Description,Name,Location,Memo
```

| Column | Contents | Notes |
| --- | --- | --- |
| `JournalNo` | `DC-<periodKey>-<locSlug>` | groups the rows of one entry; stable + unique per day×location |
| `JournalDate` | the accounting date | emitted in the profile's date format (default `MM/DD/YYYY` for QBO; ISO available) |
| `AccountName` | GL account from the account map | must match the store's chart of accounts (see below) |
| `Debit` | `.toFixed(2)` or empty | never negative — a reduction is a Credit; never `money()` |
| `Credit` | `.toFixed(2)` or empty | exactly one of Debit/Credit is populated per row |
| `Description` | e.g. `Cash sales`, `Cash over/short` | line-level memo |
| `Name` | optional customer/vendor/employee | blank in v1 |
| `Location` | DuoCount location name | QBO Location/Class tracking for multi-site |
| `Memo` | `DuoCount close · <locLabel> · <date>` | entry-level provenance |

**The account mapping (the accounting content).** Over/short sign follows DuoCount's
`diff = counted − expected`: a **shortage (netDiff < 0) is a Debit** to Cash
Over/Short; an **overage (netDiff > 0) is a Credit**.

| DuoCount aggregate | Default GL account | Dr / Cr | Amount |
| --- | --- | --- | --- |
| Cash sales | `Sales Revenue` | Credit | `report.cash.sales` |
| Lottery/scratch sales | `Lottery Sales` | Credit | `report.scratch.dollars` |
| Paid-outs | `Paid-Outs Clearing` | Debit | `report.cash.paidout` |
| Cash over/short — short | `Cash Over/Short` | Debit | `−min(0, netDiff)` |
| Cash over/short — over | `Cash Over/Short` | Credit | `max(0, netDiff)` |
| Cash to deposit (plug) | `Undeposited Funds` | Debit | balancing amount |

The **`Undeposited Funds` line is the computed plug** = (all Credits) − (all
non-plug Debits), so the entry balances *by construction* and represents the cash
staged for the bank. Example for the sheet above (sales 2140, scratch 312, paidout
85, short 4):

```
JournalNo,JournalDate,AccountName,Debit,Credit,Description,Name,Location,Memo
"DC-2026-07-14-main","07/14/2026","Undeposited Funds","2233.00","","Cash to deposit","","Main St","DuoCount close · Main St · 2026-07-14"
"DC-2026-07-14-main","07/14/2026","Paid-Outs Clearing","85.00","","Paid-outs","","Main St","..."
"DC-2026-07-14-main","07/14/2026","Cash Over/Short","4.00","","Cash short","","Main St","..."
"DC-2026-07-14-main","07/14/2026","Sales Revenue","","2140.00","Cash sales","","Main St","..."
"DC-2026-07-14-main","07/14/2026","Lottery Sales","","312.00","Lottery/scratch sales","","Main St","..."
```

Debits 2233 + 85 + 4 = 2322; Credits 2140 + 312 = 2452 — **not balanced with those
inputs**, which is the honest crux: a real close also needs the deposit/float
reality to reconcile, and DuoCount's `counted` includes the opening float. So the
shipped builder computes the plug from DuoCount's own `counted`/`netDiff` rather
than from sales alone, and the account map is **configurable** because no two chart
-of-accounts name these the same. v1 ships the defaults above as a baked-in constant
(so it works with zero setup and **no vendor write / no rules change**); making the
account names editable per store is a later enhancement that *would* touch the
vendor allow-list and is therefore deferred (§Out of scope). The guarantee the
builder enforces regardless of the map: **every emitted entry balances to the cent**.

Multi-day periods emit one balanced entry per `report.trend[]` day (× location via
`report.cash.byLocation`), so a month imports as ~30 clean daily entries, not one
lump.

**Money/escaping rules (grounded in the shipped export):** amounts are raw
`.toFixed(2)` (no `$`, no separators), every field passes through `csvCell` (formula
-injection guard + quote-doubling), null/blank fields render as empty cells, and
rows are emitted in the order given.

### (c) Optional franchise report — fixed-column sketch

Franchisors (7-Eleven, Circle K, and similar c-store brands) require a **daily sales
report in a rigid, ordered, fixed-column schema** — specific headers, specific field
order, sometimes a specific date format or delimiter. `buildFranchiseCSV(report,
profile)` maps DuoCount aggregates onto a **named profile's** fixed column list. A
generic, brand-neutral profile that mirrors what these reports ask for:

```
StoreNo,BusinessDate,GrossSales,CashSales,LotterySales,PaidOuts,OverShort,DeptCount,VerifiedPct
"1234","2026-07-14","2452.00","2140.00","312.00","85.00","-4.00","3","96"
```

| Column | Source |
| --- | --- |
| `StoreNo` | `vendor.slug` (or a profile-supplied store number) |
| `BusinessDate` | the day (profile date format) |
| `GrossSales` | `cash.sales + scratch.dollars` |
| `CashSales` | `report.cash.sales` |
| `LotterySales` | `report.scratch.dollars` |
| `PaidOuts` | `report.cash.paidout` |
| `OverShort` | `report.cash.netDiff` (signed) |
| `DeptCount` | count of active kinds present |
| `VerifiedPct` | `round(integrity.verificationRate × 100)` |

**Honesty flag:** this is a **scaffold, not a certified submission**. Actual
7-Eleven / Circle K daily-report schemas are proprietary, contract-specific, and
change by market and franchise agreement; DuoCount cannot ship a
guaranteed-accepted file for a brand it has never seen the spec for. So v1 ships the
generic profile plus the *mechanism* (`profile` = ordered column list + per-column
mapper + date format), and per-brand profiles are added only when a pilot franchisee
provides their real template ("bring us the spec"). The feature stays **off** unless
a profile is explicitly selected in the export UI.

---

## Failure handling

The exports are additive over the shipped modal; they can never break the existing
Download PDF / Download CSV / Print. All shaping is pure and total (an empty or
zeroed input is valid, never an exception).

| Condition | Behavior |
| --- | --- |
| Empty period (`report.empty`) | Journal CSV is header-only; bookkeeper PDF prints with a "No activity recorded" line; franchise row is all-zero. No crash. |
| Over/short is exactly 0 | No Cash Over/Short row is emitted (or a 0.00 row per profile); entry still balances. |
| A location has cash but no scratch (or vice-versa) | Only the applicable lines emit; the plug still balances the entry. |
| Malicious drawer/location/game name (leading `= + - @`) | Neutralized by `csvCell` (leading apostrophe), same guard as the shipped export; a regression test asserts this. |
| PDF render throws | Same fallback the modal already uses — toast "PDF failed — try Print"; the line-by-line Print and the CSV still work. |
| No franchise profile selected | The franchise button is hidden; nothing to fail. |
| Amounts don't reconcile against the store's real bank | Out of DuoCount's control by design — the CSV is a **draft** the bookkeeper reviews; the Memo column carries provenance so a mismatch is traceable, not silent. |

There is no network path and no write path here, so there is no timeout, no partial
state, and no rule to violate.

---

## Testing

Same posture as the shipped `report-csv`/`report-build`/`report-period` tests: pure
cores, `node --test`, no emulator, a fixed fixture (the demo seed and the existing
`report-build` fixtures serve directly). New script
`test:report-accounting` → `tests/report-accounting.test.mjs`, mirroring
`tests/report-csv.test.mjs`.

`buildJournalCSV`:
- **Header schema is the fixed 9-column string**, unquoted, byte-for-byte (mirrors
  the `entriesToCSV` header assertion).
- **Every entry balances**: for each `JournalNo` group, `Σ Debit === Σ Credit`
  to the cent — asserted on a multi-line, multi-day, multi-location fixture.
- **Sign placement**: a short day puts the amount in `Debit` on `Cash Over/Short`; an
  over day puts it in `Credit`; exactly one of Debit/Credit is populated per row.
- **Raw money format**: amounts are `\d+\.\d{2}` with no `$` and no `,` (guards the
  `money()`-vs-`toFixed` mistake explicitly).
- **Injection guard**: a `=HYPERLINK(0)` drawer/location name is neutralized in the
  output (reuse the exact assertion style from the shipped `report-csv` test).
- **Empty period** → header row only; **null-safe** fields render as empty cells,
  never `null`/`undefined`.
- **Account map**: overriding the default map changes the `AccountName` cells and
  nothing else.

`buildFranchiseCSV`:
- Fixed column order for a given profile; date in the profile's format; `OverShort`
  carries DuoCount's sign; `GrossSales === CashSales + LotterySales`; unknown/blank
  aggregates render as `0.00`; `csvCell` escaping holds.

The bookkeeper **PDF** itself isn't unit-tested (it's `@react-pdf/renderer` I/O,
same posture as the shipped `downloadPdf`), but its journal-preview rows are
produced by the tested `buildJournalCSV` shaping, so the numbers are covered.

---

## Phasing

1. **Journal CSV core + tests (pure; no UI risk).** `src/lib/report-accounting.js`
   `buildJournalCSV`, the baked-in default account map, and
   `tests/report-accounting.test.mjs`. Ships the accounting logic first, exactly as
   the reporting spec shipped its period math first. *~1 day incl. tests; the risk is
   correctness of the mapping, not code volume.*
2. **Wire the QuickBooks CSV button** into `ReportModal`'s new Accountant group
   (reusing `downloadCSV` + the in-memory `report`). *~0.5 day.*
3. **Close-of-day bookkeeper PDF.** `downloadBookkeeperPdf()` reusing the existing
   `@react-pdf/renderer` path with the reconciliation + JE-preview layout; the
   optional `Σ start` opening-float aggregate in `buildPeriodReport` if we want that
   line. *~1–1.5 days — new layout on a known rendering path.*
4. **Franchise scaffold.** `buildFranchiseCSV` + the generic profile + the
   export-time profile dropdown (no persistence, no rules change). *~1 day for the
   mechanism; per-brand profiles are open-ended and gated on a real spec.*

Honest total for a shippable (a)+(b): ~2.5–3 days. (c) as a *generic* scaffold: +1
day; (c) as a *brand-certified* submission: unbounded without a pilot's real template.

---

## Acceptance criteria

- The shipped Reports center is unchanged when the Accountant group is untouched —
  Download PDF / Download CSV / Print behave exactly as today.
- **QuickBooks CSV**: for any period, every journal entry it emits **balances to the
  cent** (Debits = Credits per `JournalNo`); amounts are raw 2-decimal with no `$`
  or separators; over/short lands in the correct Debit/Credit column by sign; a
  malicious label can't inject a formula; an empty period yields a header-only file.
- **Bookkeeper PDF**: one tap produces a single-day reconciliation whose embedded
  journal-entry preview shows the **same rows** the CSV exports, with the app's
  over/(short) tone convention and the existing DC mark + signature line.
- **Franchise CSV** (when a profile is selected): the exact fixed column order for
  that profile, DuoCount's over/short sign preserved, `GrossSales = CashSales +
  LotterySales`.
- **No new Firestore rules**, no new endpoint, no new fetch: all three read the
  period already in memory and render client-side, so they can't touch the
  append-only log or its signed history.
- The shaping functions are **pure and unit-tested** under `test:report-accounting`;
  the account map lives in one constant; amounts never route through `money()`.

---

## Out of scope (v1) / future

- **No live accounting-software API.** v1 is **file export only** — no OAuth, no
  QuickBooks Online / Xero / Wave connection, no direct posting into a ledger.
  DuoCount hands the bookkeeper a file; the bookkeeper reviews and posts it. A
  connected integration (push entries via the QBO API) is a much larger, higher-trust
  feature with its own auth, token storage, and error-reconciliation surface —
  deliberately deferred.
- **Editable, per-store GL account map persisted on `vendor`** — deferred precisely
  because it would add a `vendor` allow-list key (a `firestore.rules` change), which
  this design avoids. v1 uses a baked-in default map.
- **Brand-certified franchise schemas** (a file guaranteed accepted by a specific
  7-Eleven / Circle K portal) — needs a pilot franchisee's real template; v1 ships
  only the generic scaffold + the profile mechanism.
- **Bank-feed reconciliation, deposit matching, and tax computation** — DuoCount
  reports what was counted; it is not the book of record and does not compute sales
  tax or match bank statements.
- **Scheduled/emailed monthly journal** — the digest infra (`src/lib/digest.js`)
  could later attach the month's journal CSV to an email, same as the reporting
  spec's deferred "scheduled reports."

## Why it fits the trust model

Like every report in DuoCount, these outputs only **read** the append-only log and
render client-side from data already fetched. They add no Firestore rule, no
endpoint, and no write path, so they cannot mutate or weaken the signed, verified
history. The journal CSV is explicitly a **draft the bookkeeper reviews** — DuoCount
stays the count-of-record and a lens over it, never the ledger of record.
