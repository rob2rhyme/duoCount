# DuoCount — Tier Two Build Spec

**Status:** built — incidents module, pattern-detection alerts, and login rate
limiting shipped. See §7 for what stays deferred to tier 3.

**Scope.** Three items from the tier-one spec's deferred list plus the
README's standing security note, chosen — as in tier one — for highest
trust-per-effort on the existing stack (Next.js App Router + Firestore +
custom-claim auth):

1. **Incident / write-up module** — documented personnel and store incidents
   with an employee acknowledgment step. The tier-one "video links" item folds
   in here as evidence links on an incident.
2. **Pattern-detection alerts** — the dashboard and daily digest surface
   recurring signals (repeat shorts by one person, a drawer that keeps coming
   up short, chronic unverified backlog, inventory shrink streaks) computed
   from the entry log.
3. **Login rate limiting** — the login route throttles repeated failed
   attempts, closing the PIN-guessing gap noted in the README before wide
   rollout.

**Compatibility rule (same as tier one):** every new field is optional with a
safe default; no backfill migration; nothing changes for existing data. The
incidents collection is new, pattern alerts are computed (no stored state),
and rate limiting is server-side only.

---

## 1. Incident / write-up module

### 1.1 Why it fits the product

DuoCount's trust posture is "every number has a name; nothing is edited after
the fact." Incidents extend that from numbers to events: a till procedure
violation, a safety issue, a customer altercation, a no-show. Today these live
in a manager's head or a paper file the employee never sees. Here, a write-up
is signed by the manager who wrote it, shown to the employee it concerns, and
carries the employee's acknowledgment and response on the same permanent
record — the dispute-thread philosophy applied to personnel documentation.

### 1.2 Data model — new collection `vendors/{v}/incidents/{id}`

| Field | Type | Set when | Rules |
|---|---|---|---|
| `title` | string | create | 1–120 chars |
| `text` | string | create | 1–4000 chars; immutable after create |
| `category` | string \| null | create | `cash-handling \| till-procedure \| policy \| safety \| customer \| attendance \| other` (client-enforced enum; informational) |
| `severity` | string | create | `note \| warning \| serious` (rules-enforced) |
| `subjectId`, `subjectName` | string \| null | create | The staff member the incident concerns. `null` = general store incident (break-in, equipment damage) with no subject |
| `entryId` | string \| null | create | Optional link to a related log entry |
| `links` | string[] | create | Evidence URLs (camera footage, photos, receipts); ≤ 5, each ≤ 500 chars, `http(s)` only (client-validated); rules cap the list size |
| `locationId`, `locationName` | string | create | Same denormalization as entries |
| `by`, `byId`, `byRole` | string | create | Must match the writer's token claims |
| `status` | string | lifecycle | `open → acknowledged → closed` (or `open → closed` if the subject never acks). Forward-only |
| `ackAt` | timestamp \| null | subject ack | Stamped when the subject acknowledges |
| `ackNote` | string \| null | subject ack | ≤ 1000 chars — the employee's side, on the record |
| `closedBy`, `closedAt` | string/ts \| null | manager close | Stamped at close |
| `ts` | timestamp | create | |

### 1.3 Visibility — deliberately narrower than entries

Write-ups are personnel records, so they do **not** inherit the entry/notes
location-visibility model. Managers and owners read everything; an employee
reads only incidents where **they are the subject**. Coworkers never see each
other's write-ups, in either sharing mode. General (subject-less) incidents
are manager-facing documentation and invisible to employees.

### 1.4 Lifecycle

- **Create** (managers only): status starts `open`, ack/close fields null.
- **Acknowledge** (subject only, once, while `open`): sets
  `status: 'acknowledged'`, `ackAt`, and optionally `ackNote`. Acknowledging
  means *"I have seen this"*, not *"I agree"* — the UI says so, and the
  `ackNote` is where disagreement goes. The note is immutable once posted.
- **Close** (managers, from `open` or `acknowledged`): sets `status: 'closed'`,
  `closedBy`, `closedAt`. Closing an unacknowledged incident is allowed (the
  subject may refuse, or may no longer work there).
- No edits to the text, ever; no deletes, ever — same as entries.

### 1.5 Security rules

```
match /incidents/{incidentId} {
  allow read: if mgr()
    || (member() && resource.data.subjectId == request.auth.token.userId);
  allow create: if mgr()
    && identity matches token (by/byId)
    && title 1–120, text 1–4000, severity in enum
    && status == 'open' && ackAt/ackNote/closedBy null
    && links.size() <= 5;
  allow update: if ackOwn() || closeIncident();   // exact-field branches, §1.4
  allow delete: if false;
}
```

(Full rules in `firestore.rules`; emulator tests cover create/read/ack/
close/immutability — see §6.)

### 1.6 Index

`incidents(subjectId ASC, ts DESC)` — the employee "my incidents" query.
Managers order by `ts` alone (auto index).

### 1.7 Screens

- New top-level tab **Incidents** (the tab bar already h-scrolls).
- **Managers:** composer card (title, subject select from active staff or
  "General — no subject", severity, category, location, narrative, evidence
  links one-per-line) + full feed with status pills, filterable by status.
  Close button on open/acknowledged incidents.
- **Employees:** their own incidents only, newest first, with a prominent
  **Acknowledge** action (optional response textarea) on open ones. Empty
  state: "Nothing on file."
- Feed rows show: severity pill (note = neutral, warning = amber,
  serious = red), status pill, subject, author, location, timestamp, evidence
  links, and the acknowledgment line (`Acknowledged by {name} {date}` + note)
  once present.

### 1.8 Acceptance criteria

1. An employee can read, and receives live updates for, exactly the incidents
   where they are the subject — and nothing else (rules test).
2. Only the subject can acknowledge, only once, and only the ack fields
   change (rules test).
3. Managers can create and close; employees can do neither (rules test).
4. Incident text is immutable and undeletable for everyone (rules test).
5. The daily digest's attention line includes the open-incident count.

---

## 2. Pattern-detection alerts

### 2.1 Behavior

A pure function scans the already-subscribed entry log (no new reads, no
stored state) and returns alerts for six recurring-signal patterns, windowed
by the entry's business `date`. Defaults shown; all six honor the per-vendor
thresholds below.

| Pattern | Window | Trigger (default) | Severity |
|---|---|---|---|
| **Repeat shorts — person** | 14 days | ≥ 3 short cash counts by the same person | `high` if total short ≥ $20, else `medium` |
| **Repeat overs — person** | 14 days | ≥ 3 over cash counts by the same person | `high` if total over ≥ $20, else `medium` |
| **Drawer hot-spot** | 14 days | ≥ 3 short cash counts on the same drawer by ≥ 2 different people | `medium` (points at process/equipment, not a person) |
| **Verification backlog** | all | ≥ 5 unverified entries older than 48 h | `medium` |
| **Open-variance backlog** | all | ≥ 5 entries flagged `open` and older than 48 h | `medium` (already flagged — nobody's closing them) |
| **Inventory shrink streak** | 14 days | ≥ 3 short counts of the same item | `medium`, with total units missing |

### 2.1a Per-vendor thresholds (tier-3)

Thresholds default to the `PATTERN_RULES` constants in `lib/patterns.js` but are
now **tunable per vendor** in Admin → Business settings → **Alert sensitivity**
(owner-only). Five knobs: lookback window (days), repeat-count to flag (drives
both the short and over person streaks), high-severity dollar total,
open/unverified backlog size, and the "stale after" hours for the two backlog
detectors.

- `detectPatterns(entries, { now, rules })` takes an optional `rules` override;
  `resolvePatternRules(raw)` coerces the stored/entered values into safe bounds
  (empty/non-numeric → default; out of range → clamped, never a value that
  disables a detector or explodes a query window). Stored on the vendor doc as
  `patternRules`; the Firestore rule's owner-only key allow-list includes it.
- The Dashboard passes the vendor's rules; the digest resolves them once and
  uses the configured **lookback** for both its trailing-window query and its
  "last N days" copy, so query, detectors, and email always agree.

**Ethics note, deliberately in the spec:** an alert is a signal to start a
conversation, not a verdict. The UI copy says so ("Signals worth a look — not
conclusions"), the person-pattern alert never renders for employees, and the
existing cause-code flow (equipment fault, register error, training gap) is
the intended resolution path. A short streak can be a sticky drawer as easily
as a hand in the till — which is exactly why the drawer hot-spot detector
exists alongside the person detector.

### 2.2 Where alerts appear

- **Dashboard (managers/owners only):** a "Patterns" card between the
  attention counters and the charts, listing each alert with a severity pill.
  Hidden when there are no alerts and from employees always.
- **Daily digest:** a "Patterns" section listing the same alerts, computed
  server-side from the trailing 14 days of entries (the digest route already
  reads with the Admin SDK; it fetches `date >= today−14d` once and derives
  both yesterday's summary and the patterns from that single query). The
  digest also gains an **open incidents** count on its attention line.

### 2.3 Acceptance criteria

1. `detectPatterns` is pure and isomorphic — same code runs in the Dashboard
   and in the digest route; unit-testable without Firebase.
2. Employees never see the Patterns card.
3. A vendor with quiet, verified books produces zero alerts (no noise floor).
4. Digest with no alerts omits the section entirely.

---

## 3. Login rate limiting

### 3.1 Behavior

The login route keeps fixed-window failure counters in a top-level
`loginAttempts` collection (Admin SDK only — the collection matches no client
rule, so Firestore's default-deny hides it entirely). **Two limiters run
together** and a `429` is returned if *either* trips, *before* any credential
work runs:

- **Per IP** (`ip_{ip}`) — **10 fails / 15 min**. Stops one machine hammering.
- **Per store** (`store_{slug}`) — **50 fails / 15 min** (tier-3 hardening). A
  backstop against a *distributed* attack that rotates IPs to slip under the
  per-IP cap. The cap sits well above what a busy store's honest typos reach,
  so real staff aren't affected; it only bites during an actual attack.

Both counters:
- count wrong store code *and* wrong PIN as failures;
- **auto-expire** — once the window's `windowStart` is older than 15 min the
  count resets, so a key is **never locked permanently** (a burst blocks only
  until the window rolls);
- are **both cleared on any successful sign-in** (a store's staff share the
  shop Wi-Fi IP; one person's typos shouldn't lock out the shift).

The IP comes from the first hop of `x-forwarded-for` (set by Vercel). The
decision — blocked? what to write on failure? — is a pure function,
`throttleDecision`, in `lib/login-throttle.js`, unit-tested in
`tests/auth.test.mjs` (`npm run test:auth`).

### 3.2 Sizing the guard

**Newly set PINs are now 6 digits** (`lib/pin.js`, enforced in the signup and
staff routes and the client inputs) — a 1,000,000-value space, 100× the old
4-digit floor and the single biggest brute-force win for a numeric PIN. Existing
4–5 digit pins still verify at sign-in (the salted hash doesn't encode length),
so this is a forward policy that never locks a current user out.

At 10 tries / 15 min per IP against a 6-digit space, an exhaustive sweep from one
IP takes on the order of *years*; the per-store cap bounds a distributed sweep to
50 guesses / 15 min no matter how many IPs it rotates through. The per-store
lockout is a deliberate DoS trade-off (an attacker actively flooding a store can
keep its window tripped), but it auto-recovers within minutes of the flood
stopping and never requires a manual unlock.

### 3.3 Cost & cleanup

One extra read per login attempt, one write per failure, one delete per
success. Stale counter docs are harmless residue (they expire logically with
the window); a Firestore TTL policy on `windowStart` is an optional
console-side cleanup, noted in the README.

### 3.4 Acceptance criteria

1. The 11th failure inside 15 minutes returns 429 without touching user docs.
2. A success clears the counter for that IP.
3. A new window (> 15 min later) starts counting from 1.
4. Clients cannot read or write `loginAttempts` (default-deny; no rule added).

---

## 4. Files touched

| File | Change |
|---|---|
| `firestore.rules` | `incidents` match block (read scope, create validation, ack/close branches) |
| `firestore.indexes.json` | `incidents(subjectId, ts DESC)` composite |
| `src/lib/data.js` | `watchIncidents`, `addIncident`, `ackIncident`, `closeIncident` |
| `src/lib/patterns.js` | `detectPatterns(entries, { now, rules })` + `PATTERN_RULES` + `resolvePatternRules` (per-vendor tuning + 6 detectors) |
| `src/components/IncidentsPanel.js` | **new** — composer + feed + ack/close |
| `src/components/AppShell.js` | Incidents tab + subscription |
| `src/components/Dashboard.js` | Patterns card (manager-only) |
| `src/lib/digest.js` | patterns section + open-incidents line in the email |
| `src/app/api/cron/digest/route.js` / `api/digest/test` | via `sendDigestForVendor`: 14-day entry fetch + incidents count |
| `src/app/api/auth/login/route.js` | dual (per-IP + per-store) rate limiter via `lib/login-throttle.js` |
| `src/lib/login-throttle.js` / `src/lib/pin.js` | **new** — pure throttle decision; shared 6-digit PIN policy |
| `src/app/api/auth/signup/route.js`, `api/staff/route.js` | 6-digit PIN validation (`isValidNewPin`) |
| `tests/rules.test.mjs`, `tests/auth.test.mjs` | incidents suite; PIN + throttle unit suite |

No new dependencies. No new env vars. No auth/claims changes.

---

## 5. Screen inventory (delta)

| Screen | Change |
|---|---|
| Incidents (new tab) | Manager composer + feed with close; employee "my incidents" + acknowledge |
| Dashboard | Patterns card (managers only) |
| Digest email | Patterns section; open-incidents count |
| Login | 429 path with friendly copy |

---

## 6. Test plan

Rules-emulator additions (`npm run test:rules`):

1. Manager creates a write-up; employee create is denied.
2. Subject reads own incident; another employee is denied; manager reads all.
3. Create must start clean (`status: 'open'`, null ack/close fields) and
   respect the links cap.
4. Subject acknowledges once with note; second ack denied; non-subject ack
   denied; ack cannot smuggle a text edit.
5. Manager closes; employee close denied; text immutable; delete denied for
   everyone.

`detectPatterns` is exercised by a small pure-function test
(`tests/patterns.test.mjs`, plain `node --test`, no emulator needed).

---

## 7. Explicitly out of scope (tier 3)

- **Scheduling / time clock and payroll exports** — a different product
  surface (labor management) with heavy compliance implications; revisit only
  if customers pull for it.
- ~~**Per-vendor pattern thresholds** and additional detectors~~ — **done**
  (§2.1 / §2.1a): five tunable thresholds in Admin, plus the repeat-overs and
  open-variance-backlog detectors. Still deferred: escalating variance *trends*
  and scratch settle-shortfall patterns.
- ~~**Per-user login lockout + 6-digit PIN default**~~ — **done** (§3): 6-digit
  PIN policy on all new/changed pins, plus a per-store failure limiter alongside
  the per-IP one. ("Per-user" is realized as per-store, since the login can't
  identify the user until the PIN matches.)
- **Server-computed blind counts** (tier-one README limitation).
- **State-lottery settlement-file reconciliation** (pack-lifecycle spec).
