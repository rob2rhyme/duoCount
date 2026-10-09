# DuoCount — signed-in screens audit

Date: 2026-09-30 · Commit audited: `9c381a7` · Build: `npm run start:emulator` (production build)
Tooling: Playwright (Chromium 1194) driving the real app, axe-core 4.13.0, Resource Timing API.

Companion to `ops/qa-ux-audit-2026.md`, which covered the 10 public routes. That audit had to
file every authenticated screen as "not executed". The emulator wiring (#259) closed that gap,
so this pass covers the half of the product where the work actually happens.

---

## 0. Method, and what it does and does not cover

**Store under test.** Registered through the app's own signup form, then loaded the owner-only
demo set via `/api/seed` with the real signed-in session token — the same call the Admin →
More → "Load sample data" button makes. That gave a realistic store rather than an empty one:

> 4 staff · 2 locations · 4 drawers · 4 items · **259 entries** · 7 notes · 5 incidents ·
> 71 timeclock records · 28 schedule rows · 3 published weeks

Screens with tables, filters and history therefore had real content to render, which is where
most of the findings below come from. An empty store would have shown "No activity yet" and
hidden all of them.

**Screens covered (12).** The mobile IA is a bottom nav of four tabs, three of which open a
sheet of destinations:

| Tab | Destinations |
| --- | --- |
| Count | Cash · Scratch-offs · Backroom · Rewards |
| Team | Time · Incidents · Notes |
| Insights | Dashboard · Scratch report · Portfolio · Log |
| Admin | (direct; sub-tabs Store · Modules · Settings · Rewards · More) |

Each was driven at 390px, scanned with axe in light **and** dark, and measured for overflow,
landmarks, heading order and tap-target size. Selected screens were re-measured at 320/360/430px.

**Not covered.** Still Chromium-only and still no Lighthouse. Beyond that:

| Area | Status | Why |
| --- | --- | --- |
| Employee and manager roles | **NOT executed** | Everything here is the **owner** view. Role-gated screens may differ, and `staffScope` / `sharingMode` settings change what staff see. |
| Destructive and mutating flows | **NOT executed** | No counts logged, nothing verified, disabled, deleted or exported. This is a read/render audit; write paths are their own pass. |
| Modals and sheets past first open | **Partially** | The Count/Team/Insights sheets were opened and traversed; ReportModal, scan and CSV-import dialogs were not. |
| Rewards register flow | **NOT executed** | The Rewards *screen* renders; enrolling a customer and redeeming points was not exercised. |

---

## 1. Bug table

| ID | Severity | Screen / element | Steps to reproduce | Expected | Actual | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| **S1** ✅ | High | Dashboard — "CASH SALES LOGGED" stat (`.card p-4`) | Sign in to a store with 6-figure cash sales, view Dashboard at ≤390px | The figure reads in full | Rendered **`$93,607.0`** — the last digit cut at the card edge. Box 104px, content 145px: 41px over at 320px, 6px at 390px. **Fixed** — `statValueClass` sizes the number from its character count against measured per-size capacities, so the tile that happens to hold a long value shrinks rather than truncating. Re-measured across 12 tiles at 320/360/390/430: **zero overflowing, zero page overflow**, and `$93,607.00` fits exactly at every width (16px at 320, 20px at 430). The Gaming tab had the same latent bug and uses the same ramp capped at its own `text-xl`. | Done |
| **S2** | High | Log — all five filter `<select>`s; also Dashboard (1) and Scratch report (1) | Run axe on the Log | Each filter has an accessible name | **7 unlabelled selects**, axe `select-name` **critical**. The Log's five are *All locations*, *All entries*, *Any status*, *Everyone*, *All drawers* — a screen-reader user hears five unnamed combo boxes on the product's audit trail and must infer each from its current value | Wrap in the existing `<Field>` (as `AdminPanel.js:888/901/925` already do) or add `aria-label`. `AdminPanel` wires some selects and not others — worth a sweep |
| **S3** | High | Portfolio — "Store leaderboard" and "People across stores"; Scratch report — pack table; Dashboard — drawer table | View at 390px, try to reach the right-hand columns with a keyboard | Columns reachable by touch and keyboard | Tables sit in `.overflow-x-auto` with **240px of 596px hidden** (Portfolio leaderboard), 233px (People), 210px (Scratch report), 33px (Dashboard). Every container reports `tabIndex = -1`, so **keyboard users cannot scroll them at all**. axe `scrollable-region-focusable` (serious) flags 3 of them. The header clips mid-word ("O/S RATI…") with no scroll affordance | Add `tabindex="0"` + an accessible name to each scroller (fixes the axe rule and keyboard access), and a visible edge affordance. Longer term, a stacked card layout below ~430px |
| **S4** | Medium | Every signed-in screen — count badge (`BottomNav.js:91`, `BottomNav.js:113`, `AppShell.js:360`) | Run axe on any signed-in screen, either theme | ≥ 4.5:1 | **3.99:1** — white on `bg-alert` `#ff0000`, 9px/10px bold. Fails in **both** light and dark, because `alert` is a hardcoded hex in `tailwind.config.js:17`, not a themed token. Appears on all 12 screens | Darken to `#ee0000` (4.53:1) or `#d70000` (5.40:1). Both stay unmistakably "alert red"; `#d70000` leaves headroom |
| **S5** | Medium | Admin, Log, Time, Notes — action buttons | Measure any row-action button at 390px | ≥ 44px | Systematically **40–43px — one root cause, not 58 separate bugs**. Admin: 18× "Disable" (88×42), 5× "Reset PIN" (105×42), 5× "Set email" (103×42), 4× "Edit" (63×42). Log: 20× comment (64×42), 7× "Verify count" (123×42). Time: 10× "Correct" (88×42). Notes: 7× "Archive" (85×40), 5× "Pin" (55×40) | One change to the small-button padding in `globals.css` clears almost all of it — these are 1–4px short, not badly sized |
| **S6** ✅ | Medium | Admin — sub-tab chip row ("Store · Modules · Settings · Rewards · More") | At 390px, try to reach "More" | All sub-tabs reachable | The row was `overflow-x-auto` with no affordance. Measured: **79px hidden at 390px and 430px with "More" off-screen; 149px at 320–360px with "Rewards" off-screen too**. "More" holds Support and Demo data. **Fixed** — the row now wraps (`flex-wrap`): 0px hidden and 5/5 chips reachable at 320/360/390/430, still one row at ≥520px. *Correction: the original entry cited a `scrollIntoViewIfNeeded` timeout as evidence. That timeout was a selector bug of mine — the chips are `role="tab"`, so `getByRole("button")` never matched them at any width. The finding stands on the geometry above, which is selector-independent.* | Done |
| **S7** | Medium | Time, Scratch report — period chips | Measure at 390px | ≥ 44px | **28px tall**: "7 days"/"14 days" (Time), "30 days"/"90 days"/"This month"/"This year" (Scratch report). Same pattern the public audit filed as B7 on `/guide` | Shared fix with B7 — raise chip padding |
| **S8** | Medium | Portfolio — sortable column headers | Try to sort by tapping a header at 390px | Comfortable target | **17px tall**: "COUNTS" 53×17, "OVER/SHORT" 82×17, "SHRINK" 49×17, "FLAGS" 41×17; "O/S RATE" 32×33. These are the sort controls for the table, at roughly a third of the minimum | Pad the `<th>` buttons to fill the header row |
| **S9** | Medium | AppShell footer — `PRODUCT.tagline` (`AppShell.js:461`) | Switch to Español, sign in | Whole screen in Spanish | **Confirmed on the signed-in side**: UI reads "código", "Todas las ubicaciones", "Informe de robos", "DÑO" — and the footer still says **"All your counts. All in one place."** `<html lang>` also stays `"en"` | Same fix as B2/B3 in the public audit; this entry records that it is *verified* here, not just code-read |
| **S10** | Low | Dashboard — "NET OVER/SHORT" tile | View a store with a negative net | Conventional currency formatting | Renders **`$-102.11`** — sign between symbol and digits. Convention is `-$102.11`, and accounting style would be `($102.11)` | Format the sign ahead of the symbol in the money helper |
| **S11** | Low | Dashboard ("Patterns"), Time ("Hours by employee") | Run axe | Heading levels do not skip | `<h3>` follows `<h1>` with no `<h2>` between. axe `heading-order` (moderate) | Promote those section titles to `<h2>` |
| **S12** | Low | Every signed-in screen — settings gear (top right) | Measure | ≥ 44px | **32×32** | Pad to 44×44; the icon can stay 32 |

### Verified working (no defect found)

Actively checked across all 12 screens, and worth recording so it is not re-litigated:

- **Zero page errors and zero console errors on all 12 screens**, with 259 entries rendering.
- **Zero horizontal page overflow** at 390px on all 12 (S3 is *inside* scroll containers, which
  is why the page-level check passes — both measurements are in this report on purpose).
- **Exactly one `<h1>` and exactly one `<main>` on every one of the 12.** This is notably
  *better* than the public surface, where 6 of 10 routes had no `<main>` at all (B6). Whatever
  shell the signed-in screens use gets landmarks right; the public pages should adopt it.
- **Zero images missing `alt`.**
- **Dark mode is not a separate risk**: the violation set is identical to light on every screen
  checked. S4 fails in both because the token is a hardcoded hex, not a theme variable.
- The Count/Team/Insights sheets, Admin sub-tabs, filters and pagination ("Show 10 more") all
  operated without error.

---

## 2. UX friction log

1. **The Log earns its place.** Dense but legible: each entry carries who, when, expected vs
   counted, and a colour-coded verdict (`BALANCED`, `SHORT $5.13`, `OVER $1.41`, `NEEDS REVIEW`,
   `RESOLVED · REGISTER ERROR`) plus a one-tap "Verify count". For the product's core
   theft-prevention loop this is the right screen. Its problems are mechanical (S2, S5), not
   conceptual.
2. **Filters are powerful and unlabelled.** Five stacked selects at the top of the Log, each
   showing only its current value. Sighted users infer them; screen-reader users cannot (S2),
   and nobody can tell at a glance which are active.
3. **The widest tables are the least reachable.** Portfolio is the cross-store comparison view —
   the owner's whole reason to open it — and 40% of the leaderboard is off-screen with no hint
   that it scrolls (S3).
4. **"More" is hidden on the device the app targets.** `CLAUDE.md` says the client uses this on
   his phone, and an Admin sub-tab is unreachable at phone width (S6).
5. **Row actions are a pixel or two short everywhere.** Not painful individually; across 18
   "Disable" buttons in Admin it adds up to a screen that feels fiddly (S5).

**What is genuinely good.** The explanatory copy is better than most products ship: *"O/S rate =
over/short per cash-sales dollar, so a big store and a small one compare fairly. Shrink is in
units, not dollars."* And on the people table: *"A ● marks someone who worked at more than one
store … A different profile at each store is a training or coverage conversation, not a verdict."*
That last line does real work — it tells a manager how **not** to misuse the number.

---

## 3. Design polish list

| # | Item | Detail |
| --- | --- | --- |
| P1 | Currency tiles overflow | S1 — the only place the app shows a wrong number |
| P2 | Alert red is unthemed | S4 — `#ff0000` hardcoded in `tailwind.config.js`, identical in dark mode where a softer red would suit |
| P3 | Tables clip mid-word | S3 — "O/S RATI…" with no fade, shadow or chevron to signal more |
| P4 | Chip rows scroll silently | S6/S7, and the same pattern as the public `/guide` — one shared fix |
| P5 | Negative currency formatting | S10 — `$-102.11` |
| P6 | Row actions 1–4px short | S5 — one padding change |

---

## 4. Top 5 engagement wins

1. **Fix the truncated money figure** (S1). This is a trust product; a dashboard that renders
   `$93,607.0` undermines the one thing it sells.
2. **Name the Log's filters** (S2). Five criticals on the screen owners live in, and the fix is
   the `<Field>` component the codebase already has.
3. **Make the tables reachable** (S3). Portfolio's whole value is comparison, and 40% of it is
   off-screen and keyboard-unreachable.
4. **One padding change for row actions** (S5). ~58 sub-44px controls collapse to near zero.
5. **Surface "More"** (S6) so Admin is fully usable on a phone.

---

## 5. Scorecard

Scores are for the **signed-in owner view** only.

| Dimension | Score | Justification |
| --- | --- | --- |
| Functionality | **9 / 10** | 12 screens, 259 seeded entries, zero page and zero console errors in either theme; every filter, sheet and pagination control worked. Docked only for S1, where the render is wrong. |
| UI consistency | **8 / 10** | One visual language, and landmarks/headings handled better here than on the public pages. Held back by three different sub-44px patterns (42px buttons, 28px chips, 17px headers) and an unthemed alert red. |
| Beginner-friendliness | **8 / 10** | The explanatory copy is a real strength, and the setup checklist gives a new owner a path. Docked for unlabelled filters and a hidden Admin tab. |
| Premium feel | **7 / 10** | Dense, confident, information-rich screens that look built for the job. Undercut by the clipped figure, clipped table headers and `$-102.11`. |
| Performance | **not scored** | Localhost against an emulator is not a meaningful performance measurement, and I will not invent one. Needs a real-network pass. |
| Accessibility | **6 / 10** | 7 critical `select-name` failures, an AA contrast failure on every screen, three keyboard-unreachable scroll regions, and pervasive sub-44px targets — against genuinely good landmark and heading-count hygiene. |

---

## 6. Priority roadmap

### Fix now
- ~~**S1** — truncated currency on the Dashboard.~~ **Done.**
- **S2** — 7 unlabelled selects (critical), 5 of them on the Log.
- **S3** — tables keyboard-unreachable with 40% of content hidden.

### Fix soon
- **S4** — alert-badge contrast, one token, every screen, both themes.
- **S5** — row-action padding; one change clears ~58 controls.
- ~~**S6** — "More" unreachable at phone width.~~ **Done** — the row wraps.
  Note the chips are still 34px tall, under the 44px target; that part is
  untouched, and raising it would add to a row that is now two deep on a phone.
- **S9** — the tagline and `lang`, now verified on signed-in screens too.

### Nice to have
- **S7** period chips · **S8** Portfolio sort headers · **S10** negative currency format ·
  **S11** heading order · **S12** settings gear.

### Next audit passes (not done here)
- **Employee and manager roles** — everything above is the owner view.
- **Write paths** — logging a count, countersigning, disputes, CSV export/import.
- **Rewards register flow** — enrol and redeem, not just the screen.
