// Pack audit — pure functions over the scratch counts the team already logs.
//
// The store's theft control for scratch-offs is the shift boundary: the ticket
// number that closed one count must be the number that opens the next. Packs
// are identified by location + pack # (the printed book number). Settlement
// math is the lottery's job — this audit only checks OUR counts against each
// other, and answers two questions a manager actually asks:
//
//   1. GAPS — between two consecutive counts of the same pack, did ticket
//      numbers go unaccounted? (next count's start # ≠ previous count's end #)
//      Each gap names who signed the earlier count and who signed the later
//      one, so it's a conversation between two specific people, not a mystery.
//   2. MISSING LOGS — which packs stopped being counted? A pack with count
//      history that's absent from the location's most recent counting days is
//      a pack nobody can vouch for (walked pack, or a skipped audit step).
//
// No Firestore, no clock reads beyond the injectable `now` — unit-testable.

import { toDate } from "./utils.js";
import { computeShifts } from "./timeclock.js";

const dayOf = (e) => e.date || (toDate(e.ts)?.toISOString().slice(0, 10)) || null;
const timeOf = (e) => toDate(e.ts)?.getTime() ?? 0;

/**
 * Build the pack audit over scratch entries.
 * @param {Array} entries  count entries (any kinds; scratch with a pack # are used)
 * @param {Object} opts    { days = 14, now = new Date() }
 * @returns {{ gaps: Array, missing: Array, packsSeen: number }}
 *   gaps:    one row per pack with ≥1 discontinuity, worst dollars first:
 *            { key, locationId, locationName, pack, game, price, totalMissing,
 *              missingDollars, events: [{ missing, prevEnd, nextStart,
 *              prevBy, prevTs, nextBy, nextTs, selloutShort? }] }
 *            `missing` > 0 = tickets unaccounted; < 0 = the next count started
 *            BELOW the previous end (a re-count/rollback worth a look too).
 *            `selloutShort` marks a FINALED book that closed below its pack
 *            size (perPack) — the sell-out skim, prevEnd=closeEnd, nextStart=size.
 *   missing: packs with history but no count on the location's latest counting
 *            day(s): { key, locationId, locationName, pack, game, lastDate,
 *            lastBy, lastEnd, missedDays } — missedDays = how many counting
 *            days at that location have passed since the pack's last count.
 */
export function buildPackAudit(entries = [], { days = 14, now = new Date() } = {}) {
  const cut = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const scratch = entries.filter((e) =>
    e.kind === "scratch" && String(e.pack || "").trim() !== "" && (dayOf(e) || "") >= cut);

  // Group by location + pack #, ordered oldest → newest.
  const byPack = new Map();
  for (const e of scratch) {
    const key = `${e.locationId || ""}|${String(e.pack).trim()}`;
    if (!byPack.has(key)) byPack.set(key, []);
    byPack.get(key).push(e);
  }
  for (const list of byPack.values())
    list.sort((a, b) => timeOf(a) - timeOf(b) || String(dayOf(a)).localeCompare(String(dayOf(b))));

  // Counting days per location (business dates that have any scratch count).
  const daysByLoc = new Map();
  for (const e of scratch) {
    const d = dayOf(e);
    if (!d) continue;
    const loc = e.locationId || "";
    if (!daysByLoc.has(loc)) daysByLoc.set(loc, new Set());
    daysByLoc.get(loc).add(d);
  }

  const gaps = [];
  const missing = [];
  for (const [key, list] of byPack.entries()) {
    const last = list[list.length - 1];
    const events = [];
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], next = list[i];
      const prevEnd = Number(prev.endno);
      const nextStart = Number(next.startno);
      if (!Number.isFinite(prevEnd) || !Number.isFinite(nextStart)) continue;
      const gap = nextStart - prevEnd;
      if (gap === 0) continue;
      events.push({
        missing: gap, prevEnd, nextStart,
        prevBy: prev.by || "—", prevTs: toDate(prev.ts) || null,
        nextBy: next.by || "—", nextTs: toDate(next.ts) || null,
      });
    }

    // A FINALED book that closed BELOW its pack size sold out short: those
    // tickets left the drawer without being counted — the classic "mark it
    // sold out and pocket the rest" skim. buildPackFlow (the on-demand printed
    // report) already flags this; fold the SAME signal into the live audit so
    // the pack-gap alert and the Dashboard card catch it too, instead of it
    // only surfacing when a manager happens to run the report over that range.
    if (last.soldOut === true) {
      const size = Number(last.perPack) > 0 ? Number(last.perPack) : null;
      const closeEnd = Number(last.endno);
      if (size && Number.isFinite(closeEnd) && closeEnd < size) {
        events.push({
          missing: size - closeEnd, prevEnd: closeEnd, nextStart: size,
          prevBy: last.by || "—", prevTs: toDate(last.ts) || null,
          nextBy: "—", nextTs: toDate(last.ts) || null, selloutShort: true,
        });
      }
    }

    if (events.length) {
      const totalMissing = events.reduce((s, ev) => s + (ev.missing > 0 ? ev.missing : 0), 0);
      const price = Number(last.price) || 0;
      gaps.push({
        key, locationId: last.locationId || "", locationName: last.locationName || "",
        pack: String(last.pack).trim(), game: last.game || "(game)", price,
        totalMissing, missingDollars: totalMissing * price, events,
      });
    }

    // A FINALED book (its last count marked soldOut) is retired: nobody can
    // vouch for a pack that no longer exists, so it is never "missing" — the
    // mid-shift sell-out that used to read as a lost pack now closes clean.
    if (last.soldOut === true) continue;

    // Missing log: counting days at this location AFTER the pack's last count.
    const lastDay = dayOf(last);
    const locDays = daysByLoc.get(last.locationId || "") || new Set();
    const missedDays = lastDay ? [...locDays].filter((d) => d > lastDay).length : 0;
    if (missedDays > 0) {
      missing.push({
        key, locationId: last.locationId || "", locationName: last.locationName || "",
        pack: String(last.pack).trim(), game: last.game || "(game)",
        lastDate: lastDay, lastBy: last.by || "—",
        lastEnd: Number.isFinite(Number(last.endno)) ? Number(last.endno) : null,
        lastTs: toDate(last.ts) || null, // server-pinned moment of the last count
        missedDays,
      });
    }
  }

  gaps.sort((a, b) => b.missingDollars - a.missingDollars || b.totalMissing - a.totalMissing);
  missing.sort((a, b) => b.missedDays - a.missedDays || a.game.localeCompare(b.game));
  return { gaps, missing, packsSeen: byPack.size };
}

// A single after-hours session that advances MANY packs at once (an insider with
// the state-portal credentials activating/skimming a batch of books) leaves one
// fingerprint the per-pack gap detector can't see: several packs whose ticket
// numbers all jumped during the SAME time window. Left as N independent pack-gap
// alerts the mass event is buried under the flood; this rolls it into one signal.
const MASS_JUMP_MIN_PACKS = 3; // distinct packs sharing a window => a "mass" event

/**
 * Cluster per-pack ticket-number jumps that share a common time window — the
 * signature of one actor moving many packs in a single session. Consumes the
 * `gaps` array from buildPackAudit, whose events carry the (now server-pinned)
 * prevTs/nextTs. A pack's jump "could have happened" anywhere in [prevTs, nextTs]
 * (last honest close → next honest open); a cluster is a set of packs whose
 * windows share a common instant, so ONE moment explains all of them.
 * @param {Array} gaps  buildPackAudit(...).gaps
 * @param {Object} opts { minPacks }
 * @returns {Array} clusters, worst dollars first:
 *   { count, packs: [{ key, pack, game, price, missing }], windowStart, windowEnd,
 *     totalMissing, totalDollars } — windowStart/End (Date) is the tightest
 *   interval the single event must fall in (the intersection of all windows).
 */
export function clusterPackJumps(gaps = [], { minPacks = MASS_JUMP_MIN_PACKS } = {}) {
  // Flatten to per-event movement windows [start, end], tagged by pack. Only
  // forward jumps (unaccounted tickets) with both timestamps known can cluster;
  // a transient null ts (an optimistic write before the server echo) is skipped.
  const windows = [];
  for (const g of gaps) {
    for (const ev of g.events || []) {
      if (!(ev.missing > 0)) continue;
      const start = ev.prevTs instanceof Date ? ev.prevTs.getTime() : null;
      const end = ev.nextTs instanceof Date ? ev.nextTs.getTime() : null;
      if (start == null || end == null || !(end >= start)) continue;
      windows.push({ key: g.key, pack: g.pack, game: g.game, price: Number(g.price) || 0, missing: ev.missing, start, end });
    }
  }
  // Sort by start; sweep keeping a running intersection [lo, hi]. A window joins
  // the current cluster only if it still leaves a non-empty common overlap, so
  // every cluster genuinely shares one instant (not just pairwise-close).
  windows.sort((a, b) => a.start - b.start || a.end - b.end);
  const raw = [];
  let cur = null;
  for (const w of windows) {
    if (cur) {
      const lo = Math.max(cur.lo, w.start);
      const hi = Math.min(cur.hi, w.end);
      if (lo <= hi) { cur.items.push(w); cur.lo = lo; cur.hi = hi; continue; }
      raw.push(cur);
    }
    cur = { items: [w], lo: w.start, hi: w.end };
  }
  if (cur) raw.push(cur);

  const clusters = [];
  for (const c of raw) {
    // Collapse to distinct packs (one pack with several events counts once).
    const byPack = new Map();
    for (const w of c.items) {
      const p = byPack.get(w.key) || { key: w.key, pack: w.pack, game: w.game, price: w.price, missing: 0 };
      p.missing += w.missing;
      byPack.set(w.key, p);
    }
    if (byPack.size < minPacks) continue;
    const packs = [...byPack.values()].sort((a, b) => b.missing * b.price - a.missing * a.price);
    const totalMissing = packs.reduce((s, p) => s + p.missing, 0);
    const totalDollars = packs.reduce((s, p) => s + p.missing * p.price, 0);
    clusters.push({
      count: packs.length, packs,
      windowStart: new Date(c.lo), windowEnd: new Date(c.hi),
      totalMissing, totalDollars,
    });
  }
  clusters.sort((a, b) => b.totalDollars - a.totalDollars || b.count - a.count);
  return clusters;
}

// A shift-boundary count is supposed to happen while the store is staffed. Now
// that a count's ts is server-pinned (not a spoofable browser clock), a count
// logged when NOBODY was clocked in is a real signal — the after-hours count an
// insider would log alone. We test STORE-level presence (was anyone on shift?),
// not per-author, so one clerk forgetting to punch never false-flags a count
// that plenty of on-shift coworkers could vouch for.
const OFF_SHIFT_GRACE_MS = 60 * 60 * 1000; // 60 min slop around each clock in/out

/**
 * Flag scratch counts logged while the store was UNMANNED — the count's
 * (server-pinned) ts falls outside every worked shift in the time clock, ± a
 * grace window. Attributed to whoever signed the count. Fail-open: if there are
 * NO punches at all, the store isn't using the time clock and we flag nothing
 * (silence beats a false alarm). Timezone-clean: shift and count times are both
 * absolute ms.
 * @param {Array} entries  count entries (scratch ones are considered)
 * @param {Array} punches  the vendor's time-clock punches (+ corrections)
 * @param {Object} opts     { graceMs }
 * @returns {Array} one row per author, worst count first:
 *   { key, name, count, sample: [{ pack, game, tsMs }] }
 */
export function offShiftCounts(entries = [], punches = [], { graceMs = OFF_SHIFT_GRACE_MS } = {}) {
  const shifts = computeShifts(punches).filter((s) => s.inMs != null);
  if (!shifts.length) return []; // no time clock in use → can't tell → flag nothing
  // Merge everyone's worked shifts into "store staffed" intervals (± grace). An
  // open shift (no clock-out yet) extends to now/∞ — someone is still on.
  const open = shifts
    .map((s) => ({ lo: s.inMs - graceMs, hi: (s.outMs == null ? Infinity : s.outMs) + graceMs }))
    .sort((a, b) => a.lo - b.lo);
  const staffed = [];
  for (const iv of open) {
    const last = staffed[staffed.length - 1];
    if (last && iv.lo <= last.hi) last.hi = Math.max(last.hi, iv.hi);
    else staffed.push({ ...iv });
  }
  const manned = (ms) => staffed.some((iv) => ms >= iv.lo && ms <= iv.hi);

  const byAuthor = new Map();
  for (const e of entries) {
    if (e.kind !== "scratch") continue;
    const tsMs = toDate(e.ts)?.getTime();
    if (tsMs == null || manned(tsMs)) continue;
    const key = e.byId || e.by || "—";
    const a = byAuthor.get(key) || { key, name: e.by || "—", count: 0, sample: [] };
    a.count++;
    if (a.sample.length < 5) a.sample.push({ pack: String(e.pack || "").trim(), game: e.game || "", tsMs });
    byAuthor.set(key, a);
  }
  return [...byAuthor.values()].sort((a, b) => b.count - a.count);
}
