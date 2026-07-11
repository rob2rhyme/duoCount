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

## Next up

Ordered roughly by value-per-effort. Each item lists acceptance criteria so it
can be picked up cleanly.

### 1. Demo data seed
Let anyone experience a populated app in seconds (marketplace demos, screenshots,
onboarding, manual QA of the dashboard/patterns/reports).
- **Acceptance:** an owner-only "Load sample data" action seeds the *signed-in*
  vendor with realistic locations, drawers, staff, and ~2–4 weeks of cash /
  scratch / inventory entries (some balanced, some short/over, a few flagged and
  disputed, some verified) — written through the client SDK so it respects the
  security rules, with no service-account key required. A matching "Clear sample
  data" removes only seeded records. Deterministic (seedable) so screenshots are
  stable. Never runs automatically.
- **Notes:** keep seed volume modest (Firestore write costs); tag seeded docs
  (e.g. `seed: true`) so cleanup is exact.

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

### 5. Distribution / versioning analysis
Decide how DuoCount reaches more buyers beyond the hosted Next.js app.
- **Acceptance:** a written analysis (`docs/distribution-analysis.md`) covering:
  (a) **AI integration** — where an LLM adds real value (e.g. natural-language
  log search, variance-explanation drafting, digest summarization, anomaly
  narratives) and how it'd be built on the Anthropic API, with cost/privacy
  notes; (b) a **static HTML** recreation (marketing/demo build with no backend);
  (c) a **WordPress** version/plugin path; (d) other packagings (Envato/
  ThemeForest, native shell). Each with effort, trade-offs, and a recommendation.
  Analysis only — no build in this item.

### 6. Mobile-first PWA
Make the installable app feel native on a phone.
- **Acceptance:** audit and complete the PWA basics — `manifest.json` (icons,
  name, theme/background color that follow the theme, display `standalone`,
  orientation), maskable icons, iOS meta tags, an offline-friendly service
  worker (at least an app-shell/offline fallback), install prompt handling, and
  safe-area / touch-target polish. Verify with Lighthouse PWA + mobile audits.

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
- **Header identity on tiny screens** — the user name still truncates hard;
  consider first-name-only, or consolidating Sign out into the gear as an
  account menu to reclaim width.
- **Sticky headers** on the Dashboard by-drawer / by-item / by-employee tables
  so column labels stay visible while scrolling long lists.
- **Empty-state polish** — light illustrations / clearer CTAs on the empty Log,
  Notes, Incidents, and Dashboard states.
- **Bigger tap target** for the header "Sign out" text link.
- **Keyboard shortcuts** for power users (tab switching, save).

## Deferred (tier 3)

From `tier-two-build-spec.md` §7 — revisit on customer pull:

- Scheduling / time-clock / payroll exports (separate product surface).
- Per-vendor pattern thresholds and extra detectors.
- Per-user login lockout + 6-digit PIN default (deeper brute-force hardening).
- Server-computed blind counts.
- State-lottery settlement-file reconciliation.
