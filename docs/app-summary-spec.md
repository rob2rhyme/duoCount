# DuoCount — What This App Is, in Plain Terms

## The one-sentence version
A phone-friendly web app where retail teams log their cash drawer and lottery scratch-off counts, so owners and employees can both trust the numbers — and any business can sign up and run it for their own stores.

## Who uses it
- **Owner** — signs the business up, gets a store code to share, and controls the settings. The first person to register a business is automatically the owner.
- **Managers** — log counts, double-check (verify) other people's counts, manage staff, locations, and drawers, and resolve problems.
- **Employees** — sign in with the store code plus their own 6-digit PIN and log counts for their location.

## How signing in works
No emails or passwords. Staff enter the store code (like `acme-market`) and their personal PIN. PINs are stored scrambled, never as plain text, and one business can never see another business's data — that separation is enforced by the database itself, not just the screens.

## What the app does today

**Cash drawer counts.** Staff pick a location and a named drawer (POS Cash Drawer, Lottery Cash Drawer, Safe — whatever the owner sets up) and enter their opening or closing count. The app does the math: expected cash = start + sales − paid out, and shows over/short in green or red. Instead of adding up the till by hand, staff can flip on the **denomination counter** and just enter how many $100s, $50s, $20s, $10s, $5s, and $1s (plus loose coin) are in the drawer — the "counted" total adds itself up, live.

**Scratch-off counts.** Because lottery tickets are numbered in order, end number minus start number = tickets sold, times the ticket price = dollars that must be in the drawer. The math audits itself. Beyond per-shift counts, managers can track each scratch-off pack through its whole life — received → active in a bin → settled or returned, forward-only — and reconcile a state lottery settlement CSV against those tracked packs to catch discrepancies.

**Inventory counts.** A third kind of count, in the same signed log: shelf counts of high-shrink items (cigarette cartons, vapes, whatever the owner puts on the tracked list). Expected on hand = start + received − sold − removed, so a negative over/short means missing stock. It inherits verification, the shared log, per-location visibility, CSV export, and its own dashboard breakdown, with no special cases.

**Scan instead of type.** The phone camera the app already runs on doubles as a barcode scanner: staff can scan a scratch-off pack number or an inventory item's barcode instead of typing it. Scanning is only an input accelerator — nothing saves until the count is signed.

**One shared, live log.** Every count appears instantly for the whole team, stamped with who logged it and when. Entries can never be edited or deleted — the record is permanent, which is what makes it trustworthy.

**Manager verification.** A manager can mark any count as verified — but never their own. Two sets of eyes on every number.

**Multiple locations.** A business can have several stores. The owner picks a sharing mode: either every location sees all the logs, or each location only sees its own (managers and owners always see everything).

**Dashboard.** Totals and trends: net over/short, how many short counts, daily charts, cash sales trend, top scratch-off games, and breakdowns by employee, drawer, and item.

**Time clock & scheduling.** A Time tab with two views. **Clock** — staff punch in and out with append-only, self-signed records (a mistake is fixed by punching again, never edited); managers get hours-by-employee and a payroll CSV. **Schedule** — managers build a weekly roster (with double-booking warnings, one-click copy-last-week, and reusable week templates); employees see their upcoming shifts, mark the days they can't work, grab open shifts a manager posts, and swap shifts with a coworker (offer → claim → manager approves). Managers can publish a week and email each employee their shifts, and the app reconciles the plan against the actual punches to surface no-shows.

**Admin & export.** Managers add staff, set roles, reset PINs, and manage locations, drawers, tracked inventory items, and the scratch-off pack registry. Deactivating a staff member cuts their access right away — they're signed out and can no longer log anything, even if their phone still had the app open. (A store always keeps at least one active owner — the app won't let you demote or deactivate the last one.) The owner sets the business name, logo, and sharing mode. Anyone can export the full log as a spreadsheet (CSV).

**Comfortable on any phone.** A **light or dark theme** — tap the sun/moon to switch, and the app remembers your choice (it matches your phone's setting the first time). On long screens like the log or dashboard, a **scroll-to-top button** floats in the corner; its ring fills as you scroll to show how far down you are, and one tap brings you back to the top.

## The trust features (built)

1. **Blind counts** — the counter can't see the "expected" number until after they save, so nobody can count *to* the target. Since entries can't be edited, the count is locked in before the answer is revealed.
2. **Automatic flags with reasons** — any count off by more than a set amount (default $5) gets flagged for review. Managers close the flag by recording why: Human error, Training gap, Equipment fault, Register error, Suspected theft, or Other.
3. **Disputes** — if an employee disagrees with a count or a flag, they can open a dispute right on the entry and state their side. The whole conversation is saved permanently, and a manager resolves it. Nobody's word gets lost.
4. **Shift notes** — a digital logbook for handoff messages ("register 2 drawer is sticking," "lottery bin 4 running low"), pinned notes, per location.
5. **End-of-day report** — one tap produces a PDF for any day and location: every count, totals, flags, verification status, and signature lines for employee and manager.
6. **Daily email digest** — when the owner turns it on and adds recipients (it's off by default), a summary of yesterday goes out each morning to that list: totals, over/shorts, anything flagged, disputed, or still unverified.
7. **Incident write-ups** — when something happens that isn't a number (a till left open, a safety issue, a no-show), a manager files a signed, permanent write-up, with links to camera footage if there is any. The employee it concerns sees it, acknowledges it ("I've seen this" — not "I agree"), and can add their side to the same permanent record. Coworkers never see each other's write-ups.
8. **Pattern alerts** — the dashboard quietly watches for repeating signals: the same person short three times in two weeks, the same drawer short under different people (which points at the register, not a person), counts nobody has double-checked, an item that keeps going missing. Alerts are worded as conversation starters, never verdicts, and only managers see them.
9. **Login protection** — repeated failed sign-in attempts are blocked for a cooldown period, so nobody can sit and guess PINs.
10. **Optional AI helpers** — three small, off-by-default features an owner can switch on in Business settings: a plain-English summary at the top of the daily digest, an "Ask" box on the Log that turns a typed question into filters, and an "Explain these signals" button that reads the dashboard's pattern alerts back to a manager. They only summarize or search — never change a saved count — and employee names are pseudonymized before anything is sent. Each needs an AI key on the server and stays off until turned on.

## The trust philosophy behind all of it
Every number has a name and a timestamp. Nothing can be edited or deleted after the fact. Big discrepancies can't be quietly ignored — they get flagged and must be explained. Employees get a voice through disputes, and employers get a permanent, self-auditing record. The same log protects both sides.

## The technology, in one line
A modern website app (Next.js) backed by Google's Firebase database, installable on a phone like a regular app, with running costs near zero at small-store scale.
