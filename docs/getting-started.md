---
title: Getting started
---

# Getting started with DuoCount

A plain-language guide for real users — no technical background needed. If you
run the store, start with **[For owners & managers](#for-owners--managers)**.
If you work a shift and just need to log your counts, jump to
**[For employees](#for-employees)**.

> **What DuoCount is, in one sentence:** a phone-friendly app where staff log
> their cash-drawer, scratch-off, and inventory counts, so everyone can trust
> the numbers — every count is signed with a name and a time, and nothing can be
> edited or deleted after it's saved.

---

## The 60-second picture

- You sign in with a **store code** (like `acme-market`) and your own **PIN** —
  no email, no password.
- Near the top is a **row of tabs** that scrolls sideways on a narrow phone:
  **Cash**, **Scratch-offs**, **Inventory**, **Log**, **Notes**, **Incidents**,
  **Time**, **Dashboard**, and **Admin** (managers only).
- Employees **log counts**. Managers **verify** them (a second set of eyes),
  handle anything flagged, and pull **reports**.
- The app does the arithmetic and shows **over/short** in green (over) or red
  (short) so you don't add anything up by hand.

---

## For owners & managers

### 1. Create your store (owners only, one time)

1. Open the app and tap **New business? Register your store** (the sign-up link
   under the sign-in button), then **Create business & sign in**.
2. Enter your **business name**, **your name**, and a **6-digit PIN** you'll
   remember. (A logo URL is optional.)
3. The app gives you a **store code** — write it down. This is what you and every
   employee type to sign in. You are now the **owner**.

### 2. Set the store up (Admin tab)

Open **Admin** and add the pieces your team will pick from when they count:

- **Locations** — each physical store (skip if you have just one).
- **Drawers** — the named cash drawers at each location: *POS Cash Drawer*,
  *Lottery Cash Drawer*, *Safe*, and so on.
- **Tracked items** — the high-shrink inventory you want counted (cigarette
  cartons, vapes, etc.). Only what's on this list gets counted — keep it short.
- **Scratch-off packs** — register lottery packs so their numbers are tracked.
- **Staff** — add each employee with their **name**, **role** (employee or
  manager), and a **PIN**. Share the store code with them.

> **Just exploring?** In **Admin**, under **Demo data**, the owner sees a **Load
> sample data** button. It fills the app with realistic sample counts, staff, and
> history so you can try every screen — then **Clear sample data** removes exactly
> what it added.

### 3. Choose how much each location sees (Settings)

In the header **Settings** menu, the owner sets the **sharing mode**: either
every location sees all counts, or each location sees only its own. Managers and
owners always see everything. You can also set the business **name/logo** and
turn on an optional **daily email digest** (off by default).

### 4. Your daily rhythm

- **Verify counts.** On the **Log** (or the entry itself), mark a count
  **verified**. You can't verify your own — that's the whole point.
- **Watch the Dashboard.** Net over/short, short counts, charts by day, employee,
  drawer, and item, plus quiet **pattern alerts** (e.g. "same drawer short under
  three people" — a conversation starter, never a verdict).
- **Handle flags.** Any cash count off by more than your threshold (default $5)
  is flagged; close it by recording *why* (Human error, Register error, Training
  gap, etc.). You can also set an **inventory** threshold in units (Business
  settings) to flag stock counts the same way — it's off until you set it.
- **Disputes & notes.** If an employee disagrees, they open a **dispute** on the
  entry; you resolve it. **Notes** is your shift logbook for handoffs.
- **Incidents.** File a signed write-up when something happens that isn't a
  number (a till left open, a no-show). The employee it concerns can acknowledge
  and add their side.

### 5. Pull a report for your records

This is how you save numbers for the accountant, the franchise, or taxes.

1. Go to the **Dashboard** tab and tap **📄 Reports**.
2. Pick a **period** — Day, Week, Month, Quarter, Half-year, Year, or **Custom**
   dates — and use the **◀ ▶** arrows to step to the one you want.
3. Pick a **location** (or *All locations*).
4. The **"Will include"** box previews what's in that period — cash over/short,
   scratch dollars, inventory shrink, flags, and how much is verified.
5. Export it:
   - **Download PDF** — a tidy summary for the record: totals by location and
     drawer, scratch by game, inventory shrink by item, an over/short trend, and
     the staff-hours roll-up, with signature lines.
   - **Download CSV** — the raw rows for a spreadsheet.
   - **Print** — a line-by-line printout (or print-to-PDF from your browser).

Files are named so they sort themselves, e.g. `duocount-report-all-2026-Q3.pdf`.

---

## For employees

### Signing in

Type the **store code** your manager gave you and **your own PIN**, then
**Sign in**. That's it — your name is attached to everything you log.

### Log a cash-drawer count

1. Tap the **Cash** tab.
2. Choose your **location**, **drawer**, and whether this is an **opening** or
   **closing** count.
3. Enter the **starting cash** — and, on a **closing** count, the **sales** and
   **paid-outs** too. (An opening count only asks for the starting cash; the
   sales/paid-out boxes are hidden because there aren't any yet.)
4. Count the drawer. Two ways:
   - Type the **counted** total, or
   - Turn on the **denomination counter** and enter how many $100s, $50s, $20s,
     $10s, $5s, $1s, and loose coin — it adds itself up live.
5. **Save.** The app shows **over/short** — green if the drawer's over, red if
   short. Once saved, the count is locked in.

> **Blind count:** if your store uses it, you won't see the "expected" number
> until *after* you save — so you're counting the real drawer, not counting *to*
> a target.

### Log a scratch-off count

1. Tap **Scratch-offs**, pick the **game/pack**.
2. Enter the **start** and **end** ticket numbers (or **scan** the pack with your
   phone camera). Tickets sold = end − start, and the app multiplies by the
   ticket price to get the dollars that should be in the drawer.
3. **Save.**

### Log an inventory count

1. Tap **Inventory**, pick the **item**.
2. Enter **start on hand**, **received**, **sold**, and **removed**, then the
   **counted** amount on the shelf (or **scan** the barcode).
3. **Save.** A red (negative) result means stock is missing. If your store set an
   **inventory variance threshold**, a count off by that many units or more is
   flagged for a manager to review — just like a cash short. (Blind mode applies
   here too, if it's on.)

### Clock in/out and see your schedule

The **Time** tab has **Clock** (punch in and out — a mistake is fixed by
punching again, never edited) and **Schedule** (your upcoming shifts; mark days
you can't work, grab open shifts, or offer a swap to a coworker).

### Leave a shift note

Use **Notes** for handoff messages — "register 2 drawer is sticking," "lottery
bin 4 running low." Managers can pin the important ones.

---

## Reading the numbers

- **Over/short** = counted − expected. **Green** means more than expected (over),
  **red** means less (short), and near-zero is a balanced drawer.
- **Expected cash** = start + sales − paid-outs *(for a **closing** count)*. For
  an **opening** count, the expected is just the **starting cash** — there are no
  sales or paid-outs yet. **Expected stock** = start + received − sold − removed.
  The app computes these for you.
- **Verified** means a manager double-checked it. **Flagged** means it's off by
  more than the store's threshold and needs a reason. **Disputed** means someone
  formally disagreed — and the whole conversation is kept.

---

## Handy tips

- **Install it like an app.** DuoCount is a PWA — your phone/browser can "Add to
  Home Screen," and it opens full-screen and works offline for the basics.
- **Light or dark.** On the sign-in screen, tap the sun/moon. Once you're signed
  in, open the header **gear (Settings) → Appearance** to switch — it remembers
  your choice per device.
- **Keyboard shortcuts** (on a computer): press **?** to see them — number keys
  jump between tabs, **⌘/Ctrl + Enter** saves the current form.
- **Export anytime.** The **Log** tab has an **Export CSV** button for the full
  history; the **Reports** center exports a specific period.

---

## A few words you'll see

| Word | What it means |
| --- | --- |
| **Store code** | Your business's sign-in name (e.g. `acme-market`). |
| **Over / short** | How far a count is above (over) or below (short) expected. |
| **Verify** | A manager confirming a count — never their own. |
| **Flag** | An automatic "please explain" on a count that's too far off. |
| **Dispute** | An employee formally disagreeing, on the record. |
| **Blind count** | Counting without seeing the expected number first. |
| **Period** | The date range a report covers (a day, month, quarter, etc.). |

---

*Still stuck? The [App summary](app-summary-spec.md) explains the whole product
in plain terms, and the [Roadmap](roadmap.md) shows what's shipped and what's
next.*
