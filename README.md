# DuoCount — Project Package

Every count, countersigned. Multi-vendor cash drawer, scratch-off, and
inventory tracking for retail teams.

## What's in this package

- `app/` — the working Next.js + Tailwind + Firebase application.
  Start with `app/README.md` for full setup and deployment instructions.
- `docs/` — product documentation:
  - `app-summary-spec.md` — plain-English overview of the whole product
  - `tier-one-build-spec.md` — spec for the tier-one trust features (now built)
  - `tier-two-build-spec.md` — spec for incidents, pattern alerts, and login
    rate limiting (now built)
  - `inventory-tracker-spec.md` — spec for the inventory feature (now built)
  - `barcode-scanning-spec.md` — spec for camera scanning (now built)
  - `lottery-pack-lifecycle-spec.md` — spec for pack tracking (now built)
  - `positioning-one-pager.md` — market positioning, competitors, pricing
- `print-forms/` — printable paper log PDFs (cash drawer + scratch-off),
  branded for Smokers Haven, useful as backup or during onboarding. The app
  also serves them from its footer (`app/public/forms/`).

## Status

The app in `app/` is built, compiles, and is deployable today (multi-vendor,
PIN auth with hashed PINs, locations, named drawers, verification, analytics
dashboard, CSV export, countersigned inventory counts per
`docs/inventory-tracker-spec.md`, and the tier-one trust features per
`docs/tier-one-build-spec.md`: blind counts, variance flags with cause codes,
dispute threads, shift notes, an end-of-day PDF report, and a daily email
digest (Vercel cron + Resend). Camera barcode scanning (items and
scratch packs, with last-count prefill) per `docs/barcode-scanning-spec.md`,
the scratch-off pack lifecycle (receive/activate/settle/return with
settle-time shrink snapshots) per `docs/lottery-pack-lifecycle-spec.md`, and
the tier-two features per `docs/tier-two-build-spec.md`: incident write-ups
with employee acknowledgment, pattern-detection alerts on the dashboard and
in the digest, and login rate limiting.

The full-catalog inventory application that previously lived in this repo
(products, expiry dates, suppliers, barcode scanning) is preserved in git
history at commit `0d9e7a1` for future porting.

## Name note

"DuoCount" passed a web conflict screen (no competing software found).
Before spending on branding: run a USPTO trademark search, check both app
stores, and register duocount.app / getduocount.com and social handles.
