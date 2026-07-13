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
  review the privacy notice for your jurisdiction (GDPR/CCPA/etc.). Citations for
  the market claims in `positioning-one-pager.md` remain to be added.
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
