---
title: Time clock & scheduling
---

# DuoCount — Time Clock & Scheduling Spec

**Status:** built. The **Time** tab has two views (a segmented control):
**Time clock** (staff clock in/out; managers get hours-by-employee + payroll CSV)
and **Schedule** (managers roster shifts; everyone sees their own upcoming
shifts). Together they cover the "scheduling / time-clock / payroll exports"
tier-3 item.

**Why.** The time clock came first — you need punch data before hours or payroll
mean anything — and scheduling builds on it: the roster is reconciled against the
actual punches to surface no-shows. The two share the Time tab and a design
(append-only *record* vs editable *plan*).

## Model — append-only punches

A punch is one immutable document under `vendors/{v}/timeclock`, signed by the
employee, exactly like entries, incidents, and notes:

```
{ userId, userName,          // == the token's userId / name (signed)
  locationId, locationName,  // where the shift is worked (nullable)
  type: "in" | "out",
  ts,                        // serverTimestamp() — pinned to the server clock
  day }                      // YYYY-MM-DD business date
```

There is **no edit and no delete**. A mistake is corrected by punching again —
the same trust model as the rest of the app ("every count, countersigned"). This
keeps the clock an honest audit trail rather than an editable timesheet.

**`ts` is the server's clock, not the client's.** `ts` is the hours-bearing
field — worked time is `out.ts − in.ts` — so a client-chosen value would let an
employee back- or forward-date a punch to inflate paid hours. The client writes
a `serverTimestamp()` sentinel and the rule pins it: `request.resource.data.ts
== request.time`. A punch carrying any client `Date` (not the sentinel) is
rejected at the rules layer (emulator-tested). `day` stays the client's
business-day label, used only for reconciliation grouping — it bears no hours,
so it isn't pinned.

## Pairing — `lib/timeclock.js` (pure, isomorphic)

The component and the tests share one pure module (no Firebase imports), so the
aggregation is unit-tested under plain `node` with no emulator:

- **`computeShifts(punches)`** sorts each user's punches by time and pairs
  `in`→`out` into shifts. It is deliberately forgiving of the messy real world:
  - a **forgotten clock-out** (two `in`s in a row) closes the earlier shift as
    **open** — it contributes **no hours**;
  - an **orphan `out`** (nothing open) is ignored;
  - a still-running shift is returned with `open: true`, `ms: null`.
  A missed punch never invents or corrupts paid time.
- **`summarizeHours(punches, { fromMs, toMs })`** totals worked hours per user
  over a window (a shift counts if it *started* in range); open shifts add
  nothing. Hours are rounded to 2 dp.
- **`openShiftFor`**, **`formatDuration`**, **`hoursDecimal`** support the UI.
- **`applyCorrections(rows)`** folds manager corrections into an effective punch
  list *without mutating the originals* (see "Punch corrections" below);
  `computeShifts` runs it first, so shifts, hours, and the report all reflect a
  correction automatically. Each shift also carries `inId` / `outId` (the effective
  punches, for targeting a correction) and a `corrected` flag.

Unit tests: `tests/timeclock.test.mjs` (`npm run test:timeclock`) — clean pairing,
forgotten clock-out, orphan out, per-user isolation, out-of-order punches, window
filtering, malformed-punch tolerance, Firestore-style timestamp coercion, and the
correction cases (edit a time, add a forgotten in/out, void a stray punch,
newest-wins re-correction, void-after-edit, harmless no-ops, payroll reflects it).

## Punch corrections — append-only supersede

Punches are immutable, so a manager never *edits* one. Instead they file a
separate **correction record** in the same `timeclock` collection that supersedes
a punch — the original and the correction both stay on the record (the same
resolve-by-append pattern as variances and incidents). A correction carries
`kind:"correction"` and one of:

- **`edit`** (`targetId` + `at` [+ `type`]) — override a punch's effective time
  (an employee clocked out at the wrong minute);
- **`add`** (`type` + `at`) — introduce a punch the employee missed (a forgotten
  clock-in or clock-out);
- **`void`** (`targetId`) — drop a stray punch (an accidental double clock-in).

`at` is the manager-chosen *effective* time; `ts` is the server audit clock (when
the correction was filed) and also the apply order, so a later correction to the
same punch wins. `applyCorrections` folds them in oldest-first. Nothing is ever
mutated or deleted, so the audit trail is intact and the change is fully
attributed (who corrected, when, why).

## UI — the "Time" tab

- **Everyone:** a status card (⏱ *On the clock · 3h 12m* / *Clocked out*) with a
  single full-width **Clock in / Clock out** button (the running duration ticks
  every 30 s), and a short list of the user's recent closed shifts.
- **Managers / owners:** *Hours by employee* over a 7 / 14 / 30-day window
  (sticky-header table + total row) and an **Export payroll CSV** button
  (employee, shifts, hours, period, export timestamp). The window is a **trailing**
  one anchored to *now*, so it keeps sliding as the live-duration tick re-renders
  — a shift that ages out of the window drops off without a manual refresh. The
  payroll CSV runs every cell through the shared `csvCell` formula-injection guard.
- **Managers / owners — *Timesheet & corrections*:** the store-wide shifts over
  the same window, each with a **Correct** action (adjust the clock-in / clock-out
  time, or **Void** the shift) and a top-level **+ Add punch** (pick employee,
  in/out, time) for a fully missed punch. Every action requires a **reason** and
  files an append-only correction (`TimesheetCorrections` in `TimeClock.js` →
  `addPunchCorrection`); a corrected shift shows a **corrected** pill.

## Security — `firestore.rules`

`match /timeclock/{punchId}`:
- **read:** managers/owners see the whole store; an employee sees only rows where
  `userId == token.userId`.
- **create — two branches:**
  - *(a) self-punch:* `member()`, self-signed (`userId`/`userName` == token),
    `type in ['in','out']`, `ts == request.time`, and — for employees — at their
    own `locationId` (managers may punch anywhere). Must carry **no** `kind`.
    Mirrors the entries authorship rule.
  - *(b) manager correction:* `mgr()` and `kind == 'correction'`,
    `action in ['edit','add','void']`, manager-signed (`byId`/`byName` == token),
    a non-empty `reason`, and `ts == request.time`. The effective time `at` is
    manager-chosen (that is the point of a correction) — safe because it's
    manager-only, signed, reasoned, and append-only; the audit `ts` is still
    server-pinned so it can't be back-dated.
- **update / delete:** `false` (append-only — corrections included).

A composite index `timeclock(userId ASC, ts DESC)` backs the employee's
own-punches query (`firestore.indexes.json`).

## Scheduling (the roster)

A **schedule** is a *plan*, not an audit trail — so unlike a punch it is
editable and deletable. Managers roster shifts; everyone sees their own.

**Model** — `vendors/{v}/schedule`, one doc per scheduled shift:
`{ userId, userName, locationId, locationName, date (YYYY-MM-DD),
start/end ("HH:MM"), by/byId (the manager), ts }`.

**Pure core** — `lib/schedule.js` (isomorphic, unit-tested in
`tests/schedule.test.mjs`, `npm run test:schedule`):
- **date helpers** on `YYYY-MM-DD` strings with UTC math (no `Date.now`):
  `weekStartMonday`, `weekDates`, `addDays`.
- **`shiftMinutes`** — duration from `HH:MM`, treating `end <= start` as an
  **overnight** shift (+24 h).
- **`scheduledHours`** — hours per employee over a date range.
- **`findOverlaps`** — ids of shifts that **double-book** one employee
  (back-to-back does not count). Shifts are compared as **absolute intervals**
  (date + time) per employee — not per day — so a long shift that swallows a
  later, non-adjacent one is caught, and an **overnight** shift is checked across
  midnight too (Mon 22:00–06:00 collides with Tue 05:00–13:00).
- **`crossesMidnight`** — does a shift straddle two calendar days (`end <=
  start`, the same convention `shiftMinutes` uses for +24 h)?
- **`reconcile`** — day-level **attendance**: it lines each scheduled shift up
  against the actual punches *by business `day` string* (so no timezone math),
  over the elapsed days only, and returns worked / no-show / unscheduled. This
  is the payoff of having both halves. **Overnight shifts** straddle two business
  days — the clock-out (and a past-midnight clock-in) stamps the *next* day — so
  an overnight shift also accepts a next-day punch as attendance, and that next
  day isn't reported as "worked but not scheduled". Day shifts still never match
  a following-day punch.
- **`copyShiftsToWeek`** — shifts a set of shifts by an offset (a week) into new
  specs, **skipping any that already exist** (employee + new date + start), so
  "copy last week" is idempotent. An **open** (unassigned) shift carries its
  `open: true` flag into the copy, so the null-user spec still satisfies the
  create rule.
- **`weekShiftsToTemplate` / `templateToShifts`** — save a week as a reusable
  pattern (specs keyed by day-of-week 0-6, dates/ids/swap-state stripped) and
  stamp it onto any target week (dedup-aware, so applying twice is idempotent).
  Open shifts round-trip: the template preserves `open`, and stamping re-emits
  `open: true` for a null-user spec.
- **`availabilityConflicts` / `isUnavailable`** — flag scheduled shifts (or a
  form selection) that land on a date the employee marked unavailable. An
  overnight shift also conflicts when it **spills into** an unavailable next day
  (Mon 22:00–06:00 runs into Tuesday, so a Tuesday day-off blocks it).
- **`lateArrivals`** — time-level **lateness**: scheduled shifts whose paired
  clock-in ran more than `graceMin` (default 10) past the scheduled start, with
  the minutes. Pairing is deliberately simple: everything is compared in
  absolute business-day + local-clock minutes (so an overnight arrival past
  midnight needs no special case); each shift takes the employee's **nearest
  unused in-punch**, and a punch only pairs within the shift's own duration —
  an unrelated punch never pairs, a shift with no plausible punch is
  `reconcile`'s no-show (not "late"), and early arrivals are never flagged.
  Local-clock time-of-day is used on purpose: it matches how the punch's `day`
  label is stamped, and staff + manager share the store's timezone.

**UI** — the **Schedule** view:
- **Managers:** a week navigator; an add-a-shift form (employee — or **Open shift
  (unassigned)** — / date / start / end / optional location) that **warns** when
  the chosen employee marked that day off (override allowed), and **rejects a
  shift whose start equals its end** (which would otherwise be read as a 24 h
  overnight shift); a roster grouped by
  day with a per-shift delete, a gold **Overlap** flag and a red **Unavailable**
  flag (open shifts show a gold *Open shift* label); a one-click **Copy last
  week** (dedup-aware, batch write); **Week templates** (save the current week,
  apply a saved one to any week); a *Scheduled hours this week* table; and an
  *Attendance so far* readout (worked / no-show / unscheduled / **late arrivals**
  — the late list names each person with the day, scheduled start, and minutes
  past the 10-minute grace).
- **Everyone:** *Your upcoming shifts*, **Days you can't work** (mark/remove the
  dates you're unavailable), and a **Shifts up for grabs** board — open shifts a
  manager posted (grab them directly) and coworkers' swap offers.

**Open shifts.** A manager can post an **unassigned** shift (`userId: null`,
`open: true`) that any employee **grabs directly** — no approval, since the
manager posted it wanting coverage; the first to claim it gets it. (Contrast
swaps, which need approval because someone is giving up an *assigned* shift.)
Unassigned shifts are excluded from the hours, overlap, and attendance-no-show
math (they aren't anyone's yet).

**Publish & notify.** A manager clicks **Publish & notify** on a week and each
employee who has a shift *and* an **email on file** gets emailed their shifts for
that week; the week nav then shows *Published · notified N* (re-publish after
changes). Staff emails are an **optional** field set in Admin (Set / Edit email
per person, or on the add-staff form). The email build is a pure function
(`lib/schedule-notify.js` → `buildScheduleEmails`, unit-tested in
`tests/schedule-notify.test.mjs`) — one email per employee, shifts combined and
sorted, open shifts skipped, employees without an address skipped. The server
route `POST /api/schedule/publish` (manager/owner; shared `requireManager`
guard) queries the week, sends via the same **Resend** path as the digest
(`lib/digest.js`), and records `schedulePublished/{weekStart}`
(`{ weekStart, weekEnd, publishedAt, publishedBy, notified, recipients }`) — **manager-read,
server-write only** (`allow write: if false`, written by the Admin SDK).

**Security** —
- `match /timeclock/{punchId}`: managers read the whole store, an employee reads
  only their own; create is self-signed (`userId`/`userName` == token), a valid
  `type` (`in`/`out`), at the employee's own location (managers anywhere), and
  **`ts == request.time`** so the hours-bearing punch time is the server clock,
  not a client value; **no update, no delete** (append-only).
- `match /schedule/{shiftId}`: managers read/manage the whole roster; an
  employee reads their own shifts **plus any shift up for a swap**
  (`swapStatus != none`) **or open** (`open == true`) so they can pick it up.
  Create is manager-only and manager-signed (`by`/`byId` == token) — either an
  assigned shift (`userId` a string) or an **open** one (`userId` null +
  `open:true`); delete is manager-only; **update** is manager-anything OR one of
  the four employee swap transitions below, OR **`claimOpen`** — an employee
  assigns an open shift to themselves (`userId`/`userName` == token, `open`→false;
  those three keys only).
- `match /availability/{id}`: employees create their **own** unavailable dates
  (self-signed) and either the owner or a manager may delete one; managers read
  everyone's; **no updates** (remove and re-add). Immutable-once-set, like the
  rest of the app's authored records.
- `match /templates/{id}`: **manager-only** read and write — a planning tool,
  not employee-facing (templates are applied to produce real schedule shifts).
- `match /schedulePublished/{weekStart}`: **manager-read, server-write only**
  (`allow write: if false`) — the publish route writes it via the Admin SDK.
- Indexes: `schedule(userId ASC, date ASC)`, `schedule(swapStatus ASC, date ASC)`
  (the swap board), `schedule(open ASC, date ASC)` (the open-shift board), and
  `availability(userId ASC, date ASC)`.
- **Rules coverage:** the `timeclock`, `schedule` (every swap transition + open
  shift create/claim), `availability`, `templates`, and `schedulePublished` rules
  are exercised against the Firestore emulator in `tests/rules.test.mjs`
  (`npm run test:rules`) — read scope, self-signing, immutability, and each
  allowed/denied actor.

### Shift swaps

An employee gives up a shift, a coworker claims it, a manager approves the trade.
A scheduled shift carries `swapStatus` (`none` → `offered` → `claimed`) plus
`claimedById`/`claimedByName`. The **state machine is a pure module**
(`lib/swaps.js`, unit-tested in `tests/swaps.test.mjs`, `npm run test:swaps`) that
both the UI and the Firestore rules mirror, so they can't disagree:

| Transition | Who | Effect |
| --- | --- | --- |
| offer | shift owner | `none → offered` |
| cancel offer | shift owner | `offered → none` |
| **claim** | any coworker (not the owner) | `offered → claimed`, records the claimer |
| withdraw claim | the claimer | `claimed → offered` |
| **approve** | manager | `claimed → none` and **reassigns** the shift to the claimer |
| reject | manager | `offered`/`claimed` → `none`, owner keeps it |

- `availableActions(shift, {userId, isManager})` returns the actions to render;
  `applySwap(shift, action, actor)` returns the exact field patch (or `null`) —
  and its patches match the rules' `affectedKeys` allow-lists. **Managers
  supervise** swaps (approve/reject) and don't claim through this flow — a manager
  who wants an open shift just edits the roster.
- The Firestore `update` rule adds four employee branches (`swapOffer`,
  `swapCancel`, `swapClaim`, `swapWithdraw`), each locked to the exact state,
  actor, and field set; `mgr()` still covers approve/reject (an approve is a
  manager write that reassigns `userId`).
- **UI:** employees see swap actions on their own shifts and a **Shifts up for
  grabs** board (offered coworker shifts to claim + their own pending claims);
  managers see **Offered** / **Claimed by …** pills on the roster with
  **Approve** / **Reject**.

## Deliberately out of scope (future)

Copy-last-week, week templates, availability, shift swaps, open-shift claim,
publish/notify, and **manager punch correction** are all built (see above). Still
deferred:

- ~~**Time-level lateness**~~ — **done** (`lateArrivals`, see the lib section):
  arrivals more than a 10-minute grace past the scheduled start surface on the
  Attendance card. Deliberately simple pairing (nearest in-punch within the
  shift's duration, each punch used once); a per-vendor grace knob stays a
  future option if owners ask.
- ~~Overnight shifts straddling two calendar days in the overlap check /
  reconciliation~~ — **done**: overlap runs on absolute intervals,
  reconciliation accepts an overnight shift's next-day punches, and availability
  sees the spill day (see the lib section above).
- **Breaks / unpaid time, overtime rules, rounding policies, pay rates** — real
  payroll math is jurisdiction- and employer-specific; the CSV exports raw
  paired hours for a payroll system to apply its own rules.
- **Approval / lock of a pay period.**
