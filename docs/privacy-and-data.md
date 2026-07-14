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
  over/short), scratch-off pack activity, inventory counts, variance flags and
  their cause codes, disputes, shift notes, incident write-ups, and time-clock
  punches. These are an **append-only** log: entries are signed by the signed-in
  user and are not client-deletable, by design, so the record stays trustworthy.
- **Device preferences** — your light/dark theme choice and a scroll-to-top
  toggle are stored **locally in your browser** (localStorage), not on a server.

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
- **Anthropic (Claude API)** — used **only if** an owner turns on the optional
  **"AI summary in the daily digest"** setting (off by default). When on, the
  day's already-totaled figures — per-location cash/scratch/inventory numbers and
  the pattern-alert signals — are sent to Anthropic's API to write the two- or
  three-sentence summary at the top of that digest. **Employee names are replaced
  with pseudonyms ("Employee A", "Employee B") before anything is sent**, only
  aggregates leave the app (never raw count records), and the AI output is
  email-only — it never changes your logged counts. With the setting off, or with
  no AI key configured on the server, nothing is sent to Anthropic. Use a
  processor with a data-retention posture that matches your promise (Claude's
  Haiku/Sonnet tiers support zero data retention).
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

## Retention & deletion

Operational records are **append-only** and kept for the business's own records
(accounting, franchise, tax, audit). Because they are the trustworthy history of
the store, staff cannot delete them from the app; the store owner controls the
underlying Firebase data and any retention or deletion outside the app. Demo/sample
data is separate and can be cleared by the owner at any time.

## Staff rights & requests

Staff data is controlled by the store. A staff member who wants to see, correct,
or ask about their data should contact the **store owner/operator**, who
administers the Firebase project. Fill in a real contact point here before you
publish this notice.

## Changes

Update this notice whenever the app's data handling changes; the in-app copy is
served from `docs/` so it stays with the code.
