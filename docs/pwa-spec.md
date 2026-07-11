# DuoCount — Mobile-First PWA Spec

**Status:** built — DuoCount installs to a phone home screen and launches
standalone, with an offline app shell.

**Goal.** The people using DuoCount are behind a register on a phone. Make it
feel like a native app: installable, full-screen, notch-aware, and resilient to
a dropped connection.

## What's included

- **Installable manifest** (`public/manifest.json`): `id` / `scope` / `start_url`
  `/`, `display: standalone` (with `minimal-ui` fallback), `orientation: any`,
  brand `theme_color` / `background_color`, categories, and a full icon set —
  64 / 192 / 512 **any** plus 192 / 512 **maskable** (the mark padded on the
  brand ink so adaptive-icon masks never crop it). Icons are generated from
  `public/logo.png` (see the build note below).
- **Service worker** (`public/sw.js`, registered in production by
  `components/PWA.js`): caches the app shell on install; **network-first** for
  page navigations (fresh app, falls back to the cached shell, then a branded
  **`offline.html`**); **cache-first** for hashed static assets. It only ever
  touches same-origin GETs, so Firebase (Firestore / Auth) and this app's
  `/api/` routes always hit the network and are never served stale.
- **iOS / standalone meta** (`app/layout.js`): `apple-mobile-web-app-capable`,
  a black-translucent status bar, an `apple-touch-icon`, `applicationName`, and
  `viewport-fit: cover` so safe-area insets resolve.
- **Safe-area insets** (`globals.css` utilities `pt-safe` / `px-safe` /
  `bottom-safe`): the sticky header pads under the notch/status bar and the
  scroll-to-top FAB clears the home indicator. Off-device the `env()` values are
  0, so nothing changes on desktop.
- **Install prompt** (`lib/install.js`): the browser's `beforeinstallprompt` is
  captured (not shown as the default infobar) and surfaced as an **Install app**
  action in the header Preferences menu, shown only when the browser offers it
  and hidden once installed.

## Verification

Against a production build (`next start`), driven by Playwright:

- Manifest is linked; apple-web-app + `viewport-fit=cover` meta present; icons
  include 192 + maskable.
- Service worker reaches **active** and controls the page.
- **Offline app shell:** reloading `/` with the network cut still renders the
  app from cache.
- **Offline fallback:** navigating to an uncached path offline serves
  `offline.html` (HTTP 200, branded "You're offline") rather than the browser
  error.

## Build note (icons)

The maskable and sized icons are generated from `public/logo.png` with `sharp`;
the committed PNGs are the source of truth. If the logo changes, regenerate
`icon-{192,512}.png` and `icon-maskable-{192,512}.png` (192/512 `any`, and the
mark at ~66% centered on `#1a1c2e` for the maskable pair).

## Not in scope (backlog)

- Background sync / offline write queue for counts (Firestore already retries
  transient drops; a durable offline-compose queue is a larger effort).
- Push notifications.
- Per-theme splash background (the manifest `background_color` is static).
