---
title: Time clock
---

# DuoCount — Time Clock Spec

**Status:** built (MVP). Staff clock in / out from the **Time** tab; managers see
hours by employee and export a payroll CSV. Rostering / shift *scheduling* is
deliberately out of this cut (see below).

**Why.** "Scheduling / time-clock / payroll exports" was a deferred tier-3 item.
The time clock is the foundation of the three — you need punch data before hours
or payroll mean anything — so this MVP ships that spine end-to-end and leaves the
planning side (assigning future shifts) for later.

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

## Deliberately out of scope (future)

- **Shift scheduling / rostering** — assigning *future* shifts, availability,
  swap requests. A planning surface distinct from the clock; the punch model
  here is the data it would reconcile against.
- **Manager punch correction** — an admin editing/inserting a punch for someone
  who forgot. Kept out to preserve the append-only guarantee for the MVP; the
  clean path is a manager-signed corrective punch (a create, not an edit).
- **Breaks / unpaid time, overtime rules, rounding policies, pay rates** — real
  payroll math is jurisdiction- and employer-specific; the CSV exports raw
  paired hours for a payroll system to apply its own rules.
- **Approval / lock of a pay period.**
