# DuoCount — What This App Is, in Plain Terms

## The one-sentence version
A phone-friendly web app where retail teams log their cash drawer and lottery scratch-off counts, so owners and employees can both trust the numbers — and any business can sign up and run it for their own stores.

## Who uses it
- **Owner** — signs the business up, gets a store code to share, and controls the settings. The first person to register a business is automatically the owner.
- **Managers** — log counts, double-check (verify) other people's counts, manage staff, locations, and drawers, and resolve problems.
- **Employees** — sign in with the store code plus their own 4–6 digit PIN and log counts for their location.

## How signing in works
No emails or passwords. Staff enter the store code (like `smokers-haven`) and their personal PIN. PINs are stored scrambled, never as plain text, and one business can never see another business's data — that separation is enforced by the database itself, not just the screens.

## What the app does today

**Cash drawer counts.** Staff pick a location and a named drawer (POS Cash Drawer, Lottery Cash Drawer, Safe — whatever the owner sets up) and enter their opening or closing count. The app does the math: expected cash = start + sales − paid out, and shows over/short in green or red.

**Scratch-off counts.** Because lottery tickets are numbered in order, end number minus start number = tickets sold, times the ticket price = dollars that must be in the drawer. The math audits itself.

**One shared, live log.** Every count appears instantly for the whole team, stamped with who logged it and when. Entries can never be edited or deleted — the record is permanent, which is what makes it trustworthy.

**Manager verification.** A manager can mark any count as verified — but never their own. Two sets of eyes on every number.

**Multiple locations.** A business can have several stores. The owner picks a sharing mode: either every location sees all the logs, or each location only sees its own (managers and owners always see everything).

**Dashboard.** Totals and trends: net over/short, how many short counts, daily charts, cash sales trend, top scratch-off games, and breakdowns by employee and by drawer.

**Admin & export.** Managers add staff, set roles, reset PINs, and manage locations and drawers. The owner sets the business name, logo, and sharing mode. Anyone can export the full log as a spreadsheet (CSV).

## What's planned next (already specced, not yet built)

1. **Blind counts** — the counter can't see the "expected" number until after they save, so nobody can count *to* the target. Since entries can't be edited, the count is locked in before the answer is revealed.
2. **Automatic flags with reasons** — any count off by more than a set amount (default $5) gets flagged for review. Managers close the flag by recording why: honest mistake, training gap, equipment fault, register error, suspected theft, or other.
3. **Disputes** — if an employee disagrees with a count or a flag, they can open a dispute right on the entry and state their side. The whole conversation is saved permanently, and a manager resolves it. Nobody's word gets lost.
4. **Shift notes** — a digital logbook for handoff messages ("register 2 drawer is sticking," "lottery bin 4 running low"), pinned notes, per location.
5. **End-of-day report** — one tap produces a PDF for any day and location: every count, totals, flags, verification status, and signature lines for employee and manager.
6. **Daily email digest** — the owner automatically gets yesterday's summary each morning: totals, over/shorts, anything flagged, disputed, or still unverified.

## The trust philosophy behind all of it
Every number has a name and a timestamp. Nothing can be edited or deleted after the fact. Big discrepancies can't be quietly ignored — they get flagged and must be explained. Employees get a voice through disputes, and employers get a permanent, self-auditing record. The same log protects both sides.

## The technology, in one line
A modern website app (Next.js) backed by Google's Firebase database, installable on a phone like a regular app, with running costs near zero at small-store scale.
