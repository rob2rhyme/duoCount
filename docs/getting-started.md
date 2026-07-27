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

*¿Prefieres leerla en español? → [Guía de inicio](getting-started-es.md).*

> **Working your first shift? Start here.**
> 1. [Sign in](#signing-in) with the store code + your PIN.
> 2. [Clock in](#clock-inout-and-see-your-schedule) on the **Time** tab.
> 3. Log your opening counts — [cash](#log-a-cash-drawer-count) and
>    [scratch-offs](#log-a-scratch-off-count).
> 4. At shift end, log the closing counts the same way.
> 5. [Clock out](#clock-inout-and-see-your-schedule). Done — everything you
>    logged is signed with your name.

---

## The 60-second picture

- You sign in with a **store code** (like `acme-market`) and your own **PIN** —
  no email, no password.
- The app **opens on the Dashboard** — the day's numbers first. Move around
  with the **navigation**: on a phone, a **bottom bar** groups the screens into
  **Count** (Cash / Scratch-offs / Backroom, plus **Rewards** when the store
  turns that on), **Team** (Time / Incidents / Notes), **Insights** (Dashboard /
  Scratch report / Portfolio / Log), and **Admin** (managers only) — tap a
  group to pick a screen. On a wider screen the same screens line up as a
  **row of tabs** across the top. (**Portfolio** and **Scratch report** appear
  for owners only.)
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
> Scratch-off, and Backroom tabs show a short "here's what's missing" card
> instead of an empty form, so you always know the next step. Once the two
> essentials are in place the checklist gets out of the way (you can dismiss the
> leftover inventory nudge if you're cash-only).

Open **Admin** and add the pieces your team will pick from when they count:

- **Locations** — each physical store (skip if you have just one).
- **Cash drawers** — the named cash drawers at each location: *POS Cash
  Drawer*, *Lottery Cash Drawer*, *Safe*, and so on.
- **Backroom items** — the high-value stock you want counted and watched
  (cigarette cartons, vapes, etc.). Only what's on this list gets counted —
  keep it short.
- **Staff & roles** — add each employee with their **name**, **role** (employee
  or manager), and a **PIN**. Share the store code with them.

> Scratch-off packs need no registration step: a pack exists in DuoCount the
> first time someone counts it, and from then on its ticket numbers chain from
> count to count. Settlement paperwork stays with the lottery.

> **Enter your scratch games (optional).** In **Admin → Scratch games**, an owner
> can type each game the store sells — **game number**, **game name**, **ticket
> price**, and optionally **tickets per pack** — or **scan/paste a ticket** and a
> recognized game's number, name, and price fill in for you (edit anything, then
> **Add game**). After that, a scan or a typed pack
> fills the game name and price on its own, so logging is quicker and the data
> matches every time. DuoCount already ships with the current state game list, so
> you only need this for a game it doesn't know yet (or a different state's games).
> It's pure reference data — entering a game never sets a count or a ticket number,
> and editing one never touches a past signed count. A game you no longer sell can
> be removed; scans just fall back to the built-in list.

> **Switching from a spreadsheet?** Owners get an **Import / migrate** card in
> **Admin** that brings in your **tracked items**, your **staff roster**, your
> **opening shelf counts**, your **stock levels** (on-hand quantity, price,
> and expiry date — exported from your POS), or your **rewards customers**
> (phone, optional name and points balance) from a **CSV** (from Excel, your old
> POS, a spreadsheet). Pick the type, upload the file, match your columns to DuoCount's
> fields — it guesses most for you — and review a **row-by-row preview** before
> anything is written. Re-running is safe: a record already in your store is
> matched and updated or skipped, never duplicated. Two things worth knowing:
> **staff PINs are optional** (import names/roles/locations now, set PINs in
> Admin later — an existing person's PIN is never changed by import, and owner
> rows are never imported), and **opening counts are permanent** — import items
> first, each item gets at most one opening count, and a wrong number is
> corrected with a fresh count, never an edit.

> **Just exploring?** In **Admin**, under **Demo data**, the owner sees a **Load
> sample data** button. It fills the app with realistic sample counts, staff, and
> history so you can try every screen — then **Clear sample data** removes exactly
> what it added.

### 3. Choose how much each location sees (Settings)

In **Admin → Business settings**, the owner sets **Data sharing**: either
every location sees all counts, or each location sees only its own. Managers and
owners always see everything. The same card also sets the business
**name/logo**, an optional **daily email digest** (off by default), **customer
rewards** (off by default — see step 6), and the optional **AI helpers** (all
off by default — see step 7).

> Settings changes apply **live**: the moment you save, every signed-in device
> picks them up — nobody needs to sign out or restart the app.

> **How often you count scratch packs.** The same card has **Scratch-off
> counting**: at **opening and closing** (the default, and the tightest check —
> it bounds every shift on both sides), or at **opening only** / **closing
> only** if that's all your staffing allows. The count form then offers just the
> shifts you log, and the Shift log treats a single daily count as complete
> instead of asking for the one you never intended to take.

### 4. Your daily rhythm

- **Watch the badges.** As a manager, small amber counts appear on the
  navigation next to **Log** (counts with an unresolved variance or dispute),
  **Incidents** (open write-ups), and **Time** (shift swaps and time-off
  requests waiting on your approval) — an ambient nudge toward whatever needs a
  second look, so nothing waits unseen. They clear themselves as you resolve
  each item.
- **Run more than one store? Open Portfolio.** Owners with two or more locations
  get a **Portfolio** tab: pick any period and see every store side by side —
  total over/short, sales, scratch dollars, and shrink up top, then a
  **leaderboard** ranked by which store needs your attention (worst
  verification and biggest over/short first). The **O/S rate** column shows
  over/short per sales dollar, so a big store and a small one compare fairly.
  Tap any store to open its full report for the same period. Below the
  leaderboard, **People across stores** lists everyone who logged counts in the
  period, most short first — a gold dot marks anyone who worked at more than
  one store, and expanding them shows their record store by store (someone who
  balances at one store but runs short at another is a training conversation,
  not a verdict). **Download PDF / CSV** exports the whole portfolio view for
  your records. It's all read-only — a way of *looking at* your counts, never
  changing them.
- **Verify counts.** On the **Log** (or the entry itself), mark a count
  **verified**. You can't verify your own — that's the whole point.
- **Watch the Dashboard.** Net over/short, short counts, charts by day, employee,
  drawer, and item, plus quiet **pattern alerts** (e.g. "same drawer short under
  three people" — a conversation starter, never a verdict). If you turn on the AI
  insight (step 7), an **"Explain these signals"** button sums the alerts up and
  says what to look at first.
- **Open the Scratch report (owners).** Everything scratch-off lives in the
  owner-only **Scratch report** tab: sales and tickets by day, game, and staff,
  with charts, CSV, and a branded printout — plus the log and the theft view:
  - **Shift log** — the plain record, one line per pack per day: the ticket
    number it stood at when the shift **opened** and when it **closed**, the
    time each scan happened and who signed it, and the tickets sold between
    (closing − opening). This is the sheet to read when you want to know what a
    pack did on a given day.
  - **Unaccounted tickets** — every break in a pack's ticket sequence: the
    number it closed at, the number it re-opened at, who signed each side, and
    when. The time is the server's clock, so it can't be backdated. A one-tap
    **Countersign** lets a second manager sign off on the risky read.
  - **Stopped being counted** — packs that fell out of the routine, with their
    last ticket #, signer, and exact time.
  - **Books on hand** — the shelf census reconciled against the counts. A book
    that walked, or one never counted at all, gets named.

  Missing tickets get caught at the shift boundary, not months later. The
  Dashboard's alerts still tip you off: several packs jumping together in one
  window (one after-hours session), a count logged while nobody was clocked
  in, or risky counts still waiting on a second signature.
- **Check Stock attention.** If you sync stock levels from your POS (the
  **Stock levels** import), the Dashboard lists what's **expiring soon**
  (default within 30 days) and what **needs ordering** (default fewer than
  5 left) — both thresholds are owner-adjustable in **Business settings →
  Stock alerts**, and both lists ride along in the daily digest email. Items
  without a synced quantity or expiry date simply never alert.
- **Handle flags.** Any cash count off by more than your threshold (default $5)
  is flagged; close it by recording *why* (Human error, Register error, Training
  gap, etc.). You can also set an **inventory** threshold in units (Business
  settings) to flag stock counts the same way — it's off until you set it.
- **Disputes & notes.** If an employee disagrees, they open a **dispute** on the
  entry; you resolve it. **Notes** is your shift logbook for handoffs.
- **Incidents.** File a signed write-up when something happens that isn't a
  number (a till left open, a no-show). The employee it concerns can acknowledge
  and add their side.
- **Time-off requests.** Staff ask for time off — or flag a predictable future
  event they'll need off for (a wedding, a class) — right from the **Time** tab.
  You **approve or deny each with a short reason**, and the employee sees your
  decision and that reason the moment you make it. Overlapping requests show a
  heads-up so you don't accidentally leave a shift uncovered.
- **Help & support.** Hit a snag or think something's broken? In **Admin**, the
  **Help & support** card lets you report an app issue — attach a screenshot if
  it helps — and follow it from *open* to *resolved*; any reply lands right in
  the thread, so you're never left wondering.

### 5. Pull a report for your records

This is how you save numbers for the accountant, the franchise, or taxes.

![Pulling a report: pick a period (Day through Year, or custom dates), pick a location, preview what it includes, then export as PDF, CSV, or a printout.](/diagrams/report-flow.svg)

*Four steps to a record you can keep — nothing about the saved counts changes.*

1. Go to the **Dashboard** tab and tap **📄 Reports & export**.
2. Pick a **period** — Day, Week, Month, Quarter, Half-year, Year, or **Custom**
   dates — and use the **◀ ▶** arrows to step to the one you want.
3. Pick a **location** (or *All locations*).
4. The **"Will include"** box previews what's in that period — cash over/short,
   inventory shrink, flags, and how much is verified. (Scratch-off detail has
   its own home: the owner **Scratch report** tab, with its own CSV and print.
   Lottery revenue still rides in the bookkeeper journal below.)
5. Export it:
   - **Download PDF** — a tidy summary for the record: totals by location and
     drawer, inventory shrink by item, an over/short trend, and the staff-hours
     roll-up, with signature lines.
   - **Download CSV** — the raw rows for a spreadsheet.
   - **Print** — a line-by-line printout (or print-to-PDF from your browser).

Files are named so they sort themselves, e.g. `duocount-report-all-2026-Q3.pdf`.

> **Doing the books?** The same Reports screen has a **"For the bookkeeper"**
> section with two one-tap files:
> - **Close-of-day PDF** — a single-day reconciliation sheet (cash sales, paid-
>   outs, expected vs counted, over/short) with a preview of the exact journal
>   entry the CSV exports, plus signature lines — so the paper you sign and the
>   file you import always agree.
> - **QuickBooks journal CSV** — a balanced, double-entry journal (cash sales,
>   lottery, paid-outs, over/short, and the cash to deposit), one entry per day
>   per location, ready to import instead of re-keying the day by hand.
>
> Both are **drafts** for your bookkeeper to review and post — DuoCount records
> the counts; your accounting software stays the ledger.
>
> **Franchisee?** The same section has an optional **franchise format** dropdown
> (off by default): pick it to download a fixed-column daily report (store #,
> gross/cash/lottery sales, paid-outs, over/short, verified %), one row per day.
> It's a generic layout — check it against your franchisor's actual template
> before submitting.

### 6. Customer rewards (optional, off by default)

A phone-number points program at the register — no card, no app, no hardware.
The owner turns it on in **Business settings → Customer rewards** and sets the
economics (defaults: **$1 = 1 point, 100 points = $5 off**). The settings card
shows the **effective % back** live as you edit — the defaults give back 5% of
qualifying spend, roughly five times what the big chains do, so make sure your
margins carry it.

- **At the register:** staff open the **Rewards** tab, type the customer's
  phone number, and either enroll them (name optional) or pull up their
  balance. Points are earned on the **qualifying sale total** — leave out
  tobacco, vape, alcohol, lottery, gift cards, and fuel (discount bans,
  minimum-price laws, and lottery face-value rules apply to those). When the
  balance clears the bar, one tap records the redemption and the discount is
  applied on your register.
- **Adding customers:** one at a time right at the register — the phone number
  is the whole signup — or all at once: **Admin → Import / migrate → Rewards
  customers** takes a CSV of one phone number per line (name and points balance
  optional) and skips anyone already enrolled. Moving in from another rewards
  app? Map your export's points column and each customer starts at their old
  balance, recorded as a signed owner adjustment in the ledger. That seeding
  applies to new customers and to enrolled customers with no points activity
  yet (so re-importing with points fixes an earlier import that had none) —
  once a customer has any real activity, an import can never change their
  points. The Rewards tab itself walks staff through the flow with a numbered
  "How it works" card.
- **Trustworthy by construction:** every earn and redemption is a **signed,
  permanent line** in the rewards ledger — nothing can be edited or deleted,
  corrections are new signed lines by the owner, and the Dashboard's pattern
  alerts watch for the classic abuses (points that outpace your counted sales,
  one account earning several times a day, redemption bursts under one clerk).
  The Dashboard also shows the **outstanding points liability** in dollars.
- **For customers:** they can check their own balance any time at **/rewards**
  with just the store code and their phone number (no name is ever shown), and
  Admin can print a ready-made **bilingual counter sign** with your program and
  that address on it.

### 7. Optional AI helpers (off by default)

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

> **See "Your manager is still setting up this store"?** That just means your
> manager hasn't added a location, drawer, or the items yet — there's nothing
> for you to fix. Counting opens up as soon as they do.

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

1. Tap **Scratch-offs**, then **scan** a ticket with your phone camera — or
   type the **game** and **pack #** by hand.
2. Check the **start** and **end** ticket numbers. Tickets sold = end − start,
   and the app multiplies by the ticket price to get the dollars that should be
   in the drawer.
3. **Save.**

> A scan does most of the typing for you: it fills the pack and the ticket #
> it's at (your end reading), and a pack the store has counted before also
> fills its game, price, and start # from the last count — so an everyday open
> or close is scan → glance → save.

> **No double-counting, no lost swaps.** Scan the same pack twice in one shift
> and the app blocks the repeat with a note — opening and closing count
> separately, so you still scan each pack at both. When a pack sells out, tap
> **Final — sold out** on its row; the next book of that same game then opens as
> a fresh **New** book at **#0**, so its first sales are counted, until the next
> day.

> **Two more views on the same tab.** **History** shows your own scratch numbers
> by shift (managers see everyone's), so you can check your day without asking —
> including a **Shift log** of the packs you counted: what each one was at when
> you scanned it, the time, and who took the other reading. Pick 7 / 30 / 90 days
> at the top.
> **Census** is an occasional shelf walk: scan **every book physically on the
> display** — including ones nobody has counted yet — and save one signed
> snapshot. The owner's report compares censuses over time, so a book that
> disappears between two walks (even one that was never ticket-counted) gets
> noticed.

### Log a backroom stock count

1. Tap **Backroom**, pick the **item**.
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

### Move backroom stock (pull to the front, restock)

Above the count form on the **Backroom** tab is your **live backroom stock** —
each tracked item with how many are on hand and a **−** and **+** button. Tap
**−** when you pull one to the front (or it sells) and **+** when a delivery
restocks it. Each tap is its own **signed movement line**, so the on-hand number
and the who/when history stay honest — a manager can see every pull. Items
running low or near their expiry date float to the top. This is the quick,
all-day tally that keeps the shelf number live; the **signed count** above is
the periodic, full recount that goes on the record.

### Record a gaming machine collection (if your store hosts machines)

If outside companies run slot, ATM, or amusement machines in your store, the
owner registers them under **Admin → Gaming machines**. On the day a machine is
collected:

1. Tap **Gaming**, pick the **machine**, and set the **collection date**.
2. Enter the machine's **total collection** and **total payout** for the period.
3. **Submit** — your entry is recorded for the owner.

You won't see the split or the store's take: the store and the machine's company
split the remainder (collection − payout) by contract, and those totals are
**owner-only**. If a machine paid out more than it collected, the store's share
is simply **$0** — never a negative.

> **Owner view.** On the same **Gaming** tab — and only for the owner — you see
> the totals for any timeframe (collection, payout, net, your take and the
> company's), broken down per machine and per company, with a store-take chart
> and a **CSV export** for the dates you pick. Each collection is a signed,
> append-only line, so the record of who entered what stays honest.

### Rewards at the register (if your store turned it on)

On the **Rewards** tab, type the customer's phone number and **Look up**. Not
enrolled yet? Add them with just the number (name optional). Then enter the
**qualifying sale total** — leave out tobacco, vape, alcohol, lottery, gift
cards, and fuel — and tap **Earn points**. When their balance clears the bar,
the **Redeem** button lights up: tap it, then apply the discount on the
register. Every earn and redemption is signed with your name and permanent,
like a count. Customers can check their own balance at **/rewards**.

### Clock in/out and see your schedule

To clock in at the start of your shift:

1. Tap the **Time** tab. It opens on **Time clock**.
2. Tap **Clock in**. That's it — you're on the clock.
3. At the end of your shift, come back and tap **Clock out**.

A wrong punch is fixed by punching again (or ask a manager) — punches are never
edited, so your hours record stays honest.

The same tab has two more views. **Schedule** shows your upcoming shifts —
mark days you can't work, grab open shifts, or offer a swap to a coworker.
**Time off** is where you ask for days off with a reason; your manager's
approve or deny (with their reason) appears right on the request. You can also
log a predictable future event you'll need off for, so it's on their radar
early.

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
  Home Screen," and it opens full-screen and works offline for the basics. It
  reopens on the **tab you were last using** and shows your recent data right
  away, so a reload drops you back where you were.
- **¿Prefieres español?** The whole app speaks Spanish: pick **Español** from
  the language menu on the sign-in screen (next to the sun/moon) or in the
  header **gear (Settings) → Idioma**. Every screen switches — alerts, forms,
  menus, and confirmations included. It's a per-device choice, like the theme —
  your coworker's screen never changes. What's written into the permanent
  record (notes, comments, exports) stays in the language it was written, and
  this guide is available in Spanish too (the /guide page follows your
  language).
- **Light or dark.** On the sign-in screen, tap the sun/moon. Once you're signed
  in, open the header **gear (Settings) → Appearance** to switch — it remembers
  your choice per device.
- **Keyboard shortcuts** (on a computer): press **?** to see them — number keys
  jump between tabs, **⌘/Ctrl + Enter** saves the current form.
- **Export anytime.** The **Log** tab's **Export CSV** covers the cash and
  backroom count history; the owner **Scratch report** exports scratch-off
  detail; the **Reports** center exports a specific period.

---

## FAQ: your data & your customers' data

**Who owns my store's data?**
You do — counts, notes, punches, settings, and (if you run rewards) your
customer list and points ledger. DuoCount is the service that records it for
you, nothing more. Full details: [Terms of Use](/docs/terms-of-use) and
[Privacy & Data Handling](/docs/privacy-and-data).

**Can other stores see my data or my customers?**
No. Every store is walled off by security rules enforced at the database.
Unlike loyalty "networks" that share customer identities between merchants,
DuoCount never pools customers across stores and never markets to them.

**What do I owe my rewards customers?**
Three things: tell them the deal (post the printable counter sign from Admin →
Reward settings, and keep the program-terms notice from the privacy page
available — some states require it); use their phone number only for points;
and honor requests — if someone wants out, stop using their number and ask for
the record's deletion.

**Can I text my rewards customers?**
Not through DuoCount — it sends no SMS on purpose. If you run texting
campaigns with another tool, US law (TCPA) requires each person's express
written consent first; the rewards signup alone is not that consent.

**How do I take my data out, or leave?**
Export CSVs anytime (Log tab, Reports center). If you close your store, ask
your operator for a final export; store data is deleted within 90 days of a
closure request.

---

## A few words you'll see

| Word | What it means |
| --- | --- |
| **Store code** | Your business's sign-in name (e.g. `acme-market`). |
| **Over / short** | How far a count is above (over) or below (short) expected. |
| **Verify / countersign** | A manager confirming a count with a second signature — never their own. |
| **Flag** | An automatic "please explain" on a count that's too far off. |
| **Variance** | The difference a flag is about — the gap between counted and expected. |
| **Threshold** | How big a variance has to be before it's flagged (the store sets it). |
| **Dispute** | An employee formally disagreeing, on the record. |
| **Blind count** | Counting without seeing the expected number first. |
| **Pack / book** | Two words for the same thing: one bundle of scratch-off tickets, one game. |
| **Census** | A shelf walk that records every scratch-off book physically on hand. |
| **Paid-out** | Cash paid out of the drawer during a shift (lottery winners, vendor payments). |
| **Shrink** | Stock that's gone without a sale — the inventory version of a short. |
| **Period** | The date range a report covers (a day, month, quarter, etc.). |
| **Qualifying sale** | The part of a sale that earns rewards points — everything except tobacco, vape, alcohol, lottery, gift cards, and fuel. |

---

*Still stuck? The [App summary](app-summary-spec.md) explains the whole product
in plain terms, and the [Roadmap](roadmap.md) shows what's shipped and what's
next.*
