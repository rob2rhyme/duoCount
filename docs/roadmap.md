# DuoCount — Roadmap

Living plan for what's shipped, what's next, and what's deferred. Feature specs
live in their own `docs/*-spec.md`; this file is the index and the backlog.

## Shipped

| Area | Spec | Status |
| --- | --- | --- |
| Cash / scratch / inventory counts, roles, multi-tenancy | `app-summary-spec.md`, `inventory-tracker-spec.md` | ✅ |
| Tier one — blind counts, variance flags + cause codes, disputes, shift notes, EOD report + email digest | `tier-one-build-spec.md` | ✅ |
| Tier two — incident write-ups, pattern alerts, login rate limiting | `tier-two-build-spec.md` | ✅ |
| Barcode scanning; scratch-off pack lifecycle | `barcode-scanning-spec.md`, `lottery-pack-lifecycle-spec.md` | ✅ |
| UI — denomination cash counter, scroll-to-top FAB, light/dark theme, Preferences menu | `ui-enhancements-spec.md` | ✅ |
| **Configurable scroll-to-top FAB** (per-device toggle in Preferences) | `ui-enhancements-spec.md` §2.2, §4 | ✅ |
| **Mobile layout audit + polish** (all 9 screens, both themes, 390px) | this file, §"Layout audit" | ✅ |
| **Demo data seed** (owner-only load/clear of tagged sample data) | `demo-data-spec.md` | ✅ |
| **Mobile-first PWA** (installable, offline app shell, safe-area, install prompt) | `pwa-spec.md` | ✅ |
| **Distribution / AI-integration analysis** | `distribution-analysis.md` | ✅ |
| **Mobile native-feel + branded footer** (no focus-zoom on text entry, no tap-flash/overscroll, redesigned footer) | `pwa-spec.md`, `ui-enhancements-spec.md` §5–6 | ✅ |
| **Theme & accessibility audit** (WCAG AA contrast measured both themes; `pos`/`neg` status tokens, chip + faint + disabled fixes) | `theme-accessibility-audit.md` | ✅ |
| **Power-user polish** (sticky dashboard table headers, first-name-only pill on tiny screens, keyboard shortcuts) | `ui-enhancements-spec.md` §8–9 | ✅ |
| **Per-vendor pattern thresholds + extra detectors** (5 tunable Alert-sensitivity knobs; repeat-overs & open-variance-backlog detectors) | `tier-two-build-spec.md` §2.1–2.1a | ✅ |
| **Auth hardening** (6-digit PIN policy on new pins; per-store login limiter alongside per-IP) | `tier-two-build-spec.md` §3 | ✅ |
| **Time clock** (append-only in/out punches, hours-by-employee, payroll CSV) | `time-clock-spec.md` | ✅ |
| **Shift scheduling** (manager-managed weekly roster, overlap warnings, scheduled hours, attendance reconciliation vs punches) | `time-clock-spec.md` §Scheduling | ✅ |
| **Richer rostering** (one-click copy-last-week; employee availability + conflict warnings on the roster) | `time-clock-spec.md` §Scheduling | ✅ |
| **Shift swaps** (offer → claim → manager approve/reject state machine; employee swap board) | `time-clock-spec.md` §Shift swaps | ✅ |
| **Week templates** (save a week's roster, stamp it onto any future week) | `time-clock-spec.md` §Scheduling | ✅ |
| **Open shifts** (manager posts an unassigned shift; employees grab it directly) | `time-clock-spec.md` §Scheduling | ✅ |
| **Publish & notify** (email each employee their week's shifts; optional staff emails) | `time-clock-spec.md` §Scheduling | ✅ |
| **Lottery settlement reconciliation** (flexible CSV import, matched vs. records) | `lottery-pack-lifecycle-spec.md` §Reconciliation | ✅ |
| **Rules-engine test coverage** for time clock, schedule, swaps, availability, templates | `tests/rules.test.mjs` | ✅ |
| **Reports & records export** (period presets + custom range; PDF, CSV, print; cash/scratch/inventory/integrity/hours/incidents roll-up; read-only) | `reporting-spec.md` | ✅ |
| **In-app documentation** (the `docs/` guides served at `/docs` in the app; getting-started guide) | `getting-started.md`, `src/lib/docs.js` | ✅ |
| **Trust-model & consistency hardening** (server-pinned punches, frozen settled packs, honest-count enforcement, unambiguous PINs, immediate deactivation, overlap + open-shift fixes, unified "unresolved" metrics, tamper-proof comment counter) | `tier-one/two-build-spec.md`, `time-clock-spec.md`, `lottery-pack-lifecycle-spec.md` | ✅ |

## Next up

Ordered roughly by value-per-effort. Each item lists acceptance criteria so it
can be picked up cleanly.

### 0. Reports & records export — ✅ done
Owner/manager generates and **downloads** a report for any period — daily,
weekly, monthly, quarterly, semi-annual, annual, or custom dates — for records
(accountant, franchise, tax, audit). Generalized the single-day EOD report to
arbitrary ranges with PDF + CSV + print output. Design and acceptance criteria in
**`reporting-spec.md`**; the beginner walkthrough is in **`getting-started.md`**.
- **Delivered:** period presets + custom range; PDF/CSV/print scoped to All / a
  location; cash over-short, scratch, inventory, integrity, hours, and incidents
  rolled up for the period; pure, unit-tested period + aggregation libs
  (`report-period.js`, `report-build.js`); read-only (no new rules).

### 1. Demo data seed — ✅ done (this cycle)
Owner-only **Load / Clear sample data** in Admin. See `demo-data-spec.md`.

- **Design note:** the append-only client rules (`allow delete: if false`, and
  entries must be signed by the *signed-in* user) mean a client-side seed could
  neither attribute entries to multiple staff nor ever be cleared. So the seed
  runs **server-side via the Admin SDK** — the same trusted path `signup` /
  `digest` already use — which is exactly how the product intends privileged
  operations to work, and never weakens the client trust rules. It writes only
  `seed:true`-tagged docs and clears only those, so real counts are untouched.
  The generator (`lib/seed-data.js`) is pure + deterministic (unit-tested).

### 2. Theme-requirements audit — ✅ done (this cycle)
Full WCAG 2.1 AA contrast audit of both themes, measured (not eyeballed) for
every text/background pairing. See `theme-accessibility-audit.md` for the
method, the results table, and the checklist. Fixes shipped: theme-aware
`--pos` / `--neg` status tokens (inline over/short and status text was failing
in dark mode), red status chip lifted to `text-red-700`, the `faint` tier
darkened and reserved for placeholders/decoration with real content moved to
`muted`, `muted` nudged to clear `muted`-on-`subtle`, and a perceivable disabled
state for buttons/inputs. Focus indicator and native controls verified.

### 3. Documentation-accuracy pass — ✅ done (audit fix cycle)
Keep docs true to the code as features land.
- **Acceptance:** README, `app-summary-spec.md`, and each `*-spec.md` are
  reconciled against the current source (file/paths, field names, behavior);
  drift is fixed; this roadmap's "Shipped" table matches reality. Run at the end
  of each feature.
- **Delivered:** the feature-audit fix cycle reconciled the guides against the
  app — sign-up/register wording, sample-data buttons, cause-code labels
  (Human error / …), the tab-row layout, the in-app theme control (gear →
  Appearance), the opening-count expected-cash caveat, and the `acme-market`
  store-code example — and every trust-model/consistency change was written into
  its spec as it shipped.

### 4. Layout + feature-enhancement pass — ✅ done (this cycle)
See §"Layout audit" below for the result and the enhancement backlog it produced.

### 5. Distribution / versioning analysis — ✅ done (this cycle)
Written analysis in `distribution-analysis.md` covering AI integration (where an
LLM adds value + how to build it on the Anthropic API, with cost/privacy notes),
a static-HTML build, WordPress paths, and other packagings — each with effort,
trade-offs, and a recommendation. Headline: the **self-host template** is the
strongest distribution channel; the **opt-in digest narrative** is the
best-value AI feature at negligible cost, gated on a per-vendor privacy opt-in.

### 6. Mobile-first PWA — ✅ done (this cycle)
Installable + offline app shell + safe-area + install prompt. See `pwa-spec.md`.

## Layout audit

All nine screens (Cash, Scratch-offs, Inventory, Log, Notes, Incidents, Time,
Dashboard, Admin) rendered with representative data at **390 px** in **both
themes** and checked for overflow, cramping, hierarchy, and contrast.

**Result:** the app is already genuinely mobile-first — **zero horizontal
overflow**, no broken layouts, and good contrast in light and dark everywhere.
Tables scroll/wrap instead of overflowing; forms collapse cleanly; chips wrap.

**Fixed this cycle:**
- **Dashboard → "Needs attention":** the entity name was truncated to a single
  letter (e.g. `P…`) because the `by · date` meta competed for the same row.
  Meta now stacks beneath the name, so the full drawer/item/game name shows.
- **App header (≤390 px):** the `code: {slug}` line wrapped to three lines,
  inflating the header; it now truncates to one line. The store name gets width
  priority over the user pill, so the brand shows more (`Smokers H…` vs
  `Smoke…`).

**Enhancement backlog (deferred, not blocking):**
- ✅ **Header consolidation** — Sign out moved into the gear (a power-off row at
  the bottom of the Settings menu), so the header is a single control with a
  proper tap target; reclaims width on tiny screens. (`ui-enhancements-spec.md` §4)
- ✅ **Header identity on tiny screens** — the header pill now shows first-name
  only below `sm` and the full name at ≥`sm`, so it stops truncating hard on
  narrow phones. (`ui-enhancements-spec.md` §4)
- ✅ **Sticky headers** on the Dashboard by-drawer / by-item / by-employee tables
  — each table is a bounded scroll region (`max-h`) with a `sticky` `thead`, so
  the column labels stay visible while scrolling long lists. (`ui-enhancements-spec.md` §8)
- ✅ **Empty-state polish** — a shared `EmptyState` component (soft icon badge +
  title + supporting line + optional CTA) on the empty Log, Notes, Incidents, and
  Dashboard states. Log distinguishes "no counts yet" from "no match" (with a
  Clear-filters action); Notes/Incidents focus their composer; Dashboard jumps to
  a new count. (`ui-enhancements-spec.md` §7)
- ✅ **Keyboard shortcuts** for power users — digits jump to a tab, `[` / `]`
  step, `⌘/Ctrl`+`Enter` saves the visible form, `?` toggles a shortcuts sheet.
  Pure decision logic in `lib/shortcuts.js` (unit-tested). (`ui-enhancements-spec.md` §9)

## Deferred (tier 3)

From `tier-two-build-spec.md` §7 — revisit on customer pull:

- **Time clock + payroll CSV + shift scheduling + rostering polish** — ✅ done
  (see Shipped; `time-clock-spec.md`): punches, payroll export, weekly roster,
  copy-last-week, week templates, employee availability, shift swaps, open-shift
  claim, and publish/notify. Still deferred: manager punch correction.
- ✅ **Per-vendor pattern thresholds and extra detectors** — done (see Shipped).
  Remaining slice: escalating variance *trends* and scratch settle-shortfall
  patterns.
- ✅ **Per-user login lockout + 6-digit PIN default** — done (see Shipped):
  6-digit PIN policy + a per-store failure limiter beside the per-IP one.
- ✅ **State-lottery settlement-file reconciliation** — done (see Shipped): a
  flexible CSV importer (map your columns — no fixed state format) that matches a
  settlement file against recorded scratch-off packs and flags discrepancies,
  unknown packs, and settled-but-unbilled packs. `lib/settlement.js` (unit-tested).
- Server-computed blind counts (the one remaining tier-3 item — deferred: it
  needs the cash-entry write path moved server-side, and its value is partial
  since the counter enters start/sales/paid-out themselves).
