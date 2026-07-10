# DuoCount — Project Package

Every count, countersigned. Multi-vendor cash drawer, scratch-off, and (planned)
inventory tracking for retail teams.

## What's in this package

- `app/` — the working Next.js + Tailwind + Firebase application.
  Start with `app/README.md` for full setup and deployment instructions.
- `docs/` — product documentation:
  - `app-summary-spec.md` — plain-English overview of the whole product
  - `tier-one-build-spec.md` — detailed spec for the next build phase
    (blind counts, variance flags, disputes, shift notes, EOD PDF, email digest)
  - `inventory-tracker-spec.md` — spec for the inventory feature (build after tier one)
  - `positioning-one-pager.md` — market positioning, competitors, pricing
- `print-forms/` — printable paper log PDFs (cash drawer + scratch-off),
  branded for Smokers Haven, useful as backup or during onboarding.

## Status

The app in `app/` is built, compiles, and is deployable today (multi-vendor,
PIN auth with hashed PINs, locations, named drawers, verification, analytics
dashboard, CSV export). Tier one and inventory are specified but not yet coded.

## Name note

"DuoCount" passed a web conflict screen (no competing software found).
Before spending on branding: run a USPTO trademark search, check both app
stores, and register duocount.app / getduocount.com and social handles.
