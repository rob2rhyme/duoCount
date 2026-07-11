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
- **Native-app feel** (`globals.css`): mobile chrome that makes a web app read
  as native —
  - **No focus-zoom on text entry.** iOS Safari zooms the whole page when a
    focused field's font resolves under 16 px. The compact controls
    (`.input.text-sm`, `.input.text-[13px]` — the small selects, log filters and
    the incident textarea) are lifted to 16 px **only on touch devices**
    (`@media (pointer: coarse)`), so tapping into a field never zooms. This is
    done *without* `maximum-scale=1`, so pinch-zoom stays available for
    accessibility. The large PIN inputs (`text-2xl`) keep their size.
  - **No tap flash / double-tap delay** (`-webkit-tap-highlight-color:
    transparent`, `touch-action: manipulation` on buttons/links/selects).
  - **No rubber-band overscroll** (`overscroll-behavior: none`) so the standalone
    app doesn't pull-to-refresh or bounce like a web page.
  - **No text auto-inflation on rotate** (`text-size-adjust: 100%`).
  - Interactive chrome opts out of long-press selection + the iOS callout
    (`user-select: none`, `-webkit-touch-callout: none`); body text and amounts
    stay selectable so codes can still be copied.
- **Footer** (`components/AppShell.js`): a theme-aware footer with the brand mark
  and tagline ("Every count, countersigned"), the paper backup forms as
  pill-shaped ghost chips, a top divider, and `pb-safe` so it clears the home
  indicator in standalone mode.

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
- **No focus-zoom:** under touch emulation (`pointer: coarse`) the compact
  `.input.text-sm` / `.input.text-[13px]` fields compute to 16 px in both themes
  while the PIN input stays at 24 px — asserted against the real compiled CSS.

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
