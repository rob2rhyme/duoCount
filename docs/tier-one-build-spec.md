# DuoCount — Tier One Build Spec

**Status:** built — all five features shipped (blind counts, variance flags + cause codes, dispute threads, shift notes, EOD PDF + email digest). Digest delivery needs the Resend/CRON env vars configured at deploy time.

**Scope.** Five features from the enhancement research, chosen for highest trust-per-effort on the existing stack (Next.js App Router + Firestore + custom-claim auth): blind count mode, variance thresholds with cause codes, dispute threads on entries, shift notes, and an end-of-day PDF report with a scheduled email digest.

**Explicitly out of scope (tier 2/3):** incident/write-up module, lottery pack lifecycle, pattern-detection alerts, scheduling/time clock, payroll exports, video links.

**Compatibility rule for the whole spec:** every new field is optional with a safe default. No backfill migration — readers treat missing fields as the default (`flagged !== true` means unflagged, missing `disputeStatus` means `'none'`). Old entries never appear in "open" queues because only new writes can set an open status.

---

## 1. Data model changes

### 1.1 `vendors/{vendorId}` — new fields

| Field | Type | Default | Editable by | Notes |
|---|---|---|---|---|
| `blindCounts` | boolean | `false` | owner | Hides expected/over-short in the cash form until the count is committed |
| `varianceThreshold` | number | `5` | owner | Dollars. `abs(diff) >= threshold` flags a cash entry at save time |
| `digest.enabled` | boolean | `false` | owner | Master switch for the email digest |
| `digest.recipients` | string[] | `[]` | owner | Email addresses; cap 10; validate format client-side |
| `digest.tz` | string | `"America/New_York"` | owner | IANA timezone used to compute "yesterday" |
| `digest.lastSentDate` | string \| null | `null` | cron only | `YYYY-MM-DD` idempotency guard |

### 1.2 `vendors/{v}/entries/{id}` — new fields

| Field | Type | Set when | Values / rules |
|---|---|---|---|
| `blind` | boolean | create | `true` if the vendor had blind mode on when this count was taken (report/audit display) |
| `flagged` | boolean | create | Cash only: `abs(diff) >= vendor.varianceThreshold` at save time. Frozen at entry time — later threshold changes don't rewrite history |
| `varianceStatus` | string | create + manager updates | `'none'` (unflagged) or `'open'` at create; managers move `open → under-review → resolved` |
| `causeCode` | string \| null | manager resolution | `human-error \| training-gap \| equipment-fault \| register-error \| suspected-theft \| other` (enum from loss-prevention practice). Required to resolve |
| `causeNote` | string \| null | manager resolution | ≤ 500 chars; required when `causeCode == 'other'` |
| `resolvedBy`, `resolvedAt` | string/ts \| null | manager resolution | Stamped when `varianceStatus` becomes `resolved` |
| `disputeStatus` | string | author / managers | `'none'` at create. Author may set `none → open`; managers move `open → under-review → resolved` |
| `commentCount` | number | comment writes | Denormalized; bumped by `increment(1)` (server-side, never off a stale cached value) in the same batch as each comment create. `lastCommentId` names that comment; rules require it to be a doc created in the same commit, so the counter can't be inflated without a real comment (M4) |
| `lastCommentAt` | timestamp \| null | comment writes | For sorting "needs attention" |

### 1.3 New subcollection: `vendors/{v}/entries/{e}/comments/{id}`

Append-only thread. No edits, no deletes — same trust posture as entries.

| Field | Type | Notes |
|---|---|---|
| `text` | string | ≤ 2000 chars |
| `kind` | string | `'comment'` (user text) or `'status'` (auto-written line like "Marked under review") |
| `by`, `byId`, `byRole` | string | Must match the writer's token claims |
| `ts` | timestamp | Server-side `new Date()` as elsewhere in the app |

### 1.4 New collection: `vendors/{v}/notes/{id}` (shift notes)

| Field | Type | Notes |
|---|---|---|
| `text` | string | ≤ 2000 chars |
| `by`, `byId`, `byRole` | string | From token claims |
| `locationId`, `locationName` | string | Same denormalization pattern as entries |
| `shift` | string \| null | `'open' \| 'close' \| null` |
| `pinned` | boolean | Managers only; pinned notes render first |
| `active` | boolean | Soft archive (managers); no hard delete |
| `ts` | timestamp | |

---

## 2. Feature specs

### 2.1 Blind count mode

**Behavior.** When `vendor.blindCounts` is true, the cash form hides the live "Expected in drawer" and "Over/short" readout for **everyone** (managers included — a control that only binds employees breeds resentment). The person enters start / sales / paid-out / counted as usual, then taps **Save & sign entry**, which shows a confirm sheet: *"You're committing a blind count. Entries can't be edited after saving."* On confirm, the entry saves with `blind: true`, and the result (balanced / over / short) is revealed on the post-save toast and in the log.

**Why reveal-after-commit is sound here:** entries are append-only (delete/edit blocked by rules), so the count is locked before the counter sees the target. That is the entire point of a blind count. No stricter "hide until manager verifies" mode in v1.

**Honest limitation to record in the README:** expected/diff are computed client-side at save (there is no server write path for entries). Blind mode is a UI-level control; a determined employee with dev tools could compute expected. The mitigation is the same as today — manager verification and append-only history. A server-computed variant is a tier-2 option if ever needed.

**Scratch form:** unchanged. Ticket counts have no "expected" to fudge toward; blindness doesn't apply.

**Screens.**
- Admin → Business settings: toggle "Blind counts" with helper text ("Counters can't see the expected total until after they commit the count").
- Cash form: readout block replaced by a neutral card ("Blind count — result shown after you save") when active; confirm sheet on save.
- Log rows: small "Blind" pill on entries with `blind: true`.

**Acceptance criteria.**
1. With the setting off, behavior is byte-identical to today.
2. With it on, no expected/diff value renders anywhere in the form DOM before save.
3. Saved entry stores correct `expected`, `diff`, `blind: true`, and (if applicable) `flagged`/`varianceStatus`.
4. EOD report and CSV show a blind indicator per entry. *(As built: the EOD report renders a Blind column, but the CSV export in `src/lib/utils.js` does not emit one — the CSV half of this criterion is unmet.)*

---

### 2.2 Variance thresholds + cause codes

**Behavior.** At cash-entry save, if `abs(diff) >= vendor.varianceThreshold`, set `flagged: true, varianceStatus: 'open'`; otherwise `flagged: false, varianceStatus: 'none'`. Managers work flagged entries through an inline **Resolution panel** on the entry: status select (`open / under-review / resolved`), cause code select, note field. Resolving requires a cause code; the client also writes a `kind:'status'` comment ("Resolved — training gap") in the same batch so the thread tells the story.

Managers may classify their own entries (small shops make self-investigation unavoidable); verification remains self-blocked as today. The EOD report and dashboard show who classified what.

**Screens.**
- Admin → Business settings: "Variance threshold" money input with helper text ("Counts off by this much or more get flagged for review").
- Log rows: red **Needs review** badge when `varianceStatus == 'open'`; amber when `under-review`; the existing over/short pill stays.
- Log filters: add a status filter (`All / Needs review / Under review / Resolved / Disputed`).
- Entry expanded view: Resolution panel (managers only) above the verify button.
- Dashboard: new stat cards — **Open variances**, **Open disputes**, **Unverified** — plus a "Needs attention" list (top 10 by recency: unresolved variances, unresolved disputes, unverified > 24h) linking into the Log. "Open" here means **unresolved** = status in `['open', 'under-review']` — the one definition shared with the digest and the period report (see `lib/utils.js` `UNRESOLVED`), so the three surfaces can't disagree.

**Acceptance criteria.**
1. Threshold change affects only entries saved afterward.
2. An entry cannot reach `resolved` without a `causeCode` (enforced by rules, §3).
3. Dashboard "Open variances" equals the count of unresolved variances (`varianceStatus in ['open', 'under-review']`) in the current view scope — the same `UNRESOLVED` definition the digest and period report use.
4. Cause-code distribution appears in the EOD report's flagged-items section.
5. The flag is not client-trust-only: a cash count at or beyond the threshold that is written as `varianceStatus: 'none'` (unflagged) is rejected by rules (`flagConsistent()`, §3), so a short can't be hidden from the queue at save time.

---

### 2.3 Dispute threads on entries

**Behavior.** Any entry can carry an append-only comment thread. The entry's **author** can open a dispute (`disputeStatus: none → open`) — the UI pairs this with a required first comment explaining why. Any member who can see the entry can comment. Managers move disputes to `under-review` / `resolved` (with a closing comment). Thread visibility inherits the entry's visibility (same per-location rules), so in per-location mode an employee never sees another location's disputes.

Comment create + `commentCount`/`lastCommentAt`/`lastCommentId` bump ship in **one Firestore batch** so the counter can't drift. The bump uses `increment(1)` (resolved server-side, so a stale cached count never drops or double-writes a comment — M7), and the entry-update rule requires `lastCommentId` to name a comment that did **not** exist before and **does** exist after the commit — a bare counter bump with no comment is refused (M4).

**Screens.**
- Log rows: comment icon + count; tap to expand the thread inline beneath the entry.
- Author view: "Dispute this count" button (visible when `disputeStatus == 'none'`); opens composer requiring text.
- Manager view: status chip is tappable → `under-review` / `resolved`.
- Thread: chronological; `status` comments render as muted system lines.

**Acceptance criteria.**
1. Only the entry's author can open a dispute; only managers can advance/close it.
2. Comments are immutable — no edit/delete path in UI or rules.
3. `commentCount` always equals the thread length — the counter can only move `+1` alongside a genuinely new comment in the same commit (rules-enforced, emulator-tested), so it can't be inflated on its own.
4. Per-location employees cannot read threads on other locations' entries (rules test).

---

### 2.4 Shift notes

**Behavior.** A lightweight logbook — the digital version of the counter notebook. Anyone posts a note tagged to a location (employees: locked to theirs) and optionally a shift. Managers can pin (renders first) and archive (`active: false`); nobody edits text after posting. Visibility mirrors entries: per-location mode scopes employees to their own location's notes.

**Screens.**
- New top-level tab **Notes** (at the time this shipped the tab bar was Cash / Scratch-offs / Log / Notes / Dashboard / Admin; later tiers grew it to nine tabs — Cash, Scratch-offs, Inventory, Log, Notes, Incidents, Time, Dashboard, Admin; it already h-scrolls on small screens).
- Composer at top: textarea, location select (locked for employees), shift select, Post button.
- Feed: pinned notes first with a pin glyph, then reverse-chron; each note shows author, location pill, shift pill, timestamp; manager overflow menu → Pin/Unpin, Archive.
- Location filter select when the viewer can see multiple locations.

**Acceptance criteria.**
1. Employee in per-location mode can neither read nor write notes for another location (rules test).
2. Pin/archive available to managers only; text immutable for everyone.
3. Notes count toward nothing in analytics (deliberately out of dashboard).

---

### 2.5 End-of-day PDF report

**Behavior.** On-demand, client-generated PDF via `@react-pdf/renderer` (dynamically imported so the ~0.5 MB library loads only on this screen). No server infrastructure. A print-friendly HTML view backs it up (browser print → PDF as fallback).

**Inputs:** date (default today), location (default "All" for managers, locked for per-location employees — though the button is manager/owner-only in v1).

**Report contents** (maps to the Z-report conventions from research):
1. Header: vendor logo + name, store code, location, date, "Generated by {name} at {timestamp}". *(As built, the header is text-only — `{vendor.name} — End of Day Report` — with no logo image; see AC#3.)*
2. **Cash drawers** table — one row per entry: drawer, shift, by, start, sales, paid-out, expected, counted, over/short (color-coded), blind flag, verified-by.
3. **Cash totals** row: sum of sales, paid-out, counted, net over/short.
4. **Scratch-offs** table: game, pack, price, start#→end#, sold, dollars, by, verified-by; totals row.
5. **Flagged & disputed** section: each open/under-review item with status, cause code (if any), last comment snippet.
6. **Verification summary**: X of Y entries verified.
7. Signature lines: "Prepared by ___" and "Reviewed by (manager) ___" with date blanks.

**Filename:** `eod-{storeCode}-{location|all}-{YYYY-MM-DD}.pdf`.

**Screens.** Dashboard gains a **Report** button → modal with date + location pickers, live preview list of what will be included, Download PDF / Print buttons.

**Acceptance criteria.**
1. Totals in the PDF match dashboard numbers for the same date/location filter.
2. Renders correctly with 0 entries (explicit "No activity recorded" body, still signable).
3. Logo failure falls back to text header (reuse the Logo fallback philosophy). *(As built, the header is text-only in all cases — no logo is ever attempted — so there is no logo-failure path.)*
4. Generation is client-only — works with no new env vars or accounts.

---

### 2.6 Scheduled email digest

**Behavior.** A daily email to the owner/managers summarizing yesterday. Requires two pieces of infrastructure the project doesn't have yet — a scheduler and an email sender:

- **Scheduler:** Vercel Cron hitting a new route `GET /api/cron/digest`. `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/digest", "schedule": "0 10 * * *" }] }
  ```
  (10:00 UTC ≈ 6:00 a.m. ET.) **Plan note:** Vercel Hobby limits cron to low frequency, so v1 is one fixed daily run for all vendors; a per-vendor send-hour (hourly cron + `sendHour` field) is a Pro-plan upgrade — the data model already tolerates adding `digest.sendHour` later.
- **Email:** Resend HTTP API (free tier is fine at this scale). New env vars: `RESEND_API_KEY`, `CRON_SECRET`, `DIGEST_FROM` (verified sender). The route rejects requests whose `Authorization` header ≠ `Bearer ${CRON_SECRET}`.

**Route logic (pseudocode):**
```
verify CRON_SECRET
today = per-vendor "yesterday" via digest.tz
for vendor in vendors where digest.enabled == true:
  if digest.lastSentDate == today: skip            // idempotent re-runs
  entries = adminDb entries where ts in [start,end) of yesterday (vendor tz)
  compose summary; if no recipients: skip
  send via Resend; set digest.lastSentDate = today
return counts { sent, skipped, failed }            // logged, non-fatal per-vendor
```
Admin SDK reads bypass rules (already the pattern in the auth routes).

**Digest contents:** per location — entry count, cash sales logged, net over/short (colored), shorts count, scratch dollars; then open variances, open disputes, unverified counts; closing line links to the app. Plain-text part + minimal HTML table; no attachments (the PDF stays on-demand). *(Later tiers added two more blocks the shipped email carries: an open-incidents count on the attention line and a "Patterns" section — see `tier-two-build-spec.md` §2.)*

**Screens.** Admin → Business settings gains a **Daily digest** card: enable toggle, recipients chip input, timezone select, "Last sent" readout, and a **Send test digest now** button (calls a `POST /api/digest/test` variant that requires an owner ID token instead of the cron secret).

**Acceptance criteria.**
1. Double-triggering the cron for the same date sends nothing twice.
2. A vendor with digest disabled or zero recipients is skipped silently.
3. Timezone honored: a 10:00 UTC run for a `America/Los_Angeles` vendor summarizes the correct local "yesterday".
4. Cron route returns 401 without the secret.

---

## 3. Security rule changes (`firestore.rules`)

**Vendor doc whitelist** grows:
```
allow update: if owner()
  && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['name','logoUrl','sharingMode','blindCounts','varianceThreshold','digest']);
```
(`digest.lastSentDate` is written by the Admin SDK, which bypasses rules — no client path needed.)

**Entries update** becomes five mutually exclusive branches (existing verification unchanged):
```
function verifyOnly() { /* existing rule, verbatim */ }

function investigate() {
  return mgr()
    // L9: the entry must already be in the queue — a manager can't fabricate a
    // resolution on a clean 'none' count or re-open a 'resolved' one.
    && resource.data.get('varianceStatus','none') in ['open','under-review']
    && request.resource.data.diff(resource.data).affectedKeys()
         .hasOnly(['varianceStatus','causeCode','causeNote','resolvedBy','resolvedAt'])
    && request.resource.data.varianceStatus in ['open','under-review','resolved']
    && (request.resource.data.varianceStatus != 'resolved'
        || (request.resource.data.causeCode != null
            && request.resource.data.resolvedBy == request.auth.token.name));
}

function disputeOpen() {
  return member()
    && resource.data.byId == request.auth.token.userId
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['disputeStatus'])
    && resource.data.get('disputeStatus','none') == 'none'
    && request.resource.data.disputeStatus == 'open';
}

function disputeManage() {
  return mgr()
    // L9: only a dispute an author actually opened can be advanced/closed.
    && resource.data.get('disputeStatus','none') in ['open','under-review']
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['disputeStatus'])
    && request.resource.data.disputeStatus in ['under-review','resolved'];
}

function commentBump() {
  return member()
    && request.resource.data.diff(resource.data).affectedKeys()
         .hasOnly(['commentCount','lastCommentAt','lastCommentId'])
    && request.resource.data.commentCount == resource.data.get('commentCount', 0) + 1
    // M4: the bump must accompany a comment created in THIS commit. lastCommentId
    // must name a doc that didn't exist before and does after — a bare +1 with no
    // comment (or one reusing an old comment) is refused. The batch shares one
    // request.auth, so that comment passed the comments create rule as this user.
    && request.resource.data.lastCommentId is string
    && !exists(/databases/$(database)/documents/vendors/$(vendorId)/entries/$(entryId)/comments/$(request.resource.data.lastCommentId))
    && existsAfter(/databases/$(database)/documents/vendors/$(vendorId)/entries/$(entryId)/comments/$(request.resource.data.lastCommentId));
}

// (each update branch is additionally gated on liveActive() — see the H2
// deactivation guard in tier-two §3.5)
allow update: if verifyOnly() || investigate() || disputeOpen() || disputeManage() || commentBump();
```

**Entries create** additionally requires clean initial state, and — as hardened in the trust-model pass — that the stored numbers can't be forged to hide a short:
```
&& request.resource.data.get('disputeStatus','none') == 'none'
&& request.resource.data.get('varianceStatus','none') in ['none','open']
&& request.resource.data.get('causeCode', null) == null
&& varianceConsistent()   // diff must equal counted - expected (±0.01)
&& flagConsistent()       // an over-threshold cash count must be signed 'open'
```

`varianceConsistent()` and `flagConsistent()` close the gap where a non-manager could sign a clean-looking count that hides a real short from the review queue, the owner digest, and the theft-pattern detectors — all of which trust the stored `diff`/`varianceStatus`:
```
// Cash/inventory entries carry counted/expected/diff; the stored diff must
// equal counted - expected (±0.01 to absorb float cents). Scratch is exempt.
function varianceConsistent() {
  return !(request.resource.data.kind in ['cash','inventory'])
    || (request.resource.data.diff is number
        && request.resource.data.counted is number
        && request.resource.data.expected is number
        && request.resource.data.diff >= request.resource.data.counted - request.resource.data.expected - 0.01
        && request.resource.data.diff <= request.resource.data.counted - request.resource.data.expected + 0.01);
}

// A cash count at or beyond the store's variance threshold must be signed as an
// OPEN variance — a client can't record a real short/over as 'none' and hide it
// from review. Reads the threshold from the vendor doc (default 5), mirrors
// CashForm's `abs(diff) >= threshold`, and fails OPEN when the threshold is
// misconfigured so a bad setting can never reject a legitimate count. Cash only
// (scratch has no diff; inventory auto-flagging is a later tier).
function cashVarianceThreshold() {
  return get(/databases/$(database)/documents/vendors/$(vendorId)).data.get('varianceThreshold', 5);
}
function flagConsistent() {
  return request.resource.data.kind != 'cash'
    || !(cashVarianceThreshold() is number)
    || !(request.resource.data.diff is number)
    || math.abs(request.resource.data.diff) < cashVarianceThreshold()
    || request.resource.data.get('varianceStatus','none') == 'open';
}
```

**Comments subcollection** (inherits parent-entry visibility; note: the read costs two extra `get()` reads — vendor + parent entry — which is fine at this scale):
```
match /comments/{commentId} {
  function parentEntry() {
    return get(/databases/$(database)/documents/vendors/$(vendorId)/entries/$(entryId)).data;
  }
  allow read: if member() && (
    mgr() || sharedAcrossLocations()
    || (request.auth.token.locationId != null
        && parentEntry().locationId == request.auth.token.locationId));
  allow create: if member()
    && request.resource.data.byId == request.auth.token.userId
    && request.resource.data.by == request.auth.token.name
    && request.resource.data.kind in ['comment','status']
    && request.resource.data.text is string
    && request.resource.data.text.size() > 0
    && request.resource.data.text.size() <= 2000;
  allow update, delete: if false;
}
```

**Notes collection** mirrors entries:
```
match /notes/{noteId} {
  allow read: if member() && (
    mgr() || sharedAcrossLocations()
    || (request.auth.token.locationId != null
        && resource.data.locationId == request.auth.token.locationId));
  allow create: if member()
    && request.resource.data.byId == request.auth.token.userId
    && request.resource.data.by == request.auth.token.name
    && request.resource.data.text.size() <= 2000
    && (mgr() || request.resource.data.locationId == request.auth.token.locationId)
    && request.resource.data.pinned == false
    && request.resource.data.active == true;
  allow update: if mgr()
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['pinned','active']);
  allow delete: if false;
}
```

---

## 4. Index additions (`firestore.indexes.json`)

```json
{ "collectionGroup": "notes", "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "locationId", "order": "ASCENDING" },
    { "fieldPath": "ts", "order": "DESCENDING" } ] }
```
Comments order by `ts` only (auto single-field index). Entry queries are unchanged. The dashboard's open-variance/dispute counts compute client-side from the already-subscribed entries — no new entry indexes.

---

## 5. New infrastructure & dependencies

| Item | Purpose | Cost note |
|---|---|---|
| `@react-pdf/renderer` (npm) | Client-side EOD PDF | Dynamic import; no server impact |
| Resend account + `RESEND_API_KEY` | Digest email delivery | Free tier sufficient; verify a sending domain |
| `CRON_SECRET`, `DIGEST_FROM` env vars | Cron auth + sender identity | — |
| `vercel.json` cron entry | Daily digest trigger | Hobby = fixed daily run; Pro unlocks per-vendor hours |
| Route: `GET /api/cron/digest` | Digest composer/sender (Admin SDK) | — |
| Route: `POST /api/digest/test` | Owner-triggered test send | Verifies token, ignores `lastSentDate` |

No changes to auth, claims, or the staff API.

---

## 6. Screen inventory (delta summary)

| Screen | Change |
|---|---|
| Admin → Business settings | + Blind counts toggle, variance threshold input, Daily digest card (enable, recipients, tz, test send) |
| Cash form | Blind-mode readout replacement + confirm sheet; post-save result toast |
| Log | Status filter; Needs-review/Under-review/Disputed/Blind pills; expandable comment thread; author "Dispute" action; manager Resolution panel + dispute status control |
| Notes (new tab) | Composer, pinned section, feed, location filter, manager pin/archive |
| Dashboard | + Open variances / Open disputes / Unverified stat cards; Needs-attention list; **Report** button |
| Report modal (new) | Date + location pickers, preview, Download PDF / Print |

---

## 7. Suggested build order & sizing

1. Settings fields + rules whitelist (S) — unblocks everything else.
2. Variance flagging + Resolution panel + dashboard cards (M).
3. Blind count mode (S–M) — pure UI once settings exist.
4. Dispute threads + comments subcollection + rules (M–L) — the largest rules surface; write rules-emulator tests here.
5. Shift notes tab (M).
6. EOD PDF (M–L) — isolated; can parallelize with 4–5.
7. Cron digest (M) — last, since it needs the Resend/Vercel account setup and reads the fields from step 1.

---

## 8. Decisions to confirm before build

1. **Blind counts apply to managers too** (spec'd yes, for fairness) — confirm.
2. **Dispute thread visibility = entry visibility** (all colleagues at the location can read). Alternative: author + managers only. Spec'd to the simpler inherited model — confirm.
3. **Default variance threshold $5** — confirm or set per your store's tolerance.
4. **Digest send time** fixed at ~6 a.m. ET for all vendors in v1 (Vercel Hobby constraint) — acceptable?
5. Cause-code list final? (`human-error, training-gap, equipment-fault, register-error, suspected-theft, other`)
