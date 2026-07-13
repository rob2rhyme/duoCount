# DuoCount — static marketing page

A backend-less landing page for DuoCount — the "static HTML recreation" from
[`docs/distribution-analysis.md`](../docs/distribution-analysis.md) §2 (a
marketing/landing page, **not** a full static clone of the app).

- **`index.html`** — self-contained: inline CSS + inline SVG icons, no external
  requests, light/dark via `prefers-color-scheme`. Mirrors the app's brand
  (ink / paper / brass, the `DuoCount` wordmark, the "All your counts. All in one
  place." tagline).
- **`daily-flow.svg`** — the hero diagram, shipped alongside so the folder is
  portable on its own.

## Hosting

Drop `marketing/` on any static host (or open `index.html` directly). The CTAs
link to the live app at `/` and its docs at `/docs` and `/guide` — update those
`href`s to your deployed app URL when the marketing page lives on a different
domain.

Per the distribution analysis, keep this a marketing page pointed at a live
seeded demo rather than maintaining a parallel static clone of the app.
