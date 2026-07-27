// The shift-boundary ticket log — the plain answer to "what number was this
// pack at when the shift opened, and what was it at when the shift closed?".
//
// One row = one pack, at one location, on one business date, with the OPENING
// reading and the CLOSING reading side by side, each carrying the scan's
// server-pinned time and the staff member who signed it. The rest of the owner
// report aggregates (tickets sold by game / by staff) or flags exceptions
// (unaccounted tickets, stopped-being-counted, books on hand); this is the raw
// ledger those are computed from.
//
// TWO RULES THAT DIFFER FROM THE SIBLING BUILDERS — do not "fix" them back:
//
//   1. A reading is the entry's `endno`, NEVER its `startno`. `endno` is the
//      number the clerk actually read off the pack at that moment; `startno` is
//      a baseline CHAINED from that pack's previous count (ScratchForm logTicket
//      sets `startno = prev.endno`, and `prev` is found with no date or shift
//      bound — it can be last night's or last week's). So an OPENING count's
//      `startno` is where the pack was at the *previous* close, and its `endno`
//      is this morning's reading. buildPackFlow's window-level "Opening" column
//      uses first.startno, which is a different (also correct, differently
//      framed) number — see `carriedIn` below, which surfaces it per row so the
//      two reports visibly reconcile.
//
//   2. An entry with no `ts` sorts LAST, not first (the siblings use `?? 0`).
//      A missing ts means an optimistic write that hasn't echoed the server
//      timestamp yet; letting it sort first would let it masquerade as the
//      opening reading, which is the one number this table must not get wrong.
//
// Pure: no Firestore, no clock reads. `ts` values pass through as Dates.

import { toDate } from "./utils.js";
import { packDisplayParts } from "./scratch-barcode.js";

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const numOrNull = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
// Business date, matching scratch-report.js / scratch-audit.js exactly.
const dayOf = (e) => e.date || toDate(e.ts)?.toISOString().slice(0, 10) || null;
// Null ts sorts last — see rule 2 above.
const tOf = (e) => toDate(e.ts)?.getTime() ?? Number.POSITIVE_INFINITY;
// The same open/close normalization the analytics + history views use: anything
// that isn't explicitly "close" is an opening count, so a legacy or seeded row
// is never dropped.
const shiftOf = (e) => (e.shift === "close" ? "close" : "open");

/**
 * Build the per-shift ticket log.
 * @param {Array} entries  count entries (scratch ones with a pack are used)
 * @param {Object} opts    { from, to, locationId } — inclusive ISO date bounds
 * @returns {{ rows: Array, totals: Object }} rows newest date first, then game, then pack.
 *   row: { key, date, locationId, locationName, game, gameNo, bookNo, pack, price,
 *          openTicket, openTs, openBy, closeTicket, closeTs, closeBy,
 *          carriedIn, sold, dollars, soldOut, soldOutTo, counts, status }
 *   status: "complete" | "open_only" | "close_only" | "rollback"
 */
export function buildShiftLog(entries = [], { from = "", to = "", locationId = "" } = {}) {
  const buckets = new Map();
  for (const e of entries) {
    if (!e || e.kind !== "scratch") continue;
    const pack = String(e.pack ?? "").trim();
    if (!pack) continue;
    const date = dayOf(e);
    if (!date) continue;
    if (from && date < from) continue;
    if (to && date > to) continue;
    const loc = e.locationId || "";
    if (locationId && loc !== locationId) continue;
    const key = `${loc}|${pack}|${date}`;
    if (!buckets.has(key)) buckets.set(key, { key, date, loc, pack, list: [] });
    buckets.get(key).list.push(e);
  }

  const rows = [];
  for (const b of buckets.values()) {
    b.list.sort((x, y) => tOf(x) - tOf(y));
    const opens = b.list.filter((e) => shiftOf(e) === "open");
    const closes = b.list.filter((e) => shiftOf(e) === "close");
    // Opening = the FIRST open-shift reading (where the pack stood when the
    // shift began). Closing = the LAST close-shift reading, INCLUDING a sold-out
    // final count: settlePack snaps `endno` to the pack size and that terminal
    // number is what buildPackFlow's printed report shows as the close, so
    // picking anything else would make two reports disagree by a whole book.
    const openEntry = opens[0] || null;
    const closeEntry = closes.length ? closes[closes.length - 1] : null;
    const last = b.list[b.list.length - 1];

    const openTicket = openEntry ? numOrNull(openEntry.endno) : null;
    const closeTicket = closeEntry ? numOrNull(closeEntry.endno) : null;
    // What the pack carried in from its previous count: the startno of the
    // bucket's FIRST entry — the only one whose baseline points outside this
    // day. (A later entry's startno is just this morning's reading.)
    const carriedIn = numOrNull(b.list[0].startno);

    let sold = null;
    let status = "complete";
    if (openTicket != null && closeTicket != null) {
      sold = closeTicket - openTicket;
      if (sold < 0) { sold = null; status = "rollback"; }
    } else if (closeTicket != null) {
      // Only a closing count — the common shape for a store that counts once a
      // day (the manual form's Start/End are that day's own span, and that
      // entry's signed `sold` is already in the KPI tiles). Use the entry's own
      // span rather than printing a dash beside a number the tiles do count.
      status = "close_only";
      const st = numOrNull(closeEntry.startno);
      if (st != null) { sold = closeTicket - st; if (sold < 0) { sold = null; status = "rollback"; } }
    } else {
      // Opened but not yet closed. Its own span is the OVERNIGHT leg, not this
      // shift's sales, so there is no honest "sold" to print yet.
      status = "open_only";
    }

    const price = Number(last.price) || 0;
    const soldOutEntry = b.list.find((e) => e.soldOut === true) || null;
    const parts = packDisplayParts(b.pack);
    rows.push({
      key: b.key,
      date: b.date,
      locationId: b.loc,
      locationName: last.locationName || "",
      game: last.game || "—",
      gameNo: parts.gameNo || "",
      bookNo: parts.bookNo || b.pack,
      pack: b.pack,
      price,
      openTicket,
      openTs: openEntry ? toDate(openEntry.ts) || null : null,
      openBy: openEntry ? openEntry.by || "—" : null,
      closeTicket,
      closeTs: closeEntry ? toDate(closeEntry.ts) || null : null,
      closeBy: closeEntry ? closeEntry.by || "—" : null,
      carriedIn,
      sold,
      dollars: sold == null ? null : round2(sold * price),
      soldOut: !!soldOutEntry,
      soldOutTo: soldOutEntry ? numOrNull(soldOutEntry.endno) : null,
      counts: b.list.length,
      status,
    });
  }

  rows.sort((a, b) =>
    b.date.localeCompare(a.date) || a.game.localeCompare(b.game) || a.pack.localeCompare(b.pack));

  const packs = new Set();
  let sold = 0, dollars = 0, openOnly = 0, closeOnly = 0, rollback = 0, counts = 0;
  for (const r of rows) {
    packs.add(`${r.locationId}|${r.pack}`);
    counts += r.counts;
    if (r.sold != null) { sold += r.sold; dollars += r.dollars || 0; }
    if (r.status === "open_only") openOnly += 1;
    if (r.status === "close_only") closeOnly += 1;
    if (r.status === "rollback") rollback += 1;
  }
  return {
    rows,
    totals: { rows: rows.length, packs: packs.size, counts, sold, dollars: round2(dollars), openOnly, closeOnly, rollback },
  };
}
