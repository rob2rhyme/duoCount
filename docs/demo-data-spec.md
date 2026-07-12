# DuoCount — Demo Data Spec

**Status:** built — owner-only **Load / Clear sample data** in Admin.

**Goal.** Let anyone see a fully populated app in one tap — a busy Log, a
Dashboard with charts and pattern alerts, exportable reports, notes, and
incidents — for demos, screenshots, onboarding, and manual QA, without hand-
entering weeks of counts.

## Why it's server-side

The obvious approach — write sample data from the browser with the client SDK —
can't work under DuoCount's trust rules, and that's by design:

- **Append-only.** `firestore.rules` sets `allow delete: if false` on entries,
  locations, drawers, items, packs, notes, incidents, and time-clock punches. A
  client seed could therefore never be *cleared*.
- **Signed authorship.** Entry creates require `by == token.name` and
  `byId == token.userId`, so a client could only ever attribute counts to the
  one signed-in user — no multi-staff variety, and no manager-verified rows
  (self-verification is blocked).

So the seed runs through a server route (`/api/seed`) using the **Admin SDK** —
the same trusted path `signup`, `staff`, and `digest` already use. The server
legitimately bypasses the client rules (it's trusted infrastructure), which lets
it attribute counts to several staff, pre-verify some, pre-resolve a flag, and —
crucially — **delete** the sample data later. It never weakens the client rules,
and it only ever writes or deletes `seed`-tagged documents, so real counts are
untouched.

## Behavior

- **Admin → Demo data** (owner only). Two actions, both confirmed:
  - **Load sample data** — writes the sample set into the signed-in vendor.
    Idempotent: it clears any prior sample set first, so re-loading never stacks.
  - **Clear sample data** — deletes only `seed:true` docs (and their comment
    threads); returns a count.
- **What's written** (`src/lib/seed-data.js`, ~400 docs by default) — every tab
  is populated with a realistic history:
  - 2 locations, 4 drawers, 4 tracked items, 4 illustrative staff.
  - **~4 months** of counts (~260: daily POS closes plus periodic lottery-drawer,
    kiosk, scratch, and inventory counts; most balanced, a realistic scatter of
    over/short, open flags, several resolved-with-cause, a live dispute thread,
    and many manager-verified) — spanning **both locations** so per-drawer and
    per-location breakdowns have data.
  - 6 scratch packs across the whole lifecycle — received, active, and several
    **settled** over time (e.g. $3 × 44 = $132 recorded) so the settlement-
    reconciliation tool has figures to match an uploaded CSV against.
  - 7 shift notes (some pinned) and 5 incidents (open / acknowledged / closed).
  - **Time clock:** ~3 weeks of in/out punches for two staff (with one no-show
    that mirrors the incident), plus one person currently on the clock.
  - **Schedule:** three weeks of roster (current + two prior) with an open shift
    to grab and a swap in flight (one offered, one claimed), two saved templates,
    availability entries, and published-week records.
- **Configurable window.** `buildDemoData({ days })` controls how much history is
  generated (default 120). Bump it — e.g. `node scripts/gen-demo-seed.mjs
  --days=400` — to populate longer report periods like semi-annual / annual.
- **Deterministic.** The generator is a pure function seeded with a fixed value,
  so the shape is reproducible given `now` + `days`. Unit-tested in
  `tests/seed.test.mjs` (`npm run test:seed`). The write path commits in chunked
  batches, so it stays under Firestore's 500-op limit at any window size.

## Importable file (outside the app)

For seeding without the in-app button — a scripted setup, a fresh demo vendor,
or inspection — the same builder produces a portable file:

- `node scripts/gen-demo-seed.mjs [--now=YYYY-MM-DD] [--out=demo-seed.json]`
  writes **`demo-seed.json`**: the full dataset keyed by collection (entry comment
  threads nested), with dates tagged `{ "__ts__": ISO }`. Committed at the repo
  root so it's ready to inspect or import; regenerate to refresh the dates.
- `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node
  scripts/import-demo-seed.mjs <vendorId> [demo-seed.json]` writes it into
  `vendors/<vendorId>/…` via the Admin SDK, tagging every doc `seed: true` — so
  the same owner-only **Clear demo data** removes exactly what it imported.
  (Service-account keys are git-ignored.)

## Guardrails

- **Owner-only**, scoped to the caller's own vendor (verified from the ID-token
  claims), like every other privileged route.
- **Tagged, so clearable.** Every seeded doc carries `seed: true`; clear filters
  on exactly that. Real entries never have it.
- **Honest about permanence.** The Admin card states that sample entries land in
  the permanent, append-only log like any real count — so it's meant for a demo
  or test store, not a live one. (Clear removes them via the trusted server
  path, but the point stands: don't seed a store whose books must stay clean.)
- **Demo staff are illustrative** — created as user records for authorship and
  the staff list, but without sign-in credentials. Add real staff normally.

## Not in scope

- Requiring or bundling a service-account key beyond what the app already needs
  (the deployed app's `FIREBASE_SERVICE_ACCOUNT_KEY`, same as auth/digest).
- Seeding across multiple vendors, or any automatic/scheduled seeding.
