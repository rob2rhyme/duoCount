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
| **Mobile layout audit + polish** (all 8 screens, both themes, 390px) | this file, §"Layout audit" | ✅ |
| **Demo data seed** (owner-only load/clear of tagged sample data) | `demo-data-spec.md` | ✅ |
| **Mobile-first PWA** (installable, offline app shell, safe-area, install prompt) | `pwa-spec.md` | ✅ |
| **Distribution / AI-integration analysis** | `distribution-analysis.md` | ✅ |

## Next up

Ordered roughly by value-per-effort. Each item lists acceptance criteria so it
can be picked up cleanly.

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

### 2. Theme-requirements audit
Confirm the light/dark system is complete and accessible everywhere.
- **Acceptance:** every screen and both themes pass a contrast check (WCAG AA for
  text); no fixed-color element is unreadable in either theme; native controls,
  focus rings, disabled states, and status chips are all verified; a short
  checklist is recorded here. (Partially done: build + Playwright both-theme
  screenshots + adversarial review already ran for the shipped UI.)

### 3. Documentation-accuracy pass
Keep docs true to the code as features land.
- **Acceptance:** README, `app-summary-spec.md`, and each `*-spec.md` are
  reconciled against the current source (file/paths, field names, behavior);
  drift is fixed; this roadmap's "Shipped" table matches reality. Run at the end
  of each feature. (Partially done for the UI features this cycle.)

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

All eight screens (Cash, Scratch-offs, Inventory, Log, Notes, Incidents,
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
- **Header identity on tiny screens** — the user name still truncates hard;
  consider first-name-only for the pill.
- **Sticky headers** on the Dashboard by-drawer / by-item / by-employee tables
  so column labels stay visible while scrolling long lists.
- **Empty-state polish** — light illustrations / clearer CTAs on the empty Log,
  Notes, Incidents, and Dashboard states.
- **Keyboard shortcuts** for power users (tab switching, save).

## Deferred (tier 3)

From `tier-two-build-spec.md` §7 — revisit on customer pull:

- Scheduling / time-clock / payroll exports (separate product surface).
- Per-vendor pattern thresholds and extra detectors.
- Per-user login lockout + 6-digit PIN default (deeper brute-force hardening).
- Server-computed blind counts.
- State-lottery settlement-file reconciliation.
