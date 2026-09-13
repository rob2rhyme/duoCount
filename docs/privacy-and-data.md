---
title: Privacy & data handling
---

# Privacy & Data Handling

> **Template — review before you rely on it.** This describes how DuoCount, as
> built, handles data, so you can adapt it into the privacy notice your store
> actually publishes. It is **not legal advice**. Privacy obligations depend on
> where you and your staff are located (e.g. US state laws, GDPR/UK GDPR, PIPEDA)
> and how you deploy the app — have a professional review your final policy.

*¿Prefieres leerlo en español? → [Privacidad y manejo de datos](/docs/privacy-and-data-es).*

## Who this is for

DuoCount is a store operations tool a business runs for its **own** staff. The
**business (the store owner) is the data controller** — it decides what is
recorded and why. DuoCount is the software that records it. If you deploy DuoCount
for your store, you are the operator, and this notice is the starting point for
what you tell your staff.

## What data DuoCount stores

DuoCount only stores what the business and its staff enter to run shift counts:

- **Store & staff accounts** — store name and code; each staff member's display
  name, role (employee / manager / owner), and assigned location; an optional
  email address (only if you add one for schedules or the daily digest).
- **Sign-in credentials** — a staff member signs in with a numeric PIN. The PIN
  is **never stored in plain text**; only a salted hash is kept, and sign-in
  compares against the hash. (`src/lib/hash.js`, `private/creds` subdocument.)
- **Operational records** — cash counts (sales, paid-outs, expected vs. counted,
  over/short), scratch-off pack activity (counts and the occasional books-on-hand
  census snapshot — a signed list of the pack numbers physically on the shelf),
  inventory counts and backroom stock movements, amusement/gaming machine
  collection readings (if the store tracks machines), variance flags and their
  cause codes, disputes and their comment threads, and shift notes. These are an
  **append-only** log: entries are signed by the signed-in user and are not
  client-deletable, by design, so the record stays trustworthy.
- **Reorder reminders** — when a manager parks a "book nearly empty" reminder
  because a spare is already on hand, the app records which pack was parked, its
  game, and who parked it. Unlike a count, this one **is** deletable: un-parking
  removes the record entirely. It is working state for the reorder list, not part
  of the audit trail.
- **Employment records** — these deserve naming separately, because they are
  about people rather than about stock:
  - **Time-clock punches** — in/out times, signed and server-timestamped.
  - **Schedules and availability** — assigned shifts, the days a staff member
    says they can't work, published rosters, and shift-swap offers and claims.
  - **Time-off requests** — the request type (**vacation, sick, personal,
    appointment, other**), the dates, and a **free-text reason of up to 500
    characters** written by the staff member, plus the manager's decision and
    their own reason. **A "sick" request, or anything a staff member writes in
    the reason box, may amount to health information.** Treat this field as
    sensitive: tell staff they need not disclose a diagnosis, restrict who
    approves requests, and check your local rules — under GDPR/UK GDPR health
    data is a special category needing its own lawful basis, and several US
    states regulate it too.
  - **Payroll** — hours are rolled up per employee, days can be locked once run,
    and a payroll CSV can be exported. That export contains hours worked and is
    a compensation record.
  - **Incident write-ups** — a signed, append-only record that **names the staff
    member it concerns** and can carry a severity, a category, a narrative, and
    the subject's acknowledgement. These are **disciplinary/personnel records**.
    Many jurisdictions give employees a right to see their own personnel file;
    plan for that rather than being surprised by it.
- **Pattern alerts (automated flagging)** — the app computes signals such as
  repeat shorts, drawer hot-spots, off-shift counts, and scratch-pack gaps, and
  some of them **name an individual employee**. These are advisory prompts for a
  human to review, never automatic decisions: nothing in DuoCount disciplines,
  pays, schedules, or terminates anyone on its own. If you use them as an input
  to an employment decision, that decision is yours and must be made by a person
  who has looked at the underlying records. (Where GDPR applies, this matters:
  Art. 22 restricts decisions based solely on automated processing.)
- **Support requests (only if someone contacts support)** — a ticket carries the
  subject and body your staff write, the category and priority, **any screenshot
  attached**, the store name, and the name of the person who wrote it. Tickets
  are readable by the operator of this deployment — that is the point of a
  support channel — so tell staff not to paste anything into a ticket they would
  not want the operator to read, and remember a screenshot may capture whatever
  else was on screen.
- **Billing records (only where the deployment charges for the service)** — the
  store's plan, subscription status (trial / active / past due / canceled),
  billing cycle, and price. No card numbers, bank details, or payment
  credentials are stored in DuoCount; if a deployment takes payment, that runs
  through a separate payment provider under its own terms.
- **Imported data (only if an owner runs an import)** — the owner-only CSV import
  can bring in tracked items, a staff roster (names, roles, locations, optional
  emails), opening shelf counts, POS stock levels, or rewards customers. Imported
  data becomes the same kind of record as anything typed in by hand, and you are
  responsible for having the right to import it — a customer list exported from
  another system carries whatever consent it was collected under.
- **Service-operation records** — when DuoCount's own support operators act on
  a store through the operator console (e.g. a suspend, a rename, an owner-PIN
  reset at the owner's request), the action is written to an append-only
  operator audit log (who acted, what, on which store, when). The operator
  roster itself (name, role) is likewise a server-only record. Neither contains
  store count data.
- **Device preferences** — a handful of small settings are stored **locally in
  your browser** (localStorage) and never sent to a server: your light/dark
  theme (`duocount-theme`), the scroll-to-top toggle (`duocount-fab`), your
  language choice (`duocount-lang`), the tab you were last on
  (`duocount-tab`), which sections you print (`duocount-print-sections`), and two
  flags for the one-time "Add to Home Screen" banner — whether you have saved a
  count yet (`duocount-install-acted`) and whether you dismissed or accepted it
  (`duocount-install-dismissed`), so it is never shown twice.
  None identifies you; clearing your browser data removes them. DuoCount sets no
  advertising or analytics cookies. Signing in does store a Firebase
  authentication session on the device so you stay signed in — signing out
  clears it.
- **Camera (only while you are scanning)** — the barcode scanner asks your
  browser for camera access when you open it. The video is decoded **on your
  device, in the browser**; DuoCount does **not** record, store, upload, or
  transmit any image or video, and the camera stops when you close the scanner.
  You can decline the permission and type numbers by hand instead — every
  scan-driven screen has a manual path.
- **Rewards customers (only if the owner turns rewards on)** — a customer's
  phone number, an optional first name, and their points ledger (earn/redeem
  lines signed by the staff member who recorded them). The phone number is used
  **only** to look the customer up at the register; the app shows it masked
  (last 4 digits) after entry. DuoCount sends customers **no marketing** — no
  texts, no emails — and their data is **never sold, shared, or pooled** across
  businesses (there is no cross-merchant network). The points ledger is
  append-only like every other record; corrections are new signed lines.

DuoCount does **not** collect analytics, advertising identifiers, location data,
or any third-party tracking. There is no ad network and no analytics SDK in the
app.

## Where data is stored & who processes it

- **Google Firebase (Firestore + Authentication)** — the operational records and
  accounts live in the store's own Firebase project. Access is enforced per store
  by Firestore security rules (`firestore.rules`): one store cannot read or write
  another store's data, and role rules limit what each staff member can see.
- **Resend** — used **only if** you enable the emailed daily digest or schedule
  notifications, to deliver those emails to the recipients you configure. If you
  don't configure email, no data goes to Resend.
- **Anthropic (Claude API)** — used **only if** an owner turns on one of three
  optional AI settings (all off by default and independent). In every case the
  AI output is advisory only — it never changes your logged counts — and with the
  setting off, or with no AI key configured on the server, nothing is sent to
  Anthropic. Use a processor with a data-retention posture that matches your
  promise (Claude's Haiku/Sonnet tiers support zero data retention).
  - **"AI summary in the daily digest"** — sends the day's already-totaled
    figures (per-location cash/scratch/inventory numbers and the pattern-alert
    signals) to write the two- or three-sentence summary at the top of that
    digest. **Employee names are replaced with pseudonyms ("Employee A", …)
    before anything is sent**; only aggregates leave the app, never raw count
    records.
  - **"Natural-language log search"** — when a manager uses the Log tab's "Ask"
    box, the **typed question** and the **list of names / drawers / items / games
    currently in view** are sent so the model can turn the question into a search
    filter; the filtering then happens in the browser. **No count amounts or
    records are ever sent.** Note the one difference from the digest summary: the
    typed question is written by the manager and is sent as-is, so if they type a
    person's name to search for it, that name is included.
  - **"AI insight on the Dashboard"** — when a manager clicks "Explain these
    signals" on the pattern-alerts card, the **pattern signals shown on that card**
    (their titles and totals) are sent so the model can summarize them.
    **Employee names are replaced with pseudonyms first**, no count records are
    sent, the summary is display-only, and nothing is sent until the manager
    clicks.
- **Your hosting** — the app itself (e.g. on Vercel). Traffic is over HTTPS.

Each of these is a third-party processor with its own terms; list the ones you
actually use in your published notice.

**Where in the world.** Firebase, Resend, Anthropic, and most hosting providers
are US-based, and a Firebase project is pinned to a region you choose when you
create it. If your staff or customers are in the UK, EU, or another region with
transfer rules, that is an **international transfer** and you need a lawful basis
for it (for the EU/UK today that generally means Standard Contractual Clauses,
which each of these providers offers). Pick your Firebase region deliberately —
it cannot be changed later without migrating the data.

## How data is protected

- Per-store isolation and role-based access enforced in security rules, tested by
  an executable rules suite (`tests/rules.test.mjs`).
- PINs stored only as salted hashes; sign-in is rate-limited per IP and per store.
- Deactivating or demoting a staff member revokes their session so access ends
  promptly (see the security notes in `roadmap.md`).
- Records are append-only and signed, so history can't be quietly altered.
- **Staff see their own work by default.** Managers and owners read the whole
  store; an employee's Dashboard, Log, Backroom history, and Scratch history show
  only the counts they signed, and a coworker who appears at the other end of a
  shift is shown as "another staff member" rather than by name. An owner can turn
  the shared-log view back on (**Business settings → What employees see**). Note
  this is a *display* rule enforced in the app, not in security rules: counts stay
  readable store-wide because the arithmetic depends on it (a pack's opening
  number chains off whoever took the previous reading). Treat it as a courtesy
  boundary between coworkers, not as a security control against a determined
  employee.

## Who owns rewards-customer data

Loyalty platforms split into two camps. **Network platforms** (e.g. Loyalzoo,
Fivestars) share a customer's identity across every merchant in their network
and may market to those customers directly — the merchant's "list" is really
the network's. **Service-provider platforms** (e.g. Square Loyalty, Smile.io)
process each merchant's list only on that merchant's behalf.

DuoCount is deliberately in the second camp:

- **The store owns its customer list and points ledger.** DuoCount processes it
  as a service provider and for no other purpose.
- **No cross-store pooling** — a customer enrolled at one store does not exist
  at any other store, even on the same deployment.
- **No platform marketing** — DuoCount never contacts a store's customers, and
  sends no SMS at all (which also keeps stores clear of TCPA text-message
  liability; if a store later runs its own texting campaigns outside DuoCount,
  it must collect the express written consent US law requires).
- **Minimal identity** — a phone number and an optional first name; the app
  displays the number masked (last 4) after entry.

## Rewards notice of financial incentive (template)

Several US state privacy laws — most prominently California's CCPA/CPRA —
treat a points program as a **financial incentive** and require the business to
describe its material terms before a customer opts in (the California
Attorney General has actively enforced this against loyalty programs since
2022). Adapt the following, print it or link it near the counter sign, and fill
in your own numbers from Admin → Reward settings. The figures below are
DuoCount's shipped defaults (1 point per $1, 100 points = $5, so 5% effective,
expiry off unless you set it) and the store name is an example — replace both
with yours, and re-check the percentage against the "effective giveback" figure
Admin shows you, because tiers and VIP multipliers change it:

> **Bramble Creek Market rewards — program terms.** When you join, we collect
> your phone number (and, if you share it, your first name) to keep a points
> balance for you. You earn **1 point per $1** of qualifying purchases
> (tobacco, vape, alcohol, lottery, gift cards, and fuel are excluded by law),
> and **100 points are worth $5** in rewards. We estimate the value of your
> participation to be roughly equal to the rewards you can earn — about **5%**
> of qualifying spending (shown as "effective giveback" in our settings), which
> is what the program costs us to offer. Points expire after 12 months with no
> earning visit. We do not sell your information or share it with other
> businesses, and we will not text or email you. Joining is optional, and you
> can leave at any time by telling us at the register — we will stop using your
> number and delete your record on request.

## Retention & deletion

Operational records are **append-only** and kept for the business's own records
(accounting, franchise, tax, audit). Because they are the trustworthy history of
the store, staff cannot delete them from the app; the store owner controls the
underlying Firebase data and any retention or deletion outside the app. Demo/sample
data is separate and can be cleared by the owner at any time.

For **rewards customers**: enrollment lasts until the customer asks to leave.
On request, the store stops using the number and has the record deleted (today
that deletion is performed by the deployment's operator on the owner's request;
the signed points ledger keeps its history, as a financial record, without the
live profile). If the store closes its account, its customer list is deleted
with the rest of the store's data within 90 days (see the Terms of Use).

If the owner turns on **points expiry**, points lapse after the number of months
of inactivity they set, written as a signed `expire` line in the ledger rather
than by erasing history. Expiry rules are regulated in some US states and
provinces — check yours before enabling it, and tell customers the rule in your
program terms.

For **employment records** (punches, schedules, time-off, payroll exports,
incidents), retention is usually set by employment and tax law, not by
preference — several years is common, and some jurisdictions set a minimum.
Decide your retention period deliberately, write it down, and note that the
append-only design means shortening it is an action taken on the underlying
Firebase data by the owner or operator, not something staff can do in the app.

**Deleting a person.** Deactivating a staff member ends their access but does
**not** erase the counts they signed — that is the whole point of a tamper-evident
ledger, and it is normally the right answer for a financial and employment
record. Where an erasure right applies (e.g. GDPR Art. 17), it is not absolute:
records kept for legal obligations, or to establish or defend legal claims, can
usually be retained. Take advice before erasing signed history, and prefer
restricting access over destroying an audit trail.

## Staff rights & requests

Staff data is controlled by the store. A staff member who wants to see, correct,
or ask about their data should contact the **store owner/operator**, who
administers the Firebase project.

> **Fill this in before you publish.** Name a real person or role and a real
> contact route — e.g. *"Email privacy@[yourstore].com or ask [name] in person.
> We will respond within 30 days."* A privacy notice with no working contact
> point fails the one thing it exists to do. If you operate in the EU/UK,
> consider whether you need a representative or a DPO; if you operate in
> California, publish the request routes the CCPA requires.

## Tell your staff before you switch it on

Most of what DuoCount records about staff is ordinary employment record-keeping,
but three things are worth an explicit conversation rather than a discovery:

1. **Every count carries your name and a server time**, and it cannot be edited
   or deleted afterwards. That protects staff as much as it protects the owner —
   it is why "I counted that correctly" stops being one person's word — but
   nobody should learn it from a variance flag.
2. **The app computes patterns that can name an individual.** Say plainly that
   these are prompts for a conversation, that a manager reads the underlying
   counts before acting, and that the software decides nothing by itself.
3. **Time-off reasons are stored.** Tell staff they do not need to write a
   diagnosis, and say who can read the field.

Notice-and-consent duties for employee monitoring vary widely — some US states
require written notice, some require it before monitoring begins, and EU/UK
employers generally need a lawful basis plus a proportionality assessment. This
is the store owner's obligation as employer, not the software's.

## If something goes wrong

DuoCount has no breach-notification machinery built in, so this is a procedure
you need rather than a feature you get. Decide in advance:

- **Who to tell and how fast.** Most US states set a deadline once a breach
  affecting residents is confirmed; GDPR/UK GDPR set 72 hours to the regulator
  for qualifying breaches. Know your clock before you need it.
- **What you would actually do.** Rotate the Firebase service-account key and
  `CRON_SECRET`, force PIN resets, review the Firebase Auth sign-in logs and the
  operator audit log, and export the affected records before anything changes.
- **Who is on the hook.** If you run your own deployment you are the controller
  and the one who notifies. If you use a hosted deployment, your operator should
  tell you promptly — put that expectation in writing with them.

## Children

DuoCount is a workplace tool and is not directed to children. Do not enroll a
minor in the rewards program without the consent their local law requires — US
COPPA covers under-13s, and several state laws and the GDPR set their own ages
for a child's data. If your store employs minors, their employment records are
subject to the same child-employment rules as everything else you keep.

## Changes

Update this notice whenever the app's data handling changes; the in-app copy is
served from `docs/` so it stays with the code.
