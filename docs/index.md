---
title: DuoCount documentation
---

# DuoCount documentation

Every count, countersigned. A multi-tenant Next.js + Tailwind + Firebase app for
retail cash-drawer, scratch-off, and inventory tracking. This site is the
rendered `docs/` folder; the code lives in the
[GitHub repository](https://github.com/rob2rhyme/sh-stock-tracking).

## Start here

- **[Roadmap](roadmap.md)** — what's shipped, what's next, what's deferred. The
  living plan.
- **[App summary](app-summary-spec.md)** — the whole product in plain English.
- **[Positioning](positioning-one-pager.md)** — market, competitors, pricing.

## Build specs

| Area | Spec |
| --- | --- |
| Tier one — blind counts, variance flags, disputes, shift notes, EOD report + digest | [tier-one-build-spec.md](tier-one-build-spec.md) |
| Tier two — incident write-ups, pattern alerts, login rate limiting | [tier-two-build-spec.md](tier-two-build-spec.md) |
| Inventory counts | [inventory-tracker-spec.md](inventory-tracker-spec.md) |
| Barcode scanning | [barcode-scanning-spec.md](barcode-scanning-spec.md) |
| Scratch-off pack lifecycle | [lottery-pack-lifecycle-spec.md](lottery-pack-lifecycle-spec.md) |
| UI — currency counter, scroll-to-top FAB, light/dark theme, Settings menu | [ui-enhancements-spec.md](ui-enhancements-spec.md) |
| Demo data seed (owner-only load/clear) | [demo-data-spec.md](demo-data-spec.md) |
| Mobile-first PWA | [pwa-spec.md](pwa-spec.md) |

## Analysis

- **[Distribution & AI integration](distribution-analysis.md)** — AI features on
  the Anthropic API, static-HTML / WordPress / other packaging paths, with
  effort, trade-offs, and recommendations.

---

*Rendered by GitHub Pages from the `docs/` folder on `main`.*
