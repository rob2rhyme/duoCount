# DuoCount — multi-vendor cash, scratch-off & inventory tracking

All your counts. All in one place. A multi-tenant Next.js + Tailwind + Firebase app
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
  - `getting-started.md` — plain-language, step-by-step **user guide** for owners
    and employees (no technical background needed)
  - `app-summary-spec.md` — plain-English overview of the whole product
  - `tier-one-build-spec.md` — spec for the tier-one trust features (built)
  - `tier-two-build-spec.md` — spec for incidents, pattern alerts, and login
    rate limiting (built)
  - `inventory-tracker-spec.md` — spec for the inventory feature (built)
  - `barcode-scanning-spec.md` — spec for camera scanning (built)
  - `lottery-pack-lifecycle-spec.md` — pack lifecycle & settlement history
    (retired July 2026; replaced by the shift-boundary pack audit)
  - `time-clock-spec.md` — spec for the time clock & scheduling suite (built)
  - `ui-enhancements-spec.md` — spec for the denomination currency counter,
    scroll-to-top FAB, light/dark theme, and Settings menu (built)
  - `demo-data-spec.md` — owner-only Load/Clear sample data (server-side, so it
    respects the append-only trust rules)
  - `reporting-spec.md` — download reports for any period (daily → annual,
    custom, and fiscal-year) to keep for records (PDF + CSV + print), with a
    side-by-side multi-location comparison (shipped)
  - `pwa-spec.md` — installable mobile-first PWA (offline app shell, safe-area,
    install prompt)
  - `distribution-analysis.md` — AI integration, static-HTML, WordPress, and
    other packaging paths, with effort/trade-offs/recommendations
  - `ai-features-spec.md` — spec for the opt-in AI digest narrative (Phases 1 & 2
    built, shipped dark)
  - `ai-log-search-spec.md` — spec for opt-in natural-language log search
    (Phases 1 & 2 built, shipped dark)
  - `ai-pattern-narrative-spec.md` — spec for the opt-in in-app pattern narrative
    on the Dashboard (Phases 1 & 2 built, shipped dark)
  - `competitive-gap-analysis.md` — competitor landscape, the gaps that matter,
    and a prioritized UX enhancement plan (analysis)
  - `multi-store-rollup-spec.md` — owner portfolio/rollup view across a vendor's
    locations (all three phases shipped)
  - `bulk-import-spec.md` — owner-only CSV bulk import + migration off
    paper/Excel (all three phases shipped: items, staff, opening baselines)
  - `accountant-export-spec.md` — accountant/franchise-ready exports
    (close-of-day PDF + journal/QuickBooks CSV) (feature complete)
  - `localization-spec.md` — i18n / Spanish-first localization + a
    low-literacy count path (Phases 1–2 shipped; full en/es parity in the app)
  - `theme-accessibility-audit.md` — measured WCAG AA contrast audit across
    both themes, with the failures found and the token fixes shipped
  - `roadmap.md` — what's shipped, what's next, and what's deferred
  - `positioning-one-pager.md` — market positioning, competitors, pricing
  - `faq.md` — plain-language answers for owners, managers, and staff
    (also the short-form of the privacy/terms answers)
  - `privacy-and-data.md` — how DuoCount handles data, as a template to adapt
    (not legal advice; review before publishing)
  - `terms-of-use.md` — store ↔ operator agreement template, including fees,
    suspension, staff-notice duties, and the optional AI features
  - `legal-disclaimers.md` — non-affiliation, not-an-employment-decision,
    gaming-machine, not-advice, and warranty notices
  - each of the four above has a Spanish twin (`*-es.md`) rendered at its own
    `/docs` URL and cross-linked from the English page — a monitoring notice a
    Spanish-first clerk can only read in English isn't notice
- `LICENSE` — proprietary, all rights reserved (settled Sept 2026; the
  self-host/open-source template path is retired — see
  `distribution-decision-2026.md`). "DuoCount" is still a trading name: the real
  legal entity has to go on the copyright line before the source is distributed.
- Paper backup logs (cash drawer + scratch-off) are generated on demand from
  the app footer, branded with the signed-in store's name + code
  (`src/lib/paper-forms.js`) — no static PDFs to keep in sync.

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

## Developer console

A separate platform-admin console lives at `/dev` (for support/ops — not a
store owner). It signs in with a dedicated email + password set via
`DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD`; if either is unset the login is
disabled. The custom token it mints carries a `platformAdmin` claim and **no**
`vendorId`, so every tenant Firestore rule denies it — it reaches only the
cross-store support/billing views through the Admin SDK. There is also a
lightweight `GET /api/health` liveness probe for uptime monitors.

## Optional env vars at a glance

Beyond the Firebase web config + `FIREBASE_SERVICE_ACCOUNT_KEY`, these unlock
optional features (all listed in `.env.local.example`):

- **Email digest:** `RESEND_API_KEY`, `DIGEST_FROM`, `CRON_SECRET` (+ optional `APP_URL`).
- **AI narrative:** `ANTHROPIC_API_KEY` (per-vendor opt-in via `vendor.digest.narrative`).
- **Developer console:** `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`.

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
- **Optional AI narrative** (see `docs/ai-features-spec.md`): when
  `ANTHROPIC_API_KEY` is set **and** a vendor has opted in
  (`vendor.digest.narrative === true`), the digest gains a short AI-written
  summary + "what to watch tomorrow" list, built from the aggregates the digest
  already computes (employee names pseudonymized before egress). **Off by
  default and additive** — with no key, no opt-in, or any model failure the
  digest sends exactly as it does today. Server-side only (`claude-haiku-4-5`);
  the key never reaches the browser.

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
  log for six recurring signals — one person short 3+ times in 14 days, one
  person repeatedly over, one drawer short under multiple hands (process, not
  person), a 48-hour verification backlog, a backlog of flagged variances left
  open, and an item that keeps counting short. Alerts appear on a
  manager-only Dashboard card and in the daily digest, framed as
  "signals worth a look — not conclusions". Thresholds default to
  `PATTERN_RULES` but are tunable per vendor (Admin → Alert sensitivity); there
  is no stored state and employees never see them.
- **Time clock & scheduling** (see `docs/time-clock-spec.md`): a Time tab with
  two views. **Clock** — staff punch in/out with append-only, self-signed
  records (no edits/deletes; a mistake is fixed by punching again); a pure,
  unit-tested aggregator (`src/lib/timeclock.js`) pairs them into shifts
  (forgiving of forgotten clock-outs) and managers get hours-by-employee +
  payroll CSV. **Schedule** — managers roster a weekly plan (editable, unlike
  punches) with double-booking warnings, scheduled hours, one-click
  **copy-last-week**, and reusable **week templates**; employees see their
  upcoming shifts, mark the **days
  they can't work** (managers get a conflict flag when they roster over one),
  **grab open shifts** a manager posts unassigned (direct claim, no approval),
  and **swap shifts** (offer → a coworker claims → a manager approves; the state
  machine lives in `src/lib/swaps.js` and is mirrored by the Firestore rules);
  `src/lib/schedule.js` reconciles the roster against the actual punches by
  business day to surface no-shows. Managers **publish & notify** a week — each
  employee with an email on file is sent their shifts (via the same Resend path
  as the digest).
- **Login rate limiting**: the login route throttles failed attempts before any
  credential work runs — **per IP (10 / 15 min) and per store (50 / 15 min)** —
  using a top-level `loginAttempts` collection only the Admin SDK can touch.
  Both windows auto-expire and any successful login clears them (staff share the
  shop Wi-Fi IP). New/changed PINs must be **6 digits** (`src/lib/pin.js`).
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
suite (`tests/rules.test.mjs`, 90 tests): tenant isolation, per-location
visibility for entries/comments/notes, the five mutually exclusive entry
update branches (verify / investigate / dispute-open / dispute-manage /
comment bump), clean-create guards, the owner settings whitelist (incl. the
stock-alert and rewards keys), item lifecycle, the legacy pack rules, the
read-only rewards ledger (members read, no client writes), the incident lifecycle
(subject-only visibility and acknowledgment, manager close, immutable text),
and the workforce collections — append-only time-clock punches, the schedule
roster, shift swaps, open-shift claims, staff availability, `schedulePublished`,
and week templates.
Run them against the local Firestore emulator (needs Java):

```bash
npm run test:rules
```

The pattern detectors are pure functions with their own suite (no emulator):

```bash
npm run test:patterns
```

## Scratch-off pack audit

The lottery feature is a shift-boundary theft check, nothing more (the pack
lifecycle and settlement reconciliation were retired on purpose — settlement
is the state lottery's job; see `docs/lottery-pack-lifecycle-spec.md` for the
history). Scanning a ticket fills the pack **and the ticket # it's at** (the
end reading), and a pack the store has counted before carries its game, price,
and start # forward from the last close (`src/lib/scratch-barcode.js`, pure +
unit-tested). A game with no prior count still fills its name and price from the
owner's stored games, then the bundled PA catalog as a backstop — one resolver
(`resolveGameEntry` / `resolveGameByBarcode`) shared by the scan-to-log,
shelf-walk, manual, and Admin games surfaces, so any recognized game auto-fills
(and scan-to-log refuses only a code in neither list). Across shifts, `src/lib/scratch-audit.js` chains each pack's
counts: a count that opens above the previous close means tickets went
unaccounted between two signed counts — the Dashboard **Pack audit** card
names both signers at every break, lists packs that quietly stopped being
counted, and the entry-based **pack-gap** pattern alert carries the same
signal into the digest.

The **Scan to log** surface signs one reading per ticket on the spot and is
guarded by `src/lib/scratch-scan-guard.js` (pure + unit-tested): an accidental
re-scan of the same game+pack+ticket is refused within a shift — Opening and
Closing stay separate, and the block survives a reload or a second clerk's
device. Staff can mark a pack **sold out** straight from the scan list (a
signed `soldOut` final count, not the retired settlement), and the replacement
book of the same game # then opens fresh as a **New** book at #0 until the next
day.

**Reorder reminder.** When an active book's latest count lands within its last
few tickets (`remaining = perPack − endno`; owner threshold `vendor.scratch.reorderTickets`,
default 5, `0` = off), the Dashboard **Order scratch books** card names each game
and book still selling and how many tickets are left — a pure derived alert over
the signed counts (`src/lib/scratch-reorder.js`, `buildReorderAlerts`, unit-tested),
in the same visual language as the Stock attention card. A manager who already has
a spare in back stock taps **Have a spare** to park it (a manager-writable
`scratchReorderDismissals/{packId}` doc); un-parking is a plain delete, and a
replacement book — a new pack id — re-arms the reminder on its own. No lifecycle
or settlement state is introduced.

## Interface: counting, theming & navigation

Three usability upgrades (see `docs/ui-enhancements-spec.md`), all pure client
UI with no schema impact:

- **Denomination cash counter.** On the drawer count, a "Count cash by
  denomination" toggle tallies `$100/$50/$20/$10/$5/$1` bills plus a coins
  value; the running total (`Σ denom×count + coins`) drives "Counted at close"
  and the live over/short readout, and is what's saved as `counted`. Works in
  blind mode; clears after each save.
- **Light / dark theme.** A CSS-variable design system (`:root` light /
  `.dark` dark) exposed as Tailwind tokens (`surface`, `panel`, `line`, `fg`,
  `muted`, `gold`, …). A sun/moon toggle (header + login) persists the choice
  in `localStorage` and follows the OS preference on first visit; a no-flash
  boot script in `<head>` sets the theme before first paint. PDF, print, email
  digest, and Recharts colors intentionally stay fixed for their medium.
- **Progressive scroll-to-top FAB.** Mounted app-wide by `AppChrome`; a ring
  fills with scroll depth, reveals past ~240px, respects reduced-motion, and
  stays below modals and out of the tab order while hidden. Each user can turn
  it off in the header **Settings** menu.
- **Settings menu.** A single gear in the app header opens a popover with the
  per-device preferences — theme (light/dark) and the scroll-to-top toggle,
  persisted in `localStorage`, separate from the owner's Admin → Business
  settings — the PWA install prompt, and **Sign out** (a power-off row), so the
  header stays one control.
- **"Add to Home Screen" banner.** A one-time bottom sheet
  (`src/components/InstallBanner.js`), driven by `useInstallPrompt`
  (`src/lib/install.js` — the same module the Settings menu uses, so only one
  listener ever consumes the one-shot `beforeinstallprompt`). Behaviour per
  platform:
  - **Android / any browser that fires `beforeinstallprompt`** — the event is
    captured at module load and its default suppressed, so the browser's own
    mini-infobar never appears; the banner offers a single **Install** button
    that replays it. Hidden on `appinstalled`.
  - **iOS Safari** — iOS has no programmatic install, so the banner shows the
    two manual steps instead: Share → Add to Home Screen. Deliberately *not*
    shown in Chrome/Firefox/Edge/Opera on iOS (`CriOS`/`FxiOS`/`EdgiOS`/`OPiOS`)
    or in-app webviews (Facebook, Instagram, X, Line), because those cannot
    install at all and the instructions would be a dead end. iPadOS 13+ reports
    a Mac UA, so it is disambiguated by `maxTouchPoints`.
  - **Anything else, or already installed** (`display-mode: standalone` /
    `navigator.standalone`) — renders nothing.

  It appears **once, and only after the first saved count** — arming is wired to
  the shared `onSaved` path in `AppShell`, so opening the app or browsing a form
  never triggers it. Dismissing the ✕, or installing, sets
  `duocount-install-dismissed` and it never returns on that device
  (`duocount-install-acted` records the save, alongside the existing
  `duocount-theme` / `duocount-fab` / `duocount-lang` keys; every read and write
  is try/caught so a private-mode failure can never break a count). Icons are
  inline SVG and the strings are in the en/es catalog like everything else — no
  new dependency, no third-party script, no analytics.

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
- Login attempts are rate limited before any credential work: 10 failures /
  15 min per IP **and** 50 / 15 min per store (a distributed-attack backstop);
  both auto-expire and clear on success. New/changed PINs are 6 digits. See
  `docs/tier-two-build-spec.md` §3.
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
  users/{id}                  name, role, locationId, active, email (optional,
                              for schedule notifications)
    private/creds             pinHash (server-only)
  entries/{id}                cash, scratch, or inventory entry — locationId,
                              by, byId, verifiedBy, ts; cash/scratch carry
                              drawerId/drawerName, inventory carries
                              itemId/itemName/unit and the count fields
  incidents/{id}              signed write-up — title, text, category,
                              severity, subjectId/subjectName (null = general),
                              evidence links, open -> acknowledged -> closed
                              with ack note; immutable text, no deletes
  timeclock/{id}              append-only in/out punch — userId/userName (signed),
                              locationId/Name, type, ts, day; no edits or deletes
  schedule/{id}               manager-managed roster shift — userId/userName,
                              locationId/Name, date, start/end, by/byId; editable.
                              swapStatus (none|offered|claimed) + claimedBy* drive
                              employee shift swaps (manager approves); open:true
                              with null userId is an unassigned shift to grab
  availability/{id}           employee-authored unavailable date — userId/userName,
                              date; self-managed, manager-visible, no edits
  templates/{id}              manager-only saved week pattern — name + shifts[]
                              (dow, userId, start/end); applied to stamp a week
  schedulePublished/{week}    publish record (weekStart) — publishedAt/By,
                              notified count; manager-read, server-write only
loginAttempts/{ip_*|store_*} server-only failed-login counters (per-IP + per-store)
```

## Name note

"DuoCount" passed a web conflict screen (no competing software found).
Before spending on branding: run a USPTO trademark search, check both app
stores, and register duocount.app / getduocount.com and social handles.
