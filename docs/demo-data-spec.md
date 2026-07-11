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
  locations, drawers, items, packs, notes, and incidents. A client seed could
  therefore never be *cleared*.
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
- **What's written** (`lib/seed-data.js`, ~40 docs): 2 locations, 4 drawers,
  3 tracked items, 3 scratch packs, 3 illustrative staff, ~21 counts over the
  last two weeks (cash + scratch + inventory; most balanced, a few over/short,
  one open flag, one resolved-with-cause, one disputed with a short thread, many
  manager-verified), 3 shift notes (one pinned), and 2 incidents.
- **Deterministic.** The generator is a pure function seeded with a fixed value,
  so the shape is reproducible (dates are relative to "now"). Unit-tested in
  `tests/seed.test.mjs` (`npm run test:seed`).

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
