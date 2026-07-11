# DuoCount — UI Enhancements Spec

**Status:** built — denomination currency counter, progressive scroll-to-top
FAB (toggleable per device), a full light/dark theme, and a header Preferences
menu shipped.

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
`muted`, `faint`, `gold`.

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
  in both themes.

---

## 4. Preferences menu

A gear in the app header opens a small **Preferences** popover — the home for
per-device display preferences (as opposed to Admin → Business settings, which
are the owner's shared business policy):

- **Appearance** — a Light / Dark segmented control (§3).
- **Scroll-to-top button** — an on/off switch for the FAB (§2.2).

Both preferences are personal and stored in `localStorage` (`PrefsProvider` for
the FAB, `ThemeProvider` for the theme), so they never touch the vendor record,
need no Firestore rules, and never change what another user sees. The popover
closes on outside-click or `Escape`. It's the natural place to add future
device-level preferences.
