---
title: FAQ
---

# Frequently asked questions

Short answers, in plain language, for owners, managers, and staff. If you want
the step-by-step version instead, read the **[User Guide](/guide)**
(*[en español](/docs/getting-started-es)*). For the formal versions of the
answers below, see [Privacy & Data Handling](/docs/privacy-and-data),
[Terms of Use](/docs/terms-of-use), and
[Legal Disclaimers](/docs/legal-disclaimers).

*¿Prefieres leerlo en español? → [Preguntas frecuentes](/docs/faq-es).*

---

## The basics

**What is DuoCount, in one sentence?**
A phone-friendly app where staff log their cash-drawer, scratch-off, and
inventory counts, so everyone can trust the numbers — every count is signed with
a name and a time, and nothing can be edited or deleted after it's saved.

**Who is it for?**
Convenience stores, gas stations, and similar retail where cash, lottery tickets,
and high-shrink stock all move through the same few hands each shift. It works
for one store or for a group of locations.

**Is this a POS system?**
No. DuoCount does not ring up sales, take payments, or touch a card reader. It
counts what should be there and compares it with what is. It sits alongside your
POS, not in place of it.

**Do I need to buy hardware?**
No. It runs in the browser on the phone your staff already carry, and installs
to the home screen like an app. The camera doubles as a barcode scanner — but
every scan screen also lets you type the number by hand.

**Does it work offline?**
Partly. The app shell is installable and survives a flaky connection, but saving
a count needs a connection, because the timestamp on a count comes from the
server and not from the device. That is deliberate: a time the device could set
is a time that could be backdated.

**What languages does it speak?**
English and Spanish, everywhere in the app, switchable per device. The user guide
exists in both. In this industry, staff-facing Spanish is not a nice-to-have.

---

## Trust, counts, and mistakes

**Can a manager change a count after it's saved?**
No — and neither can the owner, from inside the app. Counts are append-only.
That is the entire point: if the record could be edited, it would prove nothing.

**Then what happens when someone counts wrong?**
You record a new count. The mistake stays visible and the correction sits next
to it, which is how an auditable record is supposed to look. For cash variances
there is also a flag-and-resolve flow where a manager records *why* (human error,
register error, training gap, and so on).

**What if an employee disagrees with a count?**
They open a **dispute** on the entry and write their side. A manager works it
through to a resolution. Both the dispute and the resolution become part of the
permanent record — the employee's account of it cannot be quietly removed either.

**What does "verified" mean?**
A manager has countersigned someone else's count. A manager can never verify
their own — two sets of eyes is the rule the software enforces, not a policy you
have to remember.

**Does DuoCount decide anything about my staff?**
No. It computes alerts, and some of them name a person, but every one of them is
a prompt for a human to look. The software never disciplines, pays, schedules, or
fires anyone. A variance has ordinary explanations far more often than dishonest
ones, and treating an alert as proof of theft is a misuse of it.

---

## Lottery / scratch-offs

**Does DuoCount report to the state lottery?**
No. It is not connected to, affiliated with, or endorsed by any lottery, and it
does not do settlement. It answers one question: what ticket number was each pack
at when the shift opened, and what was it at when the shift closed — and did
anything go missing in between.

**Why does it only track opening and closing numbers?**
Because that is where tickets actually disappear, and it's a count a clerk can do
in a couple of minutes per shift. Settlement reconciliation is the lottery's job
and a much heavier process; deliberately staying out of it keeps the daily
routine short enough that staff actually do it.

**What happens when a pack sells out mid-shift?**
Tap **Final — sold out** on its row. The next book of the same game then opens as
a fresh book at #0 so its first sales are counted, until the next day.

---

## Privacy — staff

**What does the app record about me?**
Your name on every count you sign, the server time you signed it, your time-clock
punches, your schedule and availability, any time-off request you make (including
the reason you type), and any incident write-up that names you. Full detail is in
[Privacy & Data Handling](/docs/privacy-and-data).

**Does it track my location?**
No. There is no GPS, no geofenced punch, no location data of any kind anywhere in
the app.

**Does it watch my screen, my keystrokes, or my camera?**
No. The camera is used only while you have the barcode scanner open, the video is
decoded on your own device, and no image is ever stored or sent anywhere. There is
no screenshot capture and no keystroke logging.

**Can my coworkers see my counts?**
By default, no — you see your own work, and where a coworker unavoidably appears
(the other half of a shift you signed), you see the time but not their name.
Managers and owners see everyone, because reviewing the store is their job. An
owner can switch the store back to a shared log if that suits how they work; ask
which mode your store uses.

**Do I have to explain why I'm off sick?**
Not to the software. The time-off form has a reason box, and whatever you write
there is stored and readable by whoever approves requests. You do not need to
write a diagnosis. Ask your employer who can read it.

**Can I see or delete what the app holds about me?**
Ask your store owner — they control the data and the rights you have depend on
where you are. Note that counts you signed generally cannot be erased: they're a
financial and employment record, and the tamper-evidence protects you as much as
it protects the owner.

---

## Privacy — customers and rewards

**Do you text or email my customers?**
Never. DuoCount sends **no SMS at all** and no marketing of any kind. That also
keeps your store clear of US text-message (TCPA) liability, where the damages run
$500–1,500 *per message*. If you later run your own texting campaign outside
DuoCount, you must collect the express written consent the law requires first.

**Is my customer list shared with other stores?**
No. There is no cross-merchant network and no pooling. A customer enrolled at your
store does not exist at any other store, even on the same deployment. You own the
list; DuoCount processes it for you and for nothing else.

**What do you store about a rewards customer?**
A phone number, an optional first name, and their points ledger. The number is
used only to look them up at the register, and the app shows it masked after entry.

**Why are cigarettes and lottery excluded from points?**
Because discount bans and minimum-price laws apply to them. Tobacco, vape,
alcohol, lottery, gift cards, and fuel are excluded from earning and redeeming as
a legal baseline; you can exclude more categories on top of that.

**Do I have to post anything about the program?**
Yes — several US states, California most prominently, treat a points program as a
**financial incentive** and require you to describe its terms before someone opts
in. There's a ready-to-adapt notice and a printable bilingual counter sign in
[Privacy & Data Handling](/docs/privacy-and-data).

---

## AI features

**Does DuoCount use AI?**
Only if an owner turns it on. Three optional features exist, all **off by
default**, all independent, and all advisory — an AI summary in the daily digest,
natural-language log search, and a plain-English explanation of the pattern
alerts.

**What gets sent, and to whom?**
It goes to Anthropic's Claude API, and only for the feature you enabled. The
digest summary and the dashboard insight send **already-totaled figures with
employee names replaced by pseudonyms** — no raw count records. Log search sends
the question the manager typed plus the names/drawers/items currently on screen,
so the model can build a search filter; no amounts are sent. With the settings off,
nothing is sent at all. The precise per-feature breakdown is in
[Privacy & Data Handling](/docs/privacy-and-data).

**Can AI change my numbers?**
No. Every AI output is display-only. It cannot write a count, resolve a flag, or
alter a record — and it can be wrong, so read the underlying records before acting
on anything it says.

---

## Data, money, and leaving

**Who owns the data?**
Your store does. All of it — counts, notes, incidents, punches, settings, and your
rewards customer list and points ledger.

**Can I get my data out?**
Yes, whenever you like. CSV export from the Log tab, the Scratch report, and the
Reports center, plus PDF and print for period reports. No export fee, no gate.

**What if I stop paying?**
Your store is marked past due, and the operator may suspend it after notice and a
reasonable chance to fix it or export first. Suspension blocks access — it does
not delete your records.

**What happens if I close my account?**
Ask for a final export, then your store's data is deleted within 90 days, apart
from anything that must be kept for legal or security reasons.

**Do you store my card details?**
No. DuoCount holds your plan, status, cycle, and price — nothing else. Card
details, if a deployment charges, live with a separate payment provider under its
own terms.

---

## Setup and running it

**How hard is it to set up?**
Adding your locations, drawers, items, and staff takes an afternoon, and a
first-run checklist walks you through the two essentials. If you're running your
own deployment rather than using a hosted one, there's infrastructure to stand up
first (a Firebase project, security rules, hosting) — that part is a developer job.

**Can I try it before committing?**
Yes. **Admin → Demo data → Load sample data** fills the app with realistic sample
counts, staff, and history so you can walk every screen, then removes exactly what
it added when you clear it.

**Can I move over from a spreadsheet?**
Yes — owner-only CSV import for tracked items, staff, opening shelf counts, POS
stock levels, and rewards customers, with a row-by-row preview before anything is
written. Re-running is safe; records already in your store are matched and updated,
never duplicated.

**Can I rebrand it?**
An owner can set the business name, logo, colour palette, font, and text size from
Admin. Deeper white-labelling is a conversation with the operator.

---

## Still stuck?

Use **Support** in the app to open a ticket. One thing worth knowing: tickets —
including any screenshot you attach — are readable by whoever operates this
deployment, so don't paste anything into one you wouldn't want them to read, and
check what else is on screen before you attach a screenshot.
