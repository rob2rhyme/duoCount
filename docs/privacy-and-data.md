---
title: Privacy & data handling
---

# Privacy & Data Handling

> **Template — review before you rely on it.** This describes how DuoCount, as
> built, handles data, so you can adapt it into the privacy notice your store
> actually publishes. It is **not legal advice**. Privacy obligations depend on
> where you and your staff are located (e.g. US state laws, GDPR/UK GDPR, PIPEDA)
> and how you deploy the app — have a professional review your final policy.

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
  inventory counts, variance flags and their cause codes, disputes, shift notes,
  incident write-ups, and time-clock punches. These are an **append-only** log:
  entries are signed by the signed-in user and are not client-deletable, by
  design, so the record stays trustworthy.
- **Service-operation records** — when DuoCount's own support operators act on
  a store through the operator console (e.g. a suspend, a rename, an owner-PIN
  reset at the owner's request), the action is written to an append-only
  operator audit log (who acted, what, on which store, when). The operator
  roster itself (name, role) is likewise a server-only record. Neither contains
  store count data.
- **Device preferences** — your light/dark theme choice and a scroll-to-top
  toggle are stored **locally in your browser** (localStorage), not on a server.
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
- **Anthropic (Claude API)** — used **only if** an owner turns on one of two
  optional AI settings (both off by default and independent). In both cases the
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

## How data is protected

- Per-store isolation and role-based access enforced in security rules, tested by
  an executable rules suite (`tests/rules.test.mjs`).
- PINs stored only as salted hashes; sign-in is rate-limited per IP and per store.
- Deactivating or demoting a staff member revokes their session so access ends
  promptly (see the security notes in `roadmap.md`).
- Records are append-only and signed, so history can't be quietly altered.

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
in your numbers from Admin → Reward settings:

> **[Store name] rewards — program terms.** When you join, we collect your
> phone number (and, if you share it, your first name) to keep a points
> balance for you. You earn **[X] point(s) per $1** of qualifying purchases
> (tobacco, vape, alcohol, lottery, gift cards, and fuel are excluded by law),
> and **[Y] points are worth [$Z]** in rewards. We estimate the value of your
> participation to be roughly equal to the rewards you can earn — about
> **[effective %]** of qualifying spending (shown as "effective giveback" in
> our settings), which is what the program costs us to offer. We do not sell
> your information or share it with other businesses, and we will not text or
> email you. Joining is optional, and you can leave at any time by telling us
> at the register — we will stop using your number and delete your record on
> request.

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

## Staff rights & requests

Staff data is controlled by the store. A staff member who wants to see, correct,
or ask about their data should contact the **store owner/operator**, who
administers the Firebase project. Fill in a real contact point here before you
publish this notice.

## Changes

Update this notice whenever the app's data handling changes; the in-app copy is
served from `docs/` so it stays with the code.
