// Time-clock aggregation — pure and isomorphic (no Firebase imports), so the
// component runs it in the browser and the tests run it under plain node.
//
// Punches are append-only in/out events, one doc each, signed by the employee
// (userId / userName). This pairs a user's chronological punches into shifts and
// sums worked hours. It is deliberately forgiving of the messy real world:
// a forgotten clock-out (two "in"s in a row) closes the earlier shift as *open*
// (it contributes no hours), and an "out" with nothing open is ignored — a
// missed punch never invents or corrupts paid time.

function toMs(ts) {
  if (ts == null) return null;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return ts;
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * The LOCAL business day (YYYY-MM-DD) of an instant — the calendar date in the
 * device/store timezone, NOT UTC. `new Date(ms).toISOString().slice(0,10)`
 * gives the UTC date, which rolls a US evening shift onto the wrong business day
 * (8pm ET = next-day UTC), so a punch stops matching its manager-picked shift
 * date and the attendance/late/payroll grouping breaks. Reads the offset per
 * instant, so it's DST-correct; `offsetMin` lets tests pin a timezone instead
 * of depending on the runner's TZ (defaults to the device's own offset).
 */
export function dayISO(ms = Date.now(), offsetMin = new Date(ms).getTimezoneOffset()) {
  return new Date(ms - offsetMin * 60_000).toISOString().slice(0, 10);
}

const keyOf = (p) => p.userId || p.userName || "";

function shift(inP, outP) {
  const inMs = inP._ms;
  const outMs = outP ? outP._ms : null;
  return {
    userId: inP.userId || null,
    userName: inP.userName || "",
    locationId: inP.locationId || null,
    locationName: inP.locationName || "",
    inMs,
    outMs,
    ms: outMs != null ? Math.max(0, outMs - inMs) : null,
    open: outMs == null,
    // Ids of the effective in/out punches, so a manager UI can target them for a
    // correction. `corrected` marks a shift that a correction touched.
    inId: inP.id ?? null,
    outId: outP ? outP.id ?? null : null,
    corrected: !!(inP._corrected || (outP && outP._corrected)),
  };
}

/**
 * Fold append-only manager corrections into an effective list of base punches,
 * WITHOUT mutating the originals. Punches are immutable (rules forbid
 * update/delete), so a manager "correction" is a separate signed record that
 * supersedes a punch — the audit trail keeps both. Correction records carry
 * `kind:"correction"` and one of:
 *   • action:"edit"  targetId + at [+ type]  — override a punch's time (and type)
 *   • action:"add"   type + at               — introduce a punch the employee missed
 *   • action:"void"  targetId                — drop a punch (e.g. a double clock-in)
 * `at` is the manager-chosen effective time; `ts` is the server audit time and
 * also the apply order, so a later correction to the same punch wins.
 * Rows without `kind:"correction"` are ordinary punches and pass through.
 */
export function applyCorrections(rows = []) {
  const base = [], corrections = [];
  for (const r of rows) (r?.kind === "correction" ? corrections : base).push(r);

  let auto = 0;
  const eff = new Map();
  for (const p of base) {
    if (p?.type !== "in" && p?.type !== "out") continue; // non-punch rows drop out
    eff.set(p.id ?? `base:${auto++}`, { ...p });
  }

  corrections
    .slice()
    .sort((a, b) => (toMs(a.ts) ?? 0) - (toMs(b.ts) ?? 0)) // oldest first: newest wins
    .forEach((c) => {
      if (c.action === "void") {
        if (c.targetId != null) eff.delete(c.targetId);
      } else if (c.action === "edit") {
        const t = c.targetId != null ? eff.get(c.targetId) : null;
        if (t) {
          if (c.at != null) t.ts = c.at;
          if (c.type === "in" || c.type === "out") t.type = c.type;
          t._corrected = true;
        }
      } else if (c.action === "add") {
        if ((c.type === "in" || c.type === "out") && c.at != null) {
          eff.set(c.id ?? `add:${auto++}`, {
            id: c.id ?? null, ts: c.at, type: c.type,
            userId: c.userId ?? null, userName: c.userName ?? "",
            locationId: c.locationId ?? null, locationName: c.locationName ?? "",
            _corrected: true,
          });
        }
      }
    });

  return [...eff.values()];
}

/**
 * Pair chronological in/out punches per user into shifts.
 * Returns [{ userId, userName, locationName, inMs, outMs, ms, open }],
 * earliest first. `open` shifts (no clock-out) have `ms: null`.
 */
export function computeShifts(punches = []) {
  const byUser = new Map();
  for (const p of applyCorrections(punches)) {
    const ms = toMs(p.ts);
    if (ms == null || (p.type !== "in" && p.type !== "out")) continue;
    const k = keyOf(p);
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k).push({ ...p, _ms: ms });
  }

  const shifts = [];
  for (const list of byUser.values()) {
    list.sort((a, b) => a._ms - b._ms);
    let open = null;
    for (const p of list) {
      if (p.type === "in") {
        if (open) shifts.push(shift(open, null)); // forgotten clock-out
        open = p;
      } else {
        if (open) { shifts.push(shift(open, p)); open = null; }
        // orphan "out" (nothing open) — ignore
      }
    }
    if (open) shifts.push(shift(open, null)); // still on the clock
  }
  return shifts.sort((a, b) => a.inMs - b.inMs);
}

/**
 * The user's currently-open shift (clocked in, not yet out), or null.
 * `punches` may be the whole vendor's or just the user's.
 */
export function openShiftFor(punches, userId) {
  const mine = computeShifts(punches).filter((s) => s.userId === userId && s.open);
  // If somehow multiple are open (double clock-in), the latest is the live one.
  return mine.length ? mine[mine.length - 1] : null;
}

/**
 * Worked hours per user over an optional [fromMs, toMs] window (a shift counts
 * if it *started* in range). Open shifts contribute no hours. Returns
 * [{ userId, userName, ms, shifts, hours }] sorted by name.
 */
export function summarizeHours(punches = [], { fromMs = null, toMs: toBound = null } = {}) {
  const byUser = new Map();
  for (const s of computeShifts(punches)) {
    if (s.ms == null) continue;
    if (fromMs != null && s.inMs < fromMs) continue;
    if (toBound != null && s.inMs > toBound) continue;
    const u = byUser.get(s.userId) || { userId: s.userId, userName: s.userName, ms: 0, shifts: 0 };
    u.ms += s.ms;
    u.shifts += 1;
    u.userName = s.userName || u.userName;
    byUser.set(s.userId, u);
  }
  return [...byUser.values()]
    .map((u) => ({ ...u, hours: hoursDecimal(u.ms) }))
    .sort((a, b) => (a.userName || "").localeCompare(b.userName || ""));
}

/** ms -> decimal hours, 2dp (payroll-friendly). */
export function hoursDecimal(ms) {
  return Math.round((ms / 3_600_000) * 100) / 100;
}

/** ms -> "6h 45m" (or "45m", or "0m"). Elapsed of an open shift can pass `now`. */
export function formatDuration(ms) {
  if (ms == null || ms < 0) return "—";
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
