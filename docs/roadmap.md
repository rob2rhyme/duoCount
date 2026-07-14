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
| **Fiscal-year reporting** (owner-set fiscal start month; Year/Quarter/Half periods shift to FY boundaries, `FY2026`-style keys/labels; calendar year stays the default) | `reporting-spec.md` §1 | ✅ |
| **Multi-location comparison** (side-by-side per-location KPI table — over/short, scratch $, shrink, verification rate — in the report preview, PDF, and print when scope is All with 2+ locations) | `reporting-spec.md` §2 | ✅ |
| **In-app documentation** (the `docs/` guides served at `/docs` in the app; getting-started guide) | `getting-started.md`, `src/lib/docs.js` | ✅ |
| **Trust-model & consistency hardening** (server-pinned punches, frozen settled packs, honest-count enforcement, unambiguous PINs, immediate deactivation, overlap + open-shift fixes, unified "unresolved" metrics, tamper-proof comment counter) | `tier-one/two-build-spec.md`, `time-clock-spec.md`, `lottery-pack-lifecycle-spec.md` | ✅ |
| **Inventory variance flagging + blind mode** (opt-in per-store unit threshold; rules-enforced honest counts; blind readout; surfaces in the shared queues) | `inventory-tracker-spec.md` | ✅ |
| **Report PDF brand mark** (DuoCount "DC" mark drawn with PDF primitives in the report/print header) | `reporting-spec.md` | ✅ |
| **Docs & guide search** (live word search across all `/docs` + `/guide` content; build-time index, pure ranking lib, deep-links to the matching doc + heading) | `src/lib/doc-search.js`, `src/components/DocSearch.js` | ✅ |
| **Premium doc-card icons** (curated inline-SVG line icon per documentation card — no external assets, theme-aware) | `src/components/DocIcon.js` | ✅ |
| **Security hardening (audit fixes)** (blocked manager→owner PIN-reset takeover; escaped the report Print path against stored XSS from raw entry fields) | this file, §"Security follow-ups" | ✅ |
| **Session-revocation hardening** (checkRevoked on all privileged routes; revoke refresh tokens on deactivate/demote; constant-time cron secret) | `src/lib/require-manager.js`, §"Security follow-ups" | ✅ |
| **Legal/compliance layer** (LICENSE + privacy notice + disclaimers; "Legal" section on /docs; owner review pending) | `privacy-and-data.md`, `legal-disclaimers.md`, `LICENSE` | ✅ |
| **Guide flow diagrams** (three theme-adaptive SVG diagrams in the getting-started guide) | `public/diagrams/`, `getting-started.md` | ✅ |
| **Static marketing page** (self-contained HTML landing page — the distribution-analysis §2 build) | `marketing/index.html`, `distribution-analysis.md` §2 | ✅ |
| **In-app search everywhere** (search bars on Log / Notes / Incidents with match highlight+underline; shared `text-match` + `Highlight` + `SearchInput`, adopted by the docs search and the inventory item picker) | `src/lib/text-match.js`, `Highlight.js`, `SearchInput.js` | ✅ |
| **Footer logo fix** (footer showed a hardcoded `₵` glyph; now renders the DuoCount `<Logo>` like the header) | `src/components/AppShell.js` | ✅ |
| **Theme-contrast CI guard** (parses live `globals.css` tokens, asserts all 46 WCAG-AA pairings in both themes; catches a token regression) | `scripts/contrast-check.mjs`, `tests/contrast.test.mjs` | ✅ |
| **Low-severity security fixes** (separation-of-duties on `investigate()` so a manager can't self-resolve their own flag; login/signup IP derivation resistant to a spoofed `X-Forwarded-For`) | `firestore.rules`, `src/lib/login-throttle.js` | ✅ |
| **Escalating-trend & scratch settle-shortfall detectors** (patterns 7–8: a person whose shorts are materially worse in the recent half of the window; a game that repeatedly settles with tickets unaccounted — surfaced on the Dashboard and in the digest) | `src/lib/patterns.js`, `tier-two-build-spec.md` §2.1 | ✅ |
| **Manager punch correction** (append-only supersede: a manager edits a punch time, adds a forgotten in/out, or voids a stray punch via a signed correction record — the original is never mutated; folds into hours/reports via `applyCorrections`) | `src/lib/timeclock.js`, `firestore.rules`, `time-clock-spec.md` §Punch corrections | ✅ |
| **Server-enforced count baseline** (rules now require `expected` == its own components for cash/inventory, so a client can't forge the baseline to hide a short — the tractable core of "server-computed blind counts") | `firestore.rules` `expectedConsistent()`, `tests/entry-consistency.test.mjs` | ✅ |
| **Overnight-shift correctness** (overlap check runs on absolute date+time intervals so Mon 22:00–06:00 collides with Tue 05:00–13:00; attendance reconciliation accepts an overnight shift's next-day punches — no more false no-shows / phantom "unscheduled" mornings; availability warnings see the spill day) | `src/lib/schedule.js`, `time-clock-spec.md` §lib | ✅ |
| **Time-level lateness** (arrivals >10 min past the scheduled start on the Attendance card, with minutes; nearest-in-punch pairing bounded by the shift's duration, overnight-safe, pure + unit-tested) | `src/lib/schedule.js` `lateArrivals`, `time-clock-spec.md` §lib | ✅ |
| **Pay-period approval / payroll lock** (manager approves a finished week — freezes timesheet corrections via per-day lock docs enforced in the rules; owner-audited release, manager re-approve; Payroll approval card + locked pills in the timesheet) | `firestore.rules` `payrollLocks`, `src/lib/payroll-lock.js`, `time-clock-spec.md` §Pay-period approval | ✅ |
| **AI digest narrative — Phases 1 & 2 (shipped dark)** (opt-in per vendor, off by default; redacts/pseudonymizes names before egress, builds a cacheable prompt, calls `claude-haiku-4-5` server-side, renders an escaped narrative block above the digest table; additive — any failure sends the plain digest. **Phase 2:** owner toggle in Admin → Business settings + `privacy-and-data.md` disclosure) | `src/lib/digest-narrative.js`, `src/lib/digest.js`, `src/components/AdminPanel.js`, `ai-features-spec.md` | ✅ |
| **First-run onboarding + zero-config empty states** (Tier 1: dismissible manager-only setup checklist tracking location + drawer essentials plus an optional items step, with guiding EmptyState cards on the Cash/Scratch/Inventory tabs that route managers to Admin and reassure employees; pure `setupProgress` derivation, unit-tested; empty states gated on first-snapshot load so existing stores never flash one; no schema/rules change) | `src/lib/setup-progress.js`, `src/components/SetupChecklist.js`, `EmptyState.js`, `AppShell.js`, `competitive-gap-analysis.md` | ✅ |
| **Trustworthy saves** (Tier 1 usability: every count form disables **Save** until its required inputs are entered — pure, unit-tested `count-validation.js` shared by cash/scratch/inventory — and a failed save becomes a *persistent, retryable* error bar via `useSaveState` + `SaveError`, replacing the ~2.2s toast that could hide a lost save on flaky wifi; a "0" count stays valid, the denomination counter satisfies the cash requirement) | `src/lib/count-validation.js`, `src/lib/use-save-state.js`, `src/components/SaveError.js`, `CashForm.js`, `ScratchForm.js`, `InventoryForm.js` | ✅ |
| **Smart count defaults** (Tier 1 usability: each count form opens on the location + drawer this person last used — remembered per vendor+user in `localStorage` — and guesses opening/closing from the time of day; pure, unit-tested `defaultShift` + `pickRemembered`; cash and scratch remember their own drawer so they never cross-fill; memory is a nicety, never load-bearing) | `src/lib/count-context.js`, `CashForm.js`, `ScratchForm.js`, `InventoryForm.js` | ✅ |
| **Inventory fast-path** (Tier 1 usability: the Inventory form leads with a single **Counted on hand** field and collapses start/received/sold/removed into an optional **Movement details** expander — flagged with a dot when filled — so an everyday recount is one number, not five; expected still computes from the prefilled last count) | `src/components/InventoryForm.js` | ✅ |

## Next up

Ordered roughly by value-per-effort. Each item lists acceptance criteria so it
can be picked up cleanly.

### A. List-view search bars — ✅ done
Search boxes on the **Log**, **Notes**, and **Incidents** lists filter live and
**highlight + underline the matching characters** in each result (title, body,
and the "by" name), with a "no match — clear search" empty state. The
**Inventory** item picker is a native `<select>` (can't hold highlight markup),
so it got the shared search box + matcher instead. `SearchInput` is a shared box
(magnifier, Escape/× to clear); highlighting is the shared `Highlight`.

### B. Project-wide search consistency — ✅ done
One shared core: `src/lib/text-match.js` (pure `searchTerms` / `matchesTerms` /
`highlightSegments`, unit-tested), a shared `Highlight` component, and a shared
`SearchInput`. The docs search (`doc-search.js` / `DocSearch.js`) and the
inventory item search now delegate to it, so tokenizing, matching, and match
styling are identical across every search surface — no ad-hoc filter/highlight
logic left behind.

### C. Footer logo fix — ✅ done (bug)
The app footer rendered a hardcoded **"₵" glyph**; it now shows the DuoCount logo
via the shared `<Logo src="/logo.png">` (with the `DC` brass-mark fallback),
matching the header. (`src/components/AppShell.js`)

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

### 7. AI digest narrative — ✅ Phases 1 & 2 built (shipped dark)
The first AI feature from `distribution-analysis.md` §1, specified end-to-end in
**`ai-features-spec.md`** and now **built through Phase 2**. Adds 2–3
plain-English sentences + a "what to watch tomorrow" list to the top of the
existing daily digest, generated on the aggregates the digest already computes.
- **Phase 1 (mechanics, dark):** `src/lib/digest-narrative.js` (`redactForModel`
  + `buildNarrativePrompt` — pure, unit-tested — and the `generateNarrative` I/O
  wrapper), the null-safe `composeEmail` narrative block, the
  `vendor.digest.narrative` opt-in gate + `aiNarrativeEnabled`, and
  `ANTHROPIC_API_KEY` wiring. Server-side `@anthropic-ai/sdk` on
  `claude-haiku-4-5` with structured output + a cacheable system prompt;
  **opt-in per vendor, off by default**; employee names pseudonymized before
  egress; **additive** — any model failure/timeout sends the plain digest
  unchanged; `claude-fable-5` excluded (30-day retention). Tests:
  `npm run test:narrative`.
- **Phase 2 (owner UX + disclosure):** the "AI summary in the daily digest"
  toggle in Admin → Business settings (off by default) with a data-handling note,
  wired into `vendor.digest.narrative`, plus the matching `privacy-and-data.md`
  paragraph. No rules change (the vendor-update rule already allows the `digest`
  map).
- **Still open:** live end-to-end verification against one pilot vendor via the
  test-digest button (needs a real key + deploy). Later: NL log search /
  features 4–5 as their own specs.

### 8. AI natural-language log search — ✅ Phases 1 & 2 built (shipped dark)
The second AI feature (`distribution-analysis.md` §1.1, feature 2), specified in
**`ai-log-search-spec.md`** and built end-to-end behind the off-by-default
`vendor.aiSearch` flag. Turns a plain-English question in the Log search box
(*"Eve's shorts last week"*, *"unverified cash over $20"*) into the **same
filters the Log tab already exposes**, applied to the entries already in the
browser.
- **Design headlines:** the model returns a **filter object, not prose** — it
  routes a query to the existing `kind/who/drawer/status` filters plus a date
  range and over/short predicate; the app does the filtering locally, so **count
  records never leave** (only the typed query + the label vocabulary do).
  Server-side `claude-haiku-4-5` with a stable, cacheable schema (values
  client-validated against the store's real vocabulary); **opt-in per vendor via
  a new `vendor.aiSearch` flag, off by default and separate from the digest
  flag**; **additive** — any failure or an un-routable query falls back to
  today's keyword search. Honest residual: the typed query is user-authored and
  egresses as-is (resolving a named person needs the name), documented in the
  spec's Privacy section.
- **Built (dark):** the shared pure `applyLogFilter` + `buildVocabulary`
  (`src/lib/log-filter.js`) with `LogList` refactored onto it — a 560-combo matrix
  test pins it to the old behavior — plus `src/lib/log-search.js` (prompt/coerce
  pure + tested; `interpretQuery` I/O), the manager-gated `/api/log-search` route
  with the server-enforced `vendor.aiSearch` gate, the "Ask" UI in the Log tab
  (Enter-to-ask, "Interpreted as…" chip, keyword fallback), and the owner toggle
  in Admin + `privacy-and-data.md` disclosure. Tests: `npm run test:log-filter`,
  `test:log-search`. Flag off ⇒ the Log tab is unchanged.
- **Still open:** live model-call verification against a pilot store (needs a real
  key + deploy); the one-key `firestore.rules` allow-list addition wants an
  emulator/staging check (`npm run test:rules`).

### 9. AI in-app pattern narrative — ✅ Phases 1 & 2 built (shipped dark)
The third AI feature (`distribution-analysis.md` §1.1, feature 3), specified in
**`ai-pattern-narrative-spec.md`**. The **in-app twin of the digest narrative**:
an "Explain these signals" button on the Dashboard's Patterns card that turns the
on-screen `detectPatterns` alerts into a 2–3 sentence "what to look at first"
readout.
- **Design headlines:** **reuses the digest narrative's pure core**
  (`redactForModel` + `buildNarrativePrompt`) rather than re-deriving the
  pseudonymization/prompt — one narrative core, two surfaces (cron email +
  on-demand Dashboard). **On-demand** (a button, cached per pattern-set) to bound
  cost and make egress explicit, like NL search; server-side `claude-haiku-4-5`;
  **opt-in per vendor via a new `vendor.aiInsights` flag** (separate from the
  digest and search flags); **additive** — the Patterns card is untouched and any
  failure just means no block. Names pseudonymized before egress; display-only,
  no writes.
- **Built (dark):** the shared `runNarrative` extraction (behavior-preserving —
  the digest's tests still pass), the pure `buildInsightSummary` +
  `aiInsightsEnabled` gate, the manager-gated `/api/pattern-narrative` route
  (redacts names server-side), and the "Explain these signals" button on the
  Patterns card (cached per pattern-set). Tests: `npm run test:insight`. Flag off
  ⇒ the Dashboard is unchanged.
- **Phase 2 (owner UX + disclosure):** the `vendor.aiInsights` toggle in Admin →
  Business settings (grouped with the digest + search toggles), the one-key
  `firestore.rules` allow-list entry, and the disclosures in `privacy-and-data.md`,
  the getting-started guide (§6 Optional AI helpers), and `app-summary-spec.md`.
- **Still open:** live model-call verification on a pilot (needs a real key +
  deploy); the rules change wants an emulator/staging check. Then features 4–5
  once the opt-in UX is proven.

## Competitive enhancement plan

From a competitor gap analysis + live-app UX review, adversarially re-checked
(full write-up in **`competitive-gap-analysis.md`**). The headline: DuoCount owns
a breadth no single competitor matches (cash + lottery + inventory + team +
trust), but the everyday **experience** and a few strategic gaps are what decide
adoption. Center of gravity is everyday usability + onboarding + import + exports
+ multi-store + i18n — **not** more AI.

### Tier 1 — quick wins (pure UI on existing reads; save the trial)
- **First-run onboarding + zero-config empty states — ✅ done** — a dismissible
  setup checklist (managers only) that tracks the two essentials (location +
  drawer) plus an optional inventory-items step and routes to Admin, backed by
  guiding EmptyState cards on the Cash / Scratch / Inventory tabs (manager → "Set
  up in Admin →"; employee → "ask your manager"). Pure derivation in
  `src/lib/setup-progress.js` (unit-tested); no schema or rules change; empty
  states only appear once the snapshots have loaded, so an existing store never
  flashes one. `SetupChecklist.js`, `EmptyState.js`, `AppShell.js`.
- **Everyday-usability bundle** — shipping in slices:
  - **Trustworthy saves — ✅ done** — every count form now disables **Save** until
    the required inputs are filled (pure `count-validation.js`, unit-tested) and
    turns a failed save into a *persistent, retryable* error bar instead of a
    vanishing toast (`useSaveState` + `SaveError`).
  - **Smart defaults — ✅ done** — each count form now opens on the location +
    drawer this person used last (remembered per vendor+user in `localStorage`)
    and guesses opening/closing from the time of day, so most counts start
    pre-filled. Pure `defaultShift` / `pickRemembered` (unit-tested); cash and
    scratch remember their own drawer so they don't cross-fill.
  - **Inventory fast-path — ✅ done** — the Inventory form leads with a single
    **Counted on hand** field and tucks start/received/sold/removed behind an
    optional **Movement details** expander (a dot flags it when filled), so an
    everyday recount is one number instead of five.
  - *Next slices:* mobile bottom nav; 44px scan targets + promoted power
    features.
- **Manager attention-badges** on Log / Incidents / Time from existing
  subscriptions.

### Tier 2 — strategic (spec'd; build after Tier 1)
- **Multi-store owner rollup** — `multi-store-rollup-spec.md`
- **CSV bulk import + migration** — `bulk-import-spec.md`
- **Accountant / franchise exports** — `accountant-export-spec.md`
- **Localization (Spanish-first) + low-literacy count path** — `localization-spec.md`
- **In-app notification center** (defer web push) — the real-time
  loss-prevention story at a fraction of push's complexity.

### Tier 3 — bigger bets, de-risk first
Offline write-queue reliability UX; solo-shift countersign fallback; buddy-punch +
OT/break compliance; and a POS e-journal / nightly-CSV import (the data spine that
makes void/refund analytics real).

### Explicitly deferred / reframed
OCR of paper lottery reports (accuracy risk launders a bad number through a
signature); self-logged voids (hollow without a POS feed); schedule↔shortage
auto-correlation (names a person → brand/legal risk). See the analysis for why.

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

## Audit follow-ups

From a full feature + security audit (each item verified against source; security
findings adversarially re-checked). Done items are folded into "Shipped" above;
what remains, ordered by priority:

### Security follow-ups
- ✅ **Manager→owner PIN-reset takeover** — the staff PATCH PIN-reset branch had no
  target-role guard, so a manager could reset an owner's PIN and sign in as owner.
  Fixed: only an owner may reset an owner's PIN (`src/app/api/staff/route.js`).
- ✅ **Stored XSS in report Print** — `printReport` interpolated raw entry fields
  (`sold`, `startQty`, `counted`, `diff`) that Firestore rules don't type-check.
  Fixed: those fields now go through `esc()` (`src/components/ReportModal.js`).
- ✅ **Session revocation on deactivate/demote (medium).** Privileged routes now
  verify with `checkRevoked` via a single shared `verifyBearer`
  (`src/lib/require-manager.js` — `requireManager`/`requireOwner`, adopted by the
  staff, schedule-publish, seed, and digest-test routes), and the staff route
  calls `adminAuth.revokeRefreshTokens(uid)` on deactivate/role-change. A revoked
  user is forced to re-authenticate, and login only matches `active==true` users,
  so a deactivated user can't get back in. **Verify against a live project /
  emulator** before relying on it (auth can't be exercised in this repo).
  Remaining slice (low): read rules still gate on token claims, not
  `liveActive()`, so client *reads* persist until the ID token expires (≤1h);
  revoked refresh means the client can't renew past that.
- ✅ **`CRON_SECRET` constant-time compare** — the digest cron now uses
  `crypto.timingSafeEqual` (`src/app/api/cron/digest/route.js`).
- ✅ **Manager self-resolve variance (fixed).** `investigate()` in
  `firestore.rules` now carries the same `byId != caller` self-check as
  `verifyOnly()`, so a manager can't clear their own flagged count; an independent
  reviewer still can. Covered by a new rules test — run `npm run test:rules`
  (Firestore emulator) to verify, as it can't run in the plain unit suite.
- ✅ **Spoofable client IP (fixed).** The login + signup rate limiters now derive
  the client IP via a shared, unit-tested `clientIp()` (`login-throttle.js`) that
  prefers the un-spoofable `x-real-ip`, else the rightmost `X-Forwarded-For` hop —
  not the attacker-controllable leftmost value.
- **Remaining low notes (defer):** the per-store attempt counter resets on any
  success (the 15-min sliding window mostly covers it); the signed-entry `ts` is
  client-set (server-pinning it means moving the cash-entry write server-side).

### Documentation & packaging
- ✅ **Doc-accuracy drift** — README called the shipped Reports feature "planned",
  mislabeled shipped roadmap items as "next", and cited a stale rules-test count
  (55→64); the reporting spec referenced a removed `buildReport`. All reconciled.
- ✅ **Guide diagrams (done; live-app screenshots still optional).** The
  getting-started guide now embeds three theme-adaptive SVG flow diagrams
  (`public/diagrams/`: daily flow, cash-count math, report flow), rendered and
  visually verified in headless Chromium. Real *photo* screenshots of the running
  app (sign-in, cash count, variance flag, report center) remain a nice-to-have
  and still need a live app + Firebase to capture.
- ✅ **Rejection-proof legal/compliance layer (drafted; owner review pending).**
  Added `LICENSE` (proprietary "all rights reserved" default — swap for
  MIT/Apache if you want a self-host template), `docs/privacy-and-data.md`
  (accurate to the app: Firebase storage, salted-hash PINs, no analytics/tracking,
  append-only retention), and `docs/legal-disclaimers.md` (non-affiliation with
  lotteries/brands, "not tax/legal advice", demo-data + no-warranty), surfaced
  under a new "Legal" section on `/docs`. **Still yours to do:** pick the license,
  fill in the real copyright holder + a contact point, and have a professional
  review the privacy notice for your jurisdiction (GDPR/CCPA/etc.). ~~Citations
  for the market claims in `positioning-one-pager.md` remain to be added.~~
  **Done:** every market claim now carries a numbered source (checked 2026-07)
  in a "Sources & claim notes" section — vendor-published figures are flagged as
  such, the NRF economy-wide context is cited alongside the lottery-specific
  vendor stats, and the competitor-price cells were corrected (LottoShield
  $79+/mo; FTx quote-based ~$89+ listings; Homebase Free–$100).
- ✅ **Static HTML marketing page (done).** `marketing/index.html` — a
  self-contained, theme-aware landing page (the recommended §2 build), with the
  hero flow diagram shipped alongside; rendered/verified desktop + mobile. Still
  deferred: the **WordPress** brochure path (§3a) and self-host-template polish
  (§4).
- ✅ **Theme-contrast CI guard (done).** `scripts/contrast-check.mjs` parses the
  live `globals.css` tokens and recomputes WCAG contrast for all 46 documented
  pairings in both themes; `tests/contrast.test.mjs` asserts they pass (and that a
  bad token is caught). Reproduces the hand-audited table exactly, so a token edit
  that fails AA now fails the suite. `npm run check:contrast` / `test:contrast`.

## Owner action list

Everything left that needs the owner — a decision, a credential, or a live
deployment — consolidated from the notes above. Nothing here is blocked on code.

1. **Pick the license + legal identity.** `LICENSE` is a conservative
   "all rights reserved" placeholder — choose the real license (keep proprietary,
   or MIT/Apache-2.0 for a self-host template per `distribution-analysis.md` §4),
   set the real copyright holder + contact, and delete the in-file NOTE.
2. **Professional privacy review.** `docs/privacy-and-data.md` and
   `docs/legal-disclaimers.md` are accurate to the app but drafted by a
   non-lawyer; have them reviewed for your jurisdiction (GDPR/CCPA/etc.).
3. **Verify the emulator-gated security changes on a live project** — run
   `npm run test:rules` (Firestore emulator) and exercise against staging:
   session revocation (`require-manager.js`), manager self-resolve block,
   `expectedConsistent()`, punch corrections, and the new payroll locks.
4. **Trademark / store clearance.** USPTO + app-store search for "DuoCount"
   (flagged pending in `positioning-one-pager.md`); register the launch domain
   (duocount.app / getduocount.com — duocount.com is squatted).
5. **Live-app photo screenshots** for the guides + marketing page (sign-in,
   cash count, variance flag, report center) — needs a deployed app with the
   demo seed loaded; the SVG diagrams cover docs until then.
6. **AI digest narrative — Phases 1 & 2 built (shipped dark).** To turn it on for
   a pilot: set `ANTHROPIC_API_KEY` on the deployment, then flip **"AI summary in
   the daily digest"** on in Admin → Business settings for that store and preview
   with the "Send test digest" button. It stays off for every other vendor. Left
   to do: confirm the live model call end-to-end on a real deployment, and have
   the `privacy-and-data.md` AI paragraph reviewed alongside the rest of the
   privacy notice.
7. **WordPress brochure path (optional, deferred)** — decide if the §3a
   brochure-site route in `distribution-analysis.md` is worth it once the
   marketing page has been live for a while.
8. **Re-verify competitor prices before printing anything** — the one-pager's
   price cells were checked 2026-07 and move fast (`positioning-one-pager.md`
   §Sources).

## Deferred (tier 3)

From `tier-two-build-spec.md` §7 — revisit on customer pull:

- **Time clock + payroll CSV + shift scheduling + rostering polish** — ✅ done
  (see Shipped; `time-clock-spec.md`): punches, payroll export, weekly roster,
  copy-last-week, week templates, employee availability, shift swaps, open-shift
  claim, publish/notify, and **manager punch correction** (append-only supersede).
- ✅ **Per-vendor pattern thresholds and extra detectors** — done (see Shipped),
  including the former remaining slice: the **escalating short-trend** (person)
  and **scratch settle-shortfall** detectors (`patterns.js` detectors 7–8).
- ✅ **Per-user login lockout + 6-digit PIN default** — done (see Shipped):
  6-digit PIN policy + a per-store failure limiter beside the per-IP one.
- ✅ **State-lottery settlement-file reconciliation** — done (see Shipped): a
  flexible CSV importer (map your columns — no fixed state format) that matches a
  settlement file against recorded scratch-off packs and flags discrepancies,
  unknown packs, and settled-but-unbilled packs. `lib/settlement.js` (unit-tested).
- ✅ **Server-enforced count baseline** — the tractable, high-value core of
  "server-computed blind counts", done via the rules rather than a server-side
  write path. `expectedConsistent()` in `firestore.rules` now requires the stored
  `expected` to equal its own components (cash: `start+sales−paidout`; inventory:
  `startQty+received−soldQty−removed`, ±0.01), closing a gap where a client could
  forge `expected` to net a real short to a clean diff. A pure test locks the
  client and rule formulas together (`tests/entry-consistency.test.mjs`); rules
  tests cover the forged-baseline rejection. **Honest residual (unchanged):** the
  *components* are still counter-entered — truly tamper-proof sales need a POS
  integration, and moving the whole write server-side stays deferred (partial
  value for the added complexity).
