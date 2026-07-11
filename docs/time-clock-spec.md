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
  ts,                        // when the punch happened
  day }                      // YYYY-MM-DD business date
```

There is **no edit and no delete**. A mistake is corrected by punching again —
the same trust model as the rest of the app ("every count, countersigned"). This
keeps the clock an honest audit trail rather than an editable timesheet.

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

Unit tests: `tests/timeclock.test.mjs` (`npm run test:timeclock`) — clean pairing,
forgotten clock-out, orphan out, per-user isolation, out-of-order punches, window
filtering, malformed-punch tolerance, and Firestore-style timestamp coercion.

## UI — the "Time" tab

- **Everyone:** a status card (⏱ *On the clock · 3h 12m* / *Clocked out*) with a
  single full-width **Clock in / Clock out** button (the running duration ticks
  every 30 s), and a short list of the user's recent closed shifts.
- **Managers / owners:** *Hours by employee* over a 7 / 14 / 30-day window
  (sticky-header table + total row) and an **Export payroll CSV** button
  (employee, shifts, hours, period, export timestamp).

## Security — `firestore.rules`

`match /timeclock/{punchId}`:
- **read:** managers/owners see the whole store; an employee sees only rows where
  `userId == token.userId`.
- **create:** `member()` and the punch must be self-signed
  (`userId`/`userName` == token), `type in ['in','out']`, and — for employees —
  at their own `locationId` (managers may punch at any location). Mirrors the
  entries authorship rule.
- **update / delete:** `false` (append-only).

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
- **`findOverlaps`** — ids of shifts that **double-book** one employee on a day
  (back-to-back does not count).
- **`reconcile`** — day-level **attendance**: it lines each scheduled shift up
  against the actual punches *by business `day` string* (so no timezone math),
  over the elapsed days only, and returns worked / no-show / unscheduled. This
  is the payoff of having both halves.

**UI** — the **Schedule** view:
- **Managers:** a week navigator, an add-a-shift form (employee / date / start /
  end / optional location), a roster grouped by day with a per-shift delete and a
  gold **Overlap** flag, a *Scheduled hours this week* table, and an *Attendance
  so far* readout (worked vs no-show vs unscheduled, with the no-show list).
- **Everyone:** *Your upcoming shifts* — the employee's own future shifts.

**Security** — `match /schedule/{shiftId}`: managers read/manage the whole
roster; an employee reads only their own. Create is manager-only and
manager-signed (`by`/`byId` == token); **update/delete are manager-only** (a plan
changes). Backed by a `schedule(userId ASC, date ASC)` index.

## Deliberately out of scope (future)

- **Manager punch correction** — an admin editing/inserting a *punch* for someone
  who forgot. Kept out to preserve the append-only guarantee; the clean path is a
  manager-signed corrective punch (a create, not an edit).
- **Availability, shift swaps, open-shift claim, recurring templates, publish/
  notify** — richer rostering workflow beyond assign-and-view.
- **Time-level lateness** and overnight shifts that straddle two calendar days in
  the overlap check (reconciliation and overlap are day-scoped).
- **Breaks / unpaid time, overtime rules, rounding policies, pay rates** — real
  payroll math is jurisdiction- and employer-specific; the CSV exports raw
  paired hours for a payroll system to apply its own rules.
- **Approval / lock of a pay period.**
