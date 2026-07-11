# DuoCount — UI Enhancements Spec

**Status:** built — denomination currency counter, progressive scroll-to-top
FAB (toggleable per device), a full light/dark theme, a header Preferences
menu, a branded footer, mobile native-feel polish, empty states, sticky
dashboard table headers, and keyboard shortcuts shipped.

**Scope.** Three usability upgrades to the existing stack (Next.js App Router +
Tailwind), chosen for high polish-per-effort and zero data-model impact:

1. **Denomination currency counter** on the cash drawer count — tally the bills
   (and coins) physically in the drawer and have "Counted at close" total
   itself, instead of doing the arithmetic by hand.
2. **Progressive scroll-to-top FAB** — an app-wide floating button whose ring
   fills to show how far down the page you are, and returns you to the top.
3. **Light / dark theme** — a proper theme system with a persisted toggle that
   also follows the operating-system preference on first visit.

**Compatibility rule (same as prior tiers):** no schema changes. The counter
writes the same `counted` number it always did; the FAB and theme are pure
client UI. Nothing changes for existing entries, rules, or the digest.

---

## 1. Denomination currency counter

### 1.1 Why

Closing a drawer means counting stacks of bills. Staff were adding those up in
their heads (or on a phone calculator) and typing one number into "Counted at
close." That hand-arithmetic is exactly where a miscount becomes a false
over/short. Letting the app total the denominations removes that error source
and speeds up close.

### 1.2 Behavior

- On the **New drawer count** form (`CashForm`), a link under "Counted at
  close" toggles **🧮 Count cash by denomination**.
- When on, the manual amount field is replaced by a live total, and a panel
  appears with a row per US bill — **$100, $50, $20, $10, $5, $1** — each taking
  a count and showing its extended value (`denom × count`), plus a **Coins ($)**
  row for loose change so the total reflects the whole drawer.
- **Counter total** sums to `Σ(denom × count) + coins`. That total becomes the
  counted amount: it drives the **Expected / Over-short** readout live and is
  what gets saved as the entry's `counted` value.
- Toggling back to **Enter a single total instead** restores the plain number
  field. Saving an entry clears the counter (and the rest of the amount fields)
  for the next count.
- Works in **blind mode** too: you still tally denominations; only the
  comparison to expected stays hidden until the count is committed.

### 1.3 Non-goals

No per-denomination persistence — only the resulting total is stored, matching
the existing append-only entry shape. Coin denominations are entered as a single
dollar value rather than four more rows, to keep the close fast.

---

## 2. Progressive scroll-to-top FAB

### 2.1 Why

The log, dashboard, and admin screens get long on a phone. A one-tap return to
the top — with a visual read on scroll depth — is a small but constant
convenience.

### 2.2 Behavior

- `ScrollTopFab` is mounted once, app-wide, by `AppChrome`, so it floats over
  every screen (fixed, bottom-right).
- It **reveals** only after ~240px of scroll (fades/slides in), and hides again
  near the top — when hidden it is non-interactive and removed from the tab
  order (`tabIndex=-1`, `aria-hidden`).
- A circular SVG **progress ring** fills from 0→100% as
  `scrollTop / (scrollHeight − clientHeight)`, giving an at-a-glance sense of
  position. Scroll handling is `requestAnimationFrame`-throttled and cleaned up
  on unmount.
- Clicking scrolls smoothly to the top, or jumps instantly when the user has
  **reduced-motion** enabled.
- Sits at `z-40`, below modals (`z-50`), so it never covers a dialog's controls.
- **Configurable per device.** Each user can turn the FAB off in the header
  **Preferences** menu (§4); the choice persists in `localStorage`
  (`duocount-fab`) and, while off, the component renders nothing and attaches no
  scroll listeners. It's a personal preference, not a business setting — one
  person hiding it never changes what a coworker sees.

---

## 3. Light / dark theme

### 3.1 Approach

Every surface, border, and text color resolves through a **CSS variable**, so
flipping a single `.dark` class on `<html>` re-themes the whole product. Fixed
brand colors (`ink`, `paper`, `brass`) stay constant; theme-aware tokens live in
`globals.css` and are exposed as Tailwind utilities via the config:

`surface`, `panel`, `subtle`, `field`, `line` / `line-soft`, `highlight`, `fg`,
`muted`, `faint`, `gold`, and the status-text pair `pos` / `neg` (theme-aware
over/short + error text — added in the accessibility audit so those numbers stay
AA-legible on the dark surface). See `theme-accessibility-audit.md`.

### 3.2 Behavior

- **First visit** follows the OS `prefers-color-scheme`. Once the user picks a
  theme with the toggle, that choice is persisted (`localStorage`,
  key `duocount-theme`) and wins over the OS from then on.
- A tiny **no-flash boot script** (`THEME_BOOT_SCRIPT`) runs in `<head>` before
  first paint, so there is no light→dark flicker on load.
- The theme lives in the header **Preferences** menu (§4) inside the app, and
  as a quick **sun/moon toggle** on the login card. `ThemeProvider` also keeps
  `color-scheme` in sync so native controls (selects, date pickers, scrollbars)
  match the theme.

### 3.3 What intentionally stays fixed

- The **app header, toast, role badges, and logo matte** keep their dark-chrome
  / brand colors in both themes by design.
- **PDF and print** output (`ReportModal`) and the **email digest**
  (`lib/digest.js`) keep fixed light colors — paper and email are always light.
- **Recharts** colors are resolved per-theme in JS (Recharts paints literal SVG
  color strings, so CSS variables aren't reliable there).
- Semantic **status chips** (short/over/watch: red/green/amber) keep their hue
  in both themes (light pills on either background — internal contrast passes AA;
  the red chip's text is `red-700` for that reason). **Inline** status *text*
  (over/short numbers, verify line, errors) instead uses the theme-aware
  `pos` / `neg` tokens so it stays legible on the dark surface — see
  `theme-accessibility-audit.md`.

---

## 4. Settings menu

A single gear in the app header opens the **Settings** popover — the home for
per-device display preferences (as opposed to Admin → Business settings, which
are the owner's shared business policy), plus the account's Sign out:

- **Appearance** — a Light / Dark segmented control (§3).
- **Scroll-to-top button** — an on/off switch for the FAB (§2.2).
- **Install app** — the PWA install prompt, shown only when the browser offers
  it (see `pwa-spec.md`).
- **Sign out** — a power-off action at the bottom of the menu (`onSignOut` prop,
  supplied by `AppShell`). Consolidating it here means the header is one control,
  not a gear plus a separate text link — cleaner on small screens, with a proper
  tap target.

The header **user pill** shows **first-name only below `sm`** and the full name
at ≥`sm` (two responsive spans), so on a narrow phone the name stops truncating
to a couple of letters while the store name keeps width priority.

The two display preferences are personal and stored in `localStorage`
(`PrefsProvider` for the FAB, `ThemeProvider` for the theme), so they never touch
the vendor record, need no Firestore rules, and never change what another user
sees. The popover closes on outside-click or `Escape`. It's the natural place to
add future device-level preferences.

---

## 5. Footer

The app footer (`AppShell`) is theme-aware and reads as a proper product
footer rather than two stray links:

- The **brand mark** (the brass ₵) and wordmark **DuoCount** with the tagline
  *"Every count, countersigned."*
- The **paper backup forms** (cash-drawer and scratch-off logs) as pill-shaped
  ghost chips with a document glyph — a hover-brass border, not bare underlines.
- A **top divider** (`border-line-soft`) separating it from the content, and a
  closing line *"Built for the register · Works offline."*
- `pb-safe` so it clears the home indicator when installed (see `pwa-spec.md`).

## 6. Mobile native-feel

A small set of CSS behaviors in `globals.css` make the installed app read as
native — most importantly, **text entry no longer zooms the page** on iOS
(compact fields lift to 16 px on touch devices, without disabling pinch-zoom).
The full list — tap-flash, overscroll, text-inflation, double-tap delay, and
long-press callout — is documented in `pwa-spec.md` → **Native-app feel**.

---

## 7. Empty states

A first-run or filtered-empty screen should read as intentional, not broken. A
shared `EmptyState` component (`components/EmptyState.js`) renders a soft,
theme-aware icon badge, a title, a supporting line, and an optional call-to-action
button, with inline line-icon glyphs (receipt / note / shield / chart).

- **Log** — distinguishes the two empty cases: *no counts logged yet* (purely
  informational) vs *no entries match these filters* (with a **Clear filters**
  action that resets type/status/person/drawer).
- **Notes** — *No notes yet* with a **Write a note** action that focuses the
  composer (a `ref` on the textarea).
- **Incidents** — managers get *No incidents on file* with a **File an incident**
  action that focuses the write-up title; employees get a plain *Nothing on file*.
- **Dashboard** — *No activity yet* with a **Record a count** action that jumps to
  the Cash tab (`onRecord` prop, wired in `AppShell`).

---

## 8. Sticky dashboard table headers

The Dashboard **by-drawer / by-item / by-employee** tables can get long. Each
table body is now a **bounded scroll region** (`overflow-auto max-h-[26rem]`)
with a `sticky top-0` `thead`, so the column labels stay visible while you
scroll a long list. The header cells carry the card's `bg-surface` (so rows
don't bleed through) and a 1 px inset bottom shadow as a divider. Bounding the
height is what makes `sticky` work here — a `position: sticky` header only pins
against a scroll container, and the table now *is* one; short tables don't scroll
and look unchanged. Horizontal scroll on narrow screens still works.

## 9. Keyboard shortcuts

Desktop power-user shortcuts, mounted app-wide in `AppShell`:

| Keys | Action |
| --- | --- |
| `1`–`8` | Jump straight to a tab (only the tabs the role can see) |
| `[` / `]` | Previous / next tab (wraps) |
| `⌘/Ctrl` + `Enter` | Save the visible form (clicks the primary button) |
| `?` | Toggle a shortcuts sheet |
| `Esc` | Close the sheet |

Discoverability: a *"Press `?` for keyboard shortcuts"* hint sits in the footer
on `sm`+ screens (hidden on touch, where there's no keyboard). Every shortcut
except the save combo is **suppressed while typing** in an input/textarea/select,
so keys never eat form input; the save combo works from inside a field (compose,
then `⌘/Ctrl`+`Enter`). The decision logic is a pure function
(`lib/shortcuts.js` → `resolveShortcut`) with a unit-test suite
(`tests/shortcuts.test.mjs`, `npm run test:shortcuts`); the effect in `AppShell`
only maps the returned action to `setTab` / help state / a button click.
