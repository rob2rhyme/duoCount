---
title: DuoCount documentation
---

<p align="center">
  <img src="duocount-logo.png" alt="DuoCount logo" width="112" height="112" />
</p>
<p align="center">
  <span style="font-size:40px;font-weight:800;letter-spacing:-1.5px;color:#16305a;">Duo</span><span style="font-size:40px;font-weight:800;letter-spacing:-1.5px;color:#1f9d57;">Count</span>
</p>
<p align="center" style="font-size:13px;letter-spacing:2px;color:#6b7280;text-transform:uppercase;margin:4px 0 0;">
  All your counts. All in one place.
</p>
<p align="center" style="font-size:14px;color:#374151;margin-top:10px;">
  📦&nbsp; Inventory &nbsp;·&nbsp; 💵&nbsp; Store Cash &nbsp;·&nbsp; 🎟️&nbsp; Lottery Log
</p>

# DuoCount documentation

A multi-tenant Next.js + Tailwind + Firebase app for retail cash-drawer,
scratch-off, and inventory tracking. This site is the rendered `docs/` folder;
the code lives in the
[GitHub repository](https://github.com/rob2rhyme/duoCount).

## Start here

- **[Getting started](getting-started.md)** — 👋 new to DuoCount? A plain-language,
  step-by-step guide for owners and for employees. Start here.
- **[App summary](app-summary-spec.md)** — the whole product in plain English.
- **[Roadmap](roadmap.md)** — what's shipped, what's next, what's deferred. The
  living plan.
- **[Positioning](positioning-one-pager.md)** — market, competitors, pricing.

## Build specs

| Area | Spec |
| --- | --- |
| Tier one — blind counts, variance flags, disputes, shift notes, EOD report + digest | [tier-one-build-spec.md](tier-one-build-spec.md) |
| Tier two — incident write-ups, pattern alerts, login rate limiting | [tier-two-build-spec.md](tier-two-build-spec.md) |
| Inventory counts | [inventory-tracker-spec.md](inventory-tracker-spec.md) |
| Barcode scanning | [barcode-scanning-spec.md](barcode-scanning-spec.md) |
| Scratch-off pack lifecycle (retired → shift-boundary pack audit) | [lottery-pack-lifecycle-spec.md](lottery-pack-lifecycle-spec.md) |
| UI — currency counter, scroll-to-top FAB, light/dark theme, Settings menu | [ui-enhancements-spec.md](ui-enhancements-spec.md) |
| Demo data seed (owner-only load/clear) | [demo-data-spec.md](demo-data-spec.md) |
| Mobile-first PWA | [pwa-spec.md](pwa-spec.md) |
| Time clock & scheduling — punches, hours, payroll CSV, weekly roster | [time-clock-spec.md](time-clock-spec.md) |

## Analysis

- **[Distribution & AI integration](distribution-analysis.md)** — AI features on
  the Anthropic API, static-HTML / WordPress / other packaging paths, with
  effort, trade-offs, and recommendations.
- **[Theme & accessibility audit](theme-accessibility-audit.md)** — measured
  WCAG 2.1 AA contrast across both themes, the failures found, and the token
  fixes shipped.

---

*Rendered by GitHub Pages from the `docs/` folder on `main`.*
