# DuoCount — multi-vendor cash, scratch-off & inventory tracking

Every count, countersigned. A multi-tenant Next.js + Tailwind + Firebase app
where any retail business can sign up, add its locations, named cash drawers
(POS Cash Drawer, Lottery Cash Drawer, Safe, …), and tracked inventory items,
and give staff PIN sign-in. Employees log opening and closing counts — cash
drawers, scratch-off packs, and shelf counts of high-shrink items; managers
verify them; an analytics dashboard breaks activity down by day, employee,
drawer, item, and location. Each business's data is isolated by Firestore
security rules keyed on server-issued auth claims.

## What's in this repo

- The Next.js app lives at the repo root (`src/`, `public/`, `firestore.rules`,
  `tests/`).
- `docs/` — product documentation:
  - `app-summary-spec.md` — plain-English overview of the whole product
  - `tier-one-build-spec.md` — spec for the tier-one trust features (built)
  - `tier-two-build-spec.md` — spec for incidents, pattern alerts, and login
    rate limiting (built)
  - `inventory-tracker-spec.md` — spec for the inventory feature (built)
  - `barcode-scanning-spec.md` — spec for camera scanning (built)
  - `lottery-pack-lifecycle-spec.md` — spec for pack tracking (built)
  - `ui-enhancements-spec.md` — spec for the denomination currency counter,
    scroll-to-top FAB, and light/dark theme (built)
  - `positioning-one-pager.md` — market positioning, competitors, pricing
- `print-forms/` — printable paper log PDFs (cash drawer + scratch-off),
  branded for Smokers Haven, useful as backup or during onboarding. The app
  also serves them from its footer (`public/forms/`).

The full-catalog inventory application that previously lived in this repo
(products, expiry dates, suppliers, barcode scanning) is preserved in git
history at commit `0d9e7a1` for future porting.

## Inventory counts

Inventory is a third entry kind in the same countersigned log (see
`docs/inventory-tracker-spec.md`). Managers define the tracked list in
Admin → Inventory items (name, category, unit, location — start with the 5–15
highest-shrink items). Staff count them on the Inventory tab:
expected = start + received − sold − removed, so a negative over/short means
missing stock. Start qty prefills from the item's last count at that location.
Inventory entries inherit verification, the shared log, per-location
visibility, CSV export, and the dashboard (missing-units stat + by-item table)
with no special cases.

## How multi-tenancy works here

- Every business ("vendor") lives under `vendors/{vendorId}` in Firestore,
  with `locations`, `drawers`, `users`, and `entries` subcollections.
- Signing in goes through an API route: it checks your store code + PIN
  (PINs are stored as salted scrypt hashes, never plain text), then mints a
  Firebase custom token whose claims carry your vendorId, role, and location.
- Firestore rules only allow requests whose token vendorId matches the data's
  vendor — one business can never read another's logs, even from dev tools.
- Each vendor's owner picks a data-sharing mode in Admin → Business settings:
  "Shared" (every location sees all logs) or "Per location" (employees see
  only their own location; managers and owners always see everything).

## Roles

- Owner — everything managers can do, plus business settings and owner roles.
  The person who registers the business is the first owner.
- Manager — logs counts, verifies other people's counts, manages staff,
  locations, and drawers.
- Employee — logs counts for their assigned location.

## Setup

1. Create a Firebase project, add a Web app, and copy its config.
2. In the console enable Build → Firestore Database (production mode) and
   Build → Authentication (no providers needed — the app uses custom tokens).
3. Project settings → Service accounts → Generate new private key. Keep the
   JSON file secret.
4. `cp .env.local.example .env.local`, fill in the web config, and paste the
   service-account JSON (one line, or base64 of the file) into
   `FIREBASE_SERVICE_ACCOUNT_KEY`.
5. Paste `firestore.rules` into Firestore → Rules and publish.
6. Deploy the composite indexes: either `firebase deploy --only firestore:indexes`
   with the included `firestore.indexes.json`, or just run the app — the first
   filtered query logs a console error containing a one-click index-creation link.
7. `npm install && npm run dev`, open http://localhost:3000, and tap
   "New business? Register your store".

On signup the app creates your store code (shown in Admin), a "Main Location",
and two starter drawers: POS Cash Drawer and Lottery Cash Drawer.

## Deploying

Standard Next.js on Vercel — the app is at the repo root, so a default
project configuration (Root Directory left empty) builds it as-is, and
`vercel.json` registers the daily digest cron. Add all the env vars from
`.env.local` (including `FIREBASE_SERVICE_ACCOUNT_KEY`) to the project
settings — a build without them still succeeds (the Firebase client falls
back to placeholders at build time), but nobody can sign in until the real
values are set.

## Tier one: trust features

- **Blind counts** (owner toggle): the cash form hides expected/over-short for
  everyone — managers included — until the count is committed; the result is
  revealed on the post-save toast and in the log (entries get a Blind pill).
  *Honest limitation:* expected/diff are computed client-side at save (there
  is no server write path for entries), so blind mode is a UI-level control —
  a determined employee with dev tools could compute the expected total. The
  mitigation is the same as everywhere else in DuoCount: manager verification
  and the append-only history.
- **Variance flags + cause codes** (owner-set dollar threshold, default $5):
  cash counts off by the threshold or more are flagged at save time and work
  through open → under-review → resolved with a required cause code
  (human error, training gap, equipment fault, register error, suspected
  theft, other). Threshold changes never rewrite history.
- **Dispute threads**: every entry carries an append-only comment thread; the
  author can open a dispute (with a required explanation), managers advance
  and close it. Comment counts bump in the same batch as each comment.
- **Shift notes**: a Notes tab — the counter notebook, digitized. Post-only
  text, location-scoped like entries, manager pin/archive.
- **End-of-day report**: manager button on the dashboard; client-generated
  PDF (cash/scratch/inventory tables, flagged & disputed items, verification
  summary, signature lines) plus a print-friendly fallback.
- **Daily email digest**: owner-configured recipients/timezone in Admin;
  a Vercel cron (`vercel.json`, 10:00 UTC) hits `/api/cron/digest`, which
  summarizes each vendor's local "yesterday" and sends via Resend.
  Idempotent per day (`digest.lastSentDate`); the Admin "Send test digest"
  button sends immediately without consuming the daily guard.
  Requires env vars: `RESEND_API_KEY`, `DIGEST_FROM`, `CRON_SECRET`
  (and optional `APP_URL`) — see `.env.local.example`.

## Tier two: incidents, patterns & hardening

- **Incident write-ups** (see `docs/tier-two-build-spec.md`): managers file
  signed, permanent incidents (title, category, severity, narrative, optional
  evidence links to camera clips or photos) on the Incidents tab, optionally
  concerning a specific staff member. Visibility is deliberately narrower than
  entries: managers see all, the subject sees their own, coworkers never see
  each other's. The subject acknowledges once ("I've seen this", not "I
  agree") with an optional response that lands on the same permanent record;
  managers close. No edits, no deletes — enforced by rules.
- **Pattern alerts**: a pure detector (`src/lib/patterns.js`) scans the entry
  log for recurring signals — one person short 3+ times in 14 days, one
  drawer short under multiple hands (process, not person), a 48-hour
  verification backlog, an item that keeps counting short. Alerts appear on a
  manager-only Dashboard card and in the daily digest, framed as
  "signals worth a look — not conclusions". Thresholds live in
  `PATTERN_RULES`; there is no stored state and employees never see them.
- **Login rate limiting**: the login route throttles failed attempts —
  10 per 15 minutes per client IP — before any credential work runs, using a
  top-level `loginAttempts` collection only the Admin SDK can touch. A
  successful login clears the counter (staff share the shop Wi-Fi IP).
  Optional cleanup: add a Firestore TTL policy on `windowStart`.

## Barcode scanning

The phone camera the app already runs on doubles as the scanner (see
`docs/barcode-scanning-spec.md`). Items can carry a barcode (set in
Admin → Inventory items, itself scan-fillable); the Inventory form's 📷 button
scans to select the matching item at the current location. On the Scratch
form, 📷 fills the pack number — and whenever the pack matches an earlier
count at that location (scanned or typed), the form prefills the game, price,
and start # from that entry's end #, so a recount is one scan plus one number.
Scanning is an input accelerator only: nothing saves until "Save & sign
entry". The zxing decoder is dynamically imported and never ships in the
initial bundle. Camera use requires HTTPS (or localhost) plus permission.

## Testing the security rules

The rules are the product's trust boundary, so they have an executable test
suite (`tests/rules.test.mjs`, 32 tests): tenant isolation, per-location
visibility for entries/comments/notes, the five mutually exclusive entry
update branches (verify / investigate / dispute-open / dispute-manage /
comment bump), clean-create guards, the owner settings whitelist, item
lifecycle, the forward-only pack lifecycle, and the incident lifecycle
(subject-only visibility and acknowledgment, manager close, immutable text).
Run them against the local Firestore emulator (needs Java):

```bash
npm run test:rules
```

The pattern detectors are pure functions with their own suite (no emulator):

```bash
npm run test:patterns
```

## Scratch-off pack lifecycle

Beyond per-shift counts, each pack (book) can be tracked from safe to last
ticket (see `docs/lottery-pack-lifecycle-spec.md`): managers receive a pack
(game, pack #, price, tickets/pack — barcode scan-fillable), activate it to a
bin, and later settle or return it. Transitions are forward-only and enforced
by the rules — a settled pack never reopens. Settling snapshots sold-vs-size
from the count log (`soldAtSettle` / `shortAtSettle`), so per-pack shrink is
frozen on the record with the responsible shifts traceable in the log. On the
Scratch form, an "Active pack" picker fills game, price, and pack # in one
tap; combined with the last-count prefill, a recount is one pick and one
number. The registry is optional — free-text pack counting still works.

## Security notes

- PINs: salted scrypt hashes under `users/{id}/private/creds`, which no client
  can read (rules deny; only the Admin SDK in API routes touches them).
- Entries are append-only; the only permitted edits are the five whitelisted
  transitions (manager verification — never your own entry — variance
  investigation, author dispute-open, manager dispute moves, and the comment
  counter bump), each constrained to its exact fields by the rules.
- Comments and notes are immutable once posted; notes can only be pinned or
  archived, never edited or deleted.
- Role or location changes take effect at the target user's next sign-in,
  because rules read the auth token's claims (issued at login).
- The digest cron route rejects requests without `Bearer ${CRON_SECRET}`.
- Login attempts are rate limited: 10 failures per 15 minutes per IP, checked
  before any credential work. Deeper hardening (per-user lockout, 6-digit
  PIN default) is a tier-3 option in `docs/tier-two-build-spec.md` §7.
- Incident write-ups are subject-visible only (plus managers); coworkers can
  never read each other's, in either sharing mode.

## Data model

```
vendors/{vendorId}            name, slug (store code), logoUrl, sharingMode
  locations/{id}              name, active
  drawers/{id}                name, locationId, active
  items/{id}                  name, category, unit, barcode, locationId, active
  packs/{id}                  game, packNumber, price, ticketCount, bin, status
                              (received -> active -> settled|returned, forward-
                              only), transition stamps, settle snapshot
  users/{id}                  name, role, locationId, active
    private/creds             pinHash (server-only)
  entries/{id}                cash, scratch, or inventory entry — locationId,
                              by, byId, verifiedBy, ts; cash/scratch carry
                              drawerId/drawerName, inventory carries
                              itemId/itemName/unit and the count fields
  incidents/{id}              signed write-up — title, text, category,
                              severity, subjectId/subjectName (null = general),
                              evidence links, open -> acknowledged -> closed
                              with ack note; immutable text, no deletes
loginAttempts/{ip}            server-only failed-login counters (rate limiting)
```

## Name note

"DuoCount" passed a web conflict screen (no competing software found).
Before spending on branding: run a USPTO trademark search, check both app
stores, and register duocount.app / getduocount.com and social handles.
