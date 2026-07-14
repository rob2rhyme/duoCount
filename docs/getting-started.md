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
- Move around with the **navigation**: on a phone, a **bottom bar** groups the
  screens into **Count** (Cash / Scratch-offs / Inventory), **Team** (Time /
  Incidents / Notes), **Insights** (Dashboard / Log), and **Admin** (managers
  only) — tap a group to pick a screen. On a wider screen the same screens line
  up as a **row of tabs** across the top.
- Employees **log counts**. Managers **verify** them (a second set of eyes),
  handle anything flagged, and pull **reports**.
- The app does the arithmetic and shows **over/short** in green (over) or red
  (short) so you don't add anything up by hand.

![The daily flow: an employee logs a signed count; a manager verifies it (never their own); anything off by more than the threshold is flagged or disputed; and it all rolls up into the dashboard and reports.](/diagrams/daily-flow.svg)

*How a count travels from the shift floor to your records.*

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

> **You'll be guided.** The first time you sign in to a brand-new store, a
> **"Welcome — let's set up your store"** checklist sits at the top of the
> screen and tracks the two essentials — **a location** and **a cash drawer** —
> plus an optional **inventory items** step. Each **Set up in Admin →** button
> jumps you straight to the right place. Until those essentials exist, the Cash,
> Scratch-off, and Inventory tabs show a short "here's what's missing" card
> instead of an empty form, so you always know the next step. Once the two
> essentials are in place the checklist gets out of the way (you can dismiss the
> leftover inventory nudge if you're cash-only).

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
owners always see everything. You can also set the business **name/logo**, turn
on an optional **daily email digest** (off by default), and turn on the optional
**AI helpers** (all off by default — see step 6).

### 4. Your daily rhythm

- **Verify counts.** On the **Log** (or the entry itself), mark a count
  **verified**. You can't verify your own — that's the whole point.
- **Watch the Dashboard.** Net over/short, short counts, charts by day, employee,
  drawer, and item, plus quiet **pattern alerts** (e.g. "same drawer short under
  three people" — a conversation starter, never a verdict). If you turn on the AI
  insight (step 6), an **"Explain these signals"** button sums the alerts up and
  says what to look at first.
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

![Pulling a report: pick a period (Day through Year, or custom dates), pick a location, preview what it includes, then export as PDF, CSV, or a printout.](/diagrams/report-flow.svg)

*Four steps to a record you can keep — nothing about the saved counts changes.*

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

### 6. Optional AI helpers (off by default)

DuoCount has three small, optional AI features. Each is **off until you turn it
on** in **Business settings**, each needs an AI key configured on the server, and
none of them ever changes your saved counts — they only summarize or search.
Before anything is sent, **employee names are replaced with "Employee A / B"**,
and your count amounts stay in the app. See **Privacy & data** for exactly what
each one sends.

- **AI summary in the daily digest** — adds a couple of plain-English sentences
  and a "what to watch tomorrow" list to the top of the digest email.
- **Natural-language log search** — an **"Ask"** button on the Log so you can type
  a question like *"Eve's shorts last week"* and have it turned into filters (it
  always falls back to a normal keyword search).
- **AI insight on the Dashboard** — an **"Explain these signals"** button on the
  pattern-alerts card that reads the signals back and flags what to look at first.

Turn one on for a location, try it, and turn it off again any time — leaving it
off changes nothing about how DuoCount works.

---

## For employees

### Signing in

Type the **store code** your manager gave you and **your own PIN**, then
**Sign in**. That's it — your name is attached to everything you log.

> **See "ask your manager to finish setup"?** That just means your manager
> hasn't added a location, drawer, or the items yet — there's nothing for you to
> fix. Counting opens up as soon as they do.

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
2. Enter **Counted on hand** — what's actually on the shelf right now (or
   **scan** the barcode to pick the item). That's all a quick recount needs; the
   app compares it against the last count.
3. Adjusting for deliveries or sales? Open **Movement details** to add **start
   on hand**, **received**, **sold**, and **removed** — it's optional and tucked
   away so the everyday count stays one field.
4. **Save.** A red (negative) result means stock is missing. If your store set an
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

![How a cash count adds up: expected equals starting cash plus sales minus paid-outs; over or short equals counted minus expected; if the over/short is at least the store threshold, the count is flagged for review.](/diagrams/cash-count-math.svg)

*The arithmetic the app does for every closing count.*

---

## Handy tips

- **It remembers your spot.** Each count form starts on the **location and
  drawer you used last** and guesses **opening vs closing** from the time of day
  (opening in the morning, closing from mid-afternoon) — so most counts are
  pre-filled and you just enter the number. Change any of it whenever you need.
- **Your saves are safe.** The **Save** button stays off until the count is
  actually filled in (so you can't save an empty drawer by accident), and if a
  save ever fails — a dead spot, a dropped signal — a red **"Couldn't save"** bar
  stays on screen with a **Retry** button instead of a message that flashes and
  disappears. Your entry isn't recorded until you see the success note.
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
