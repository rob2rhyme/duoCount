---
title: Owner-only CSV bulk import & migration
---

# DuoCount — Bulk Import Spec

**Status: analysis / design only — NOT built.** This is the design for a
one-time-per-store, owner-only CSV importer that migrates a shop off paper,
Excel, or another tool into DuoCount. Nothing here ships yet; there is no
`/api/import` route, no importer lib, no Admin UI. The trust model, column
mappings, validation, and phasing below are the contract to build against — and,
just as importantly, the record of what the importer is deliberately **not**
allowed to do (it never writes or edits a sealed count entry retroactively).

It reuses, verbatim where possible, the trusted server path the seed and signup
routes already prove out: an Admin-SDK route gated by `requireOwner`, scoped to
the caller's own vendor, writing through the same `chunkedWriter` batching the
`/api/seed` route uses. Where the seed writes *fictional* data tagged
`seed: true`, the importer writes the store's *real* catalog, roster, and opening
baselines — so the differences from the seed are all in the direction of *more*
caution, not less.

---

## Goal

Let an owner upload a CSV they exported from their old system — a spreadsheet of
tracked items, a staff list, a shelf count — and land it in DuoCount in three
guided steps, each with a **dry-run preview** they confirm before anything is
written:

- **(a) the tracked-item catalog** → the `items` collection;
- **(b) the staff roster** (name, role, PIN policy, location, email) → `users`
  docs + hashed PIN creds, exactly as `POST /api/staff` writes them;
- **(c) opening inventory baselines** → one clean, signed, unverified
  `kind: "inventory"` opening count per item, so the first real shelf count has a
  baseline to compute variance against.

The importer maps arbitrary CSV columns onto DuoCount's fields, validates every
row, shows the owner precisely what will be created / updated / skipped / rejected
**before** committing, and is idempotent wherever the data model allows it.

---

## Why

**Setup friction is the single biggest adoption risk.** A convenience store
owner deciding whether to switch already tracks *something* — a legal pad, an
Excel sheet, a spreadsheet their old POS spat out. The ask "re-key your 40
tracked items, your 9 staff, and today's shelf counts by hand before you see any
value" is where trials die. Every field in `AdminPanel.js` today is a one-at-a-
time form: add item, add item, add item. That's fine for the tenth item you add
next month; it's a wall for the first forty on day one.

Migration off paper/Excel is therefore the highest-leverage onboarding feature
we can build, and it is squarely a *setup* problem, not an ongoing one — which
is why it's an owner-only, run-it-once-or-twice tool that lives in Admin next to
Demo data, not a daily workflow.

---

## Why it's server-side (the same argument as the seed)

The obvious approach — parse the CSV in the browser and write with the client
SDK — fails for two of the three import types, and is incoherent for the third.
The reasons are exactly the ones `demo-data-spec.md` gives, applied to real data:

- **Staff can't be written from the client at all.** `firestore.rules` sets
  `allow write: if false` on `users/{userId}` and `read, write: if false` on
  `users/{userId}/private/{docId}` — user docs and their PIN-hash creds are
  *only* writable by the Admin SDK. A roster import **must** go through the
  server, reusing the `hashPin` / uniqueness logic already in `POST /api/staff`.
- **Baselines are signed, append-only entries.** The `entries` create rule pins
  `by == token.name`, `byId == token.userId`, `byRole == token.role`, so a
  client could only ever attribute an opening count to the one signed-in owner —
  never to the actual person who did the shelf count (a `countedBy` column). And
  `allow delete: if false` means a client-written baseline could never be
  corrected by deletion. The server legitimately bypasses the client rules (it's
  trusted infrastructure, same as the seed) so it can attribute a baseline to any
  roster member — while still *voluntarily* writing the exact clean shape the
  create rule would demand (see Trust & rules).
- **Items alone *could* be client-side** (`items` allows `create: if mgr()`), but
  splitting one import across a client path and a server path buys nothing and
  costs consistency: no single atomic preview→commit, no uniform idempotency, no
  one audit tag, two failure modes. Since staff and baselines force the server
  anyway, the catalog rides the same route.

So all three run through one new route, `POST /api/import`, on the Admin SDK —
the same trusted path `signup`, `staff`, `digest`, and `seed` already use.

---

## Integration point

A new route and one Admin card, both mirroring the seed feature's shape:

1. **`POST /api/import`** — `runtime = "nodejs"`, `requireOwner(req)` (the same
   owner-gate, `checkRevoked` token verify, and `claims.vendorId` scoping as
   `/api/seed`). The body carries `{ type, mode, mapping, rows }` where `type` is
   `"items" | "staff" | "baselines"`, `mode` is `"preview" | "commit"`, `mapping`
   is the column→field map the owner confirmed, and `rows` is the parsed CSV
   (array of raw string records). Writes go through the same `chunkedWriter`
   (400-op auto-flush) the seed route defines, so a 300-row roster never hits
   Firestore's 500-op batch limit.
2. **A pure `src/lib/import-parse.js`** — the whole parser + validator, with **no**
   Admin SDK, network, or Firestore import, so it unit-tests like `seed-data.js`
   and `log-filter.js` do. Exports `parseCsv(text)`, `guessMapping(headers, type)`,
   and `validateItems` / `validateStaff` / `validateBaselines`, each returning a
   per-row report (below). The route calls these, then — only in `commit` mode —
   re-runs the same validators server-side against live Firestore state and writes
   the rows that survive. The browser preview is advisory; the server never trusts
   it.
3. **`apiImport(type, mode, mapping, rows)` in `src/lib/data.js`**, right beside
   `apiSeedDemo` — the same `fetchJson("/api/import", { Authorization: Bearer … })`
   shape, so the client wiring is a copy of the demo-data helper.
4. **An "Import / migrate" card in `AdminPanel.js`** (owner-only, like the Demo
   data card): a `type` selector, a file picker, a **column-mapping** step (each
   required target field gets a dropdown of the file's detected headers,
   auto-guessed by name), and a **preview** table that renders the per-row report
   with row numbers matching the source file. The owner reviews, then confirms to
   `commit`. The card sits *above* Demo data and states plainly that this writes
   the store's **real** records.

---

## Data model & column mapping

Parsing is forgiving; the mapping step makes it explicit. `parseCsv` handles a
header row, quoted fields with embedded commas/newlines, and both `,` and `;`
delimiters (auto-detected). `guessMapping` pre-selects a source column for each
target field by fuzzy header match (`"Item Name"`, `"item"`, `"name"` → `name`);
the owner corrects any guess in the UI. Unmapped source columns are ignored.

### (a) Items → `items` collection

Target shape is exactly what `addItem` writes today
(`{ name, category, unit, barcode, locationId, active, createdAt }`):

| Target field | Required | Source / default | Notes |
| --- | --- | --- | --- |
| `name` | yes | mapped column | trimmed; length ≥ 2 |
| `category` | no | mapped column → `null` | trimmed; blank ⇒ `null` |
| `unit` | no | mapped column → `"unit"` | normalized to the AdminPanel set `unit / carton / pack / box / case`; an unrecognized value is a **warning** and falls back to `"unit"` (never blocks) |
| `barcode` | no | mapped column → `null` | trimmed; blank ⇒ `null`; digits-only advisory check |
| `locationId` | yes¹ | a `location` column (name **or** id) → the store's default active location | resolved against real, active locations (same check as `locationError` in the staff route) |

¹ Location is required on the *record* but not on the *CSV* — a single-location
store maps nothing and every item lands at its one active location.

### (b) Staff → `users` docs + `private/creds` (via the `/api/staff` write path)

| Target field | Required | Source / default | Notes |
| --- | --- | --- | --- |
| `name` | yes | mapped column | trimmed; length ≥ 2 |
| `role` | no | mapped column → `"employee"` | one of `employee / manager`; **`owner` rows are rejected by default** (see Trust & rules) |
| `pin` | no | mapped column → *no creds* | if present, must satisfy `isValidNewPin` (`PIN_RE` = `^\d{6}$`, `PIN_HELP` = "6 digits") **and** be unique in the store; if blank, the user is created **without** sign-in creds (like demo staff), and the owner sets a PIN later in Admin |
| `locationId` | yes for `employee` | a `location` column → default active location | employees require a location (mirrors the `/api/staff` "Assign employees to a location" rule); managers may be all-locations (`null`) |
| `email` | no | mapped column → `null` | validated + lowercased with the same `EMAIL_RE` the staff route uses |

**On PINs in a spreadsheet.** Shipping PINs in a CSV is a real security smell —
the file sits in Downloads, in email, in the owner's Excel. The design's default
is therefore *PIN-optional*: import names/roles/locations now, let each person set
their own PIN at first sign-in or have the owner set it in Admin. If an owner does
map a PIN column (some are migrating an existing PIN scheme), it's validated and
uniqueness-checked exactly like `POST /api/staff`, and the preview surfaces "this
row sets a sign-in PIN" so it's never silent.

### (c) Baselines → one `kind: "inventory"` opening count per item

An opening baseline is the *first* inventory count for an item: it records "we
have N on hand as of this date." Modeled as a clean inventory entry where the
counted quantity is also the expected, so `diff` is 0 and nothing flags — the
shape `buildDemoData` produces for inventory, with `startQty = N`,
`received = soldQty = removed = 0`, `expected = N`, `counted = N`, `diff = 0`:

| Target field | Required | Source / default | Notes |
| --- | --- | --- | --- |
| `item` | yes | mapped column (name **or** barcode) | must resolve to **exactly one** active item — so **items are imported first** |
| `quantity` | yes | mapped column | parsed number ≥ 0; becomes `startQty`, `counted`, `expected` |
| `location` | no | mapped column | only needed to disambiguate a same-named item across locations |
| `date` | no | mapped column → today | valid `YYYY-MM-DD`; sets the entry's business `date` |
| `countedBy` | no | mapped column → the owner | must resolve to a roster name; sets `by` / `byId` / `byRole` on the signed entry (the server can attribute honestly because it's trusted, like the seed) |

Each written baseline also carries `source: "import"` and an `importBatchId` (a
per-run id) so imported opening counts are auditable and distinguishable from
hand-entered ones — **without** `seed: true` (see Trust & rules).

---

## Validation & dry-run

Two phases, one validator. `mode: "preview"` runs `import-parse.js` in the browser
(instant, no writes) *and* the route re-runs it server-side against live Firestore
in `mode: "commit"` — same code, so the preview can't drift from what actually
gets written.

**Per-row report.** Every validator returns, for each source row, an object the
UI renders in a table keyed by the **1-based source line number** (so a fix is
"go to line 37 in your CSV"):

```
{ line, status: "create" | "update" | "skip" | "error",
  fields: { …the mapped/normalized values… },
  messages: [ "human-readable note per issue…" ] }
```

- **`create`** — a new, valid record will be written.
- **`update`** — an existing record matched (idempotency, below); mapped fields
  that changed will be patched. (Items/staff only; baselines never update.)
- **`skip`** — a valid row that matches an existing record with no changes, or a
  baseline for an item that already has one (nothing to do).
- **`error`** — the row can't be imported; the message names the offending column
  and why. Errors never block the *other* rows.

**What's checked, by type:**

- **Items** — name present and ≥ 2 chars; `unit` in the allowed set (else warn +
  default); location resolves to a real active location; **in-file** duplicate
  names/barcodes flagged; **against-store** match sets `update`/`skip`.
- **Staff** — name ≥ 2; `role` in `{employee, manager}` (owner → error); `pin` (if
  mapped) passes `isValidNewPin` **and** is unique both *within the file* and
  *against existing store PINs* — the route tests each candidate PIN with
  `verifyPin` against every user's `private/creds`, the exact O(rows × users) loop
  `/api/staff` already runs, which is fine at store scale (tens of users); employee
  rows without a resolvable location → error; email format checked.
- **Baselines** — `item` resolves to exactly one active item (0 matches → error
  "no such item, import the catalog first"; >1 → error "ambiguous, add a location
  column"); `quantity` is a finite number ≥ 0; `date` parses or is blank;
  `countedBy` resolves or defaults to the owner; the item has **no existing
  inventory entry** → otherwise `skip` (the append-only guard, below).

**Summary.** The preview header shows the tallies — e.g. "*32 create · 4 update ·
1 skip · 3 error*" — and Commit is enabled with the honest count: "Import the 36
valid rows (3 errors skipped)." For **items and staff**, committing the valid rows
and reporting the errors is the right default — a partial import of a big roster is
useful and the skipped rows are named. For **baselines**, the default is stricter
(all-or-nothing, opt-out) because an opening count can't be un-written: the owner
fixes the CSV and re-previews rather than half-importing a shelf.

---

## Trust & rules — what the importer may and may not write

Because the route runs on the Admin SDK it *can* bypass every client rule. The
design's discipline is that it bypasses them only where the seed already
establishes it's legitimate (multi-staff attribution, writing user creds), and
**voluntarily writes the exact shape the client rules would demand** everywhere
else — so an imported record is indistinguishable from an honestly-entered one.

**It MAY:**

- **Create `items`** (and patch mapped fields on an existing item it matched).
- **Create `users` + `private/creds`**, hashing PINs with `hashPin` and enforcing
  store-wide PIN uniqueness — the same writes `POST /api/staff` makes.
- **Create opening `kind: "inventory"` baseline entries** that are **clean and
  signed**: `verifiedBy: null`, `varianceStatus: "none"`, `disputeStatus: "none"`,
  `causeCode: null`, `diff: 0`, and `expected` consistent with its components —
  i.e. every predicate the create rule enforces (`varianceConsistent`,
  `expectedConsistent`, `flagConsistent`) holds, even though the server isn't
  checked against them. It attributes each to its `countedBy` (or the owner).

**It MUST NOT:**

- **Never touch an existing entry.** No `update`, no `delete` on any `entries`
  doc — no backfilling a `diff` into a historical count, no marking one
  `verifiedBy`, no resolving a `varianceStatus`, no changing a sealed number. The
  append-only, delete-`false` log is the product's core trust guarantee; the
  importer only ever *appends* net-new opening counts and never rewrites the past.
- **Never write a non-clean entry.** No entry with `verifiedBy` set, a
  `varianceStatus` other than `none`, a `causeCode`, a `disputeStatus`, or a
  non-zero `diff`. Baselines are opening counts, not pre-resolved variances.
- **Never write cash or scratch entries.** No fabricated `sales` / `paidout` /
  ticket history. Fabricating signed money records into the log — which the owner
  digest and the theft-pattern detectors *trust* — is precisely what the create
  rules exist to prevent. Baselines (`diff: 0`) are the only entry type imported.
- **Never tag imported real data `seed: true`.** That flag is what the "Clear
  sample data" button deletes on; a real catalog or baseline carrying it could be
  wiped by a later demo-clear. Imports carry `source: "import"` / `importBatchId`
  instead, and the clear path stays keyed strictly on `seed == true`.
- **Never silently reset an existing staff member's PIN.** A matched user is
  patched for role/location/email only; PIN changes go through the deliberate
  Admin reset, never a re-import.
- **Never create an `owner`.** Role import is capped at `manager`; owner rows are
  errors. (Owner creation stays a deliberate, single, in-app act — mirroring the
  "only an owner can create another owner" guard in the staff route.)
- **Never write `locations`.** Locations are few and are set up in Admin first;
  the importer *resolves* against them and errors if one is missing, rather than
  auto-creating a location from a typo in a spreadsheet cell.

---

## Idempotency (where the data model allows it)

Idempotency is bounded by the append-only rules, and the spec is honest about the
seam:

- **Items — idempotent.** Re-running matches existing items by normalized name
  (and barcode when present) *within the vendor* and `skip`s or `update`s them;
  it never duplicates. Matching is by query, not by a derived doc id, so it also
  reconciles items an owner added by hand in Admin. Safe to re-run after fixing a
  few rows.
- **Staff — idempotent for identity, careful with credentials.** Re-running
  matches an existing active user by normalized name and patches
  role/location/email; it does **not** create a second "Sam Rivera" and does
  **not** re-hash a PIN. *Honest edge:* two real people genuinely share a name —
  name isn't a reliable key. A second same-name row is surfaced as a **warning**
  ("matches an existing staff member — update, or is this a different person?")
  and the owner decides; the importer won't guess.
- **Baselines — NOT idempotent, by construction.** Opening counts are append-only
  entries; there is no delete to make a re-run clean. The guard is a
  **write-once-per-item** rule: the importer refuses (`skip`) a baseline for any
  item that already has *any* inventory entry (imported or real). So a re-run
  after a partial failure resumes on exactly the un-baselined items and can't
  double-write. *Honest residual:* a *wrong* baseline can't be undone — it's
  corrected the same way any real count is, with a fresh inventory count that
  supersedes it. The preview says so before commit.

---

## Failure handling

| Condition | Behavior |
| --- | --- |
| Not signed in / not owner | `requireOwner` → 401/403; nothing parsed or written. |
| Malformed CSV (no header, unreadable, wrong shape) | `parseCsv` throws a specific parse error → 400; **nothing written**. |
| Required column unmapped | Preview blocks commit with "map a column for *name*"; no write. |
| Per-row validation error | Row reported `error` with a column-specific message; other rows still import (baselines: stricter all-or-nothing default). |
| PIN collision found only at commit (a concurrent add took it) | That row fails at commit and is reported; the rest proceed. Re-preview shows it resolved or still colliding. |
| Location referenced but missing | Row `error` "no such location — add it in Admin first"; importer never auto-creates it. |
| Baseline item unresolved / ambiguous | Row `error` naming the fix (import catalog first / add a location column). |
| Mid-batch Firestore write failure | The `chunkedWriter` batch surfaces the error; because items/staff are create-or-skip and baselines are write-once-per-item, **re-running resumes safely** — already-written records are matched and skipped, nothing double-writes. |
| Everything valid | `{ ok: true, type, mode: "commit", counts: { create, update, skip, error } }`, and the Admin card toasts the tallies. |

The governing principle: a failed or half-finished import is always safe to
**re-run**, because every write is idempotent (items/staff) or write-once-guarded
(baselines).

---

## Testing

Same posture as `seed-data.js` and `log-filter.js`: the whole correctness surface
is a **pure lib**, unit-tested with `node --test`; the thin Admin-SDK/route layer
is exercised manually and against the emulator.

- **`tests/import-parse.test.mjs`** (`npm run test:import`) covers, with no network
  or Firestore:
  - `parseCsv` — quoted fields with embedded commas/newlines, `,` vs `;`
    detection, header detection, ragged/blank rows, BOM/whitespace trimming.
  - `guessMapping` — header fuzzy-match picks the right source column and leaves
    ambiguous ones unset.
  - `validateItems` / `validateStaff` / `validateBaselines` — every rule above:
    required-field errors carry the right line number and column; unit
    normalization warns-not-blocks; in-file duplicates flag; PIN format +
    in-file uniqueness; role cap (owner → error); baseline number parsing and the
    resolve-exactly-one-item logic (0 / 1 / >1 matches); the `create`/`update`/
    `skip`/`error` status is correct given a mocked "existing records" fixture.
- **Route + Admin SDK writes** — the against-store uniqueness loop, the chunked
  commit, the write-once baseline guard, and the `source`/`importBatchId` tagging
  are verified against the Firestore emulator (`npm run test:rules` territory) and
  spot-checked on a scratch vendor once deployed — the same live-verify caveat the
  seed and log-search specs carry for their I/O layers.

---

## Phasing

Build in the order the data depends and the risk climbs. Each phase is an
independent importer (its own `type`, mapping, preview, commit), so it ships and
is usable on its own.

1. **Phase 1 — Items.** The catalog first: it's the lowest-risk write (items are
   soft-disable-only, fully idempotent, and baselines depend on them existing),
   and it's the most-typed-in part of setup today. Ships with `parseCsv`,
   `guessMapping`, `validateItems`, the route's `items` branch, and the Admin card
   + mapping/preview UI — the whole scaffold the next two phases reuse.
2. **Phase 2 — Staff.** Adds `validateStaff` and the route's `staff` branch on the
   `/api/staff` write path (`hashPin`, PIN uniqueness, location resolution, role
   cap). Carries the PIN-policy UX (optional PINs, the "sets a sign-in PIN"
   preview flag) and the same-name warning.
3. **Phase 3 — Baselines.** Last, because it's the only phase that appends to the
   append-only log and the only one that isn't cleanly reversible. Adds
   `validateBaselines`, the clean-signed-entry writer, the write-once-per-item
   guard, the `source`/`importBatchId` tags, and the stricter all-or-nothing
   commit default.

---

## Acceptance criteria

- The importer runs **only** through `POST /api/import` on the Admin SDK, gated by
  `requireOwner` and scoped to `claims.vendorId` — the same posture as `/api/seed`.
- Every write path either matches an honestly-entered record's shape or is a write
  the seed/staff routes already make: items as `addItem` writes them, staff as
  `POST /api/staff` writes them, baselines as clean, signed, unverified `diff: 0`
  inventory entries.
- The importer **never** updates or deletes any existing `entries` doc, never
  writes a non-clean or non-inventory entry, never tags real data `seed: true`,
  never resets an existing PIN, never creates an `owner`, and never creates a
  `location`.
- Every import type has a **dry-run preview** that lists per-row
  `create/update/skip/error` with source line numbers and column-specific messages,
  and a summary tally — with no writes performed in `preview` mode.
- Commit **re-validates server-side** against live Firestore; the browser preview
  is never trusted to gate a write.
- Re-running any import is safe: items and staff are idempotent (no duplicates,
  no silent PIN resets); baselines are write-once per item.
- `parseCsv`, `guessMapping`, and the three validators are **pure** and unit-tested
  in `tests/import-parse.test.mjs`; the route/Admin-SDK layer is emulator- and
  live-verified.
- With no file uploaded or a malformed CSV, the Admin card shows a clear error and
  writes nothing.

---

## Out of scope / later

- **Importing cash or scratch history.** Backfilling months of prior POS closes,
  lottery, or scratch counts means forging signed money entries with fabricated
  diffs into the append-only log the digest and theft detectors trust — exactly
  what the create rules forbid. Baselines (clean, `diff: 0`, inventory-only) are
  the *only* entries the importer writes. Historical books stay where they are.
- **Importing scratch-off packs or settlement history** — the pack lifecycle is
  forward-only and terminal-frozen in rules; it's set up in Admin, not imported.
- **Two-way sync / round-trip export-then-reimport.** Reports already export;
  ongoing sync with an external system is a separate, much larger feature.
- **Direct POS / accounting connectors** (Square, Clover, QuickBooks). CSV is the
  neutral interchange on purpose; named integrations, if ever, are their own specs.
- **Non-CSV formats** (`.xlsx`, Google Sheets URLs). CSV first; a spreadsheet
  parser could feed the same pure validator later without touching the route.
- **Scheduled or recurring imports.** This is a one-time-per-store migration tool,
  owner-run, not an automation.
- **Editing existing records via re-upload as a general update channel.** The
  idempotent `update` on items/staff is a re-run convenience, not a bulk-edit
  product; entry corrections stay on their existing audited paths.
- **Client-side parsing-and-writing.** Never — the route is server-only, for the
  reasons above.
