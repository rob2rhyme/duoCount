# DuoCount — Project Package

Every count, countersigned. Multi-vendor cash drawer, scratch-off, and
inventory tracking for retail teams.

## What's in this package

- `app/` — the working Next.js + Tailwind + Firebase application.
  Start with `app/README.md` for full setup and deployment instructions.
- `docs/` — product documentation:
  - `app-summary-spec.md` — plain-English overview of the whole product
  - `tier-one-build-spec.md` — detailed spec for the next build phase
    (blind counts, variance flags, disputes, shift notes, EOD PDF, email digest)
  - `inventory-tracker-spec.md` — spec for the inventory feature (now built)
  - `positioning-one-pager.md` — market positioning, competitors, pricing
- `print-forms/` — printable paper log PDFs (cash drawer + scratch-off),
  branded for Smokers Haven, useful as backup or during onboarding.

## Status

The app in `app/` is built, compiles, and is deployable today (multi-vendor,
PIN auth with hashed PINs, locations, named drawers, verification, analytics
dashboard, CSV export, and countersigned inventory counts per
`docs/inventory-tracker-spec.md`). Tier one is specified but not yet coded.

The full-catalog inventory application that previously lived in this repo
(products, expiry dates, suppliers, barcode scanning) is preserved in git
history at commit `0d9e7a1` for future porting.

## Name note

"DuoCount" passed a web conflict screen (no competing software found).
Before spending on branding: run a USPTO trademark search, check both app
stores, and register duocount.app / getduocount.com and social handles.
