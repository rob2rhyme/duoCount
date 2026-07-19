// Pack-flow report — pure math over the scratch counts for an on-demand
// window. This is the printable answer to "what moved, pack by pack, between
// these two dates?": for every pack counted in the window it pairs the
// OPENING position (the first count's start #) with the CLOSING position (the
// last count's end #), totals the tickets recorded sold, and surfaces any
// chain gaps INSIDE the window (a later count starting off the previous end —
// the same discontinuity test as scratch-audit.js, but bounded to the report
// range). After a break-in, this is the exact-missing-tickets report: the last
// signed position of every pack, and who vouched for it.
//
// Pure and clock-free — unit-tested like scratch-audit.

import { toDate } from "./utils.js";

const dayOf = (e) => e.date || (toDate(e.ts)?.toISOString().slice(0, 10)) || null;
const timeOf = (e) => toDate(e.ts)?.getTime() ?? 0;

/**
 * @param {Array} entries  count entries (any kinds; scratch with a pack # used)
 * @param {Object} opts    { from, to, locationId = "" } — business dates,
 *                         inclusive; empty locationId = all locations
 * @returns {{ rows, totals }}
 *   rows: one per location+pack, sorted game A→Z then pack:
 *     { locationId, locationName, pack, game, price, counts,
 *       openStart, openDate, openBy, closeEnd, closeDate, closeBy,
 *       sold, dollars,        // per-count recorded sales, summed
 *       moved,                // closeEnd - openStart (net movement incl. gaps)
 *       gapTickets, gapDollars,
 *       gaps: [{ missing, prevEnd, nextStart, prevBy, nextBy, prevDate, nextDate }] }
 *   totals: { packs, counts, sold, dollars, gapTickets, gapDollars }
 */
export function buildPackFlow(entries = [], { from = "", to = "", locationId = "" } = {}) {
  const scratch = entries.filter((e) => {
    if (!e || e.kind !== "scratch" || String(e.pack || "").trim() === "") return false;
    if (locationId && e.locationId !== locationId) return false;
    const d = dayOf(e);
    return d && (!from || d >= from) && (!to || d <= to);
  });

  const byPack = new Map();
  for (const e of scratch) {
    const key = `${e.locationId || ""}|${String(e.pack).trim()}`;
    if (!byPack.has(key)) byPack.set(key, []);
    byPack.get(key).push(e);
  }

  const rows = [];
  for (const list of byPack.values()) {
    list.sort((a, b) => timeOf(a) - timeOf(b) || String(dayOf(a)).localeCompare(String(dayOf(b))));
    const first = list[0];
    const last = list[list.length - 1];
    const price = Number(last.price) || 0;

    const gaps = [];
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], next = list[i];
      const prevEnd = Number(prev.endno);
      const nextStart = Number(next.startno);
      if (!Number.isFinite(prevEnd) || !Number.isFinite(nextStart) || nextStart === prevEnd) continue;
      gaps.push({
        missing: nextStart - prevEnd, prevEnd, nextStart,
        prevBy: prev.by || "—", nextBy: next.by || "—",
        prevDate: dayOf(prev), nextDate: dayOf(next),
      });
    }
    const sold = list.reduce((s, e) => s + (Number(e.sold) || 0), 0);
    const openStart = Number.isFinite(Number(first.startno)) ? Number(first.startno) : null;
    const closeEnd = Number.isFinite(Number(last.endno)) ? Number(last.endno) : null;

    // A FINALED book that closed BELOW its last ticket sold out short —
    // those tickets left the pack without being sold or counted. That's the
    // break-in/skim number, so it rides the gaps list (typed selloutShort).
    const soldOut = last.soldOut === true;
    const size = Number(last.perPack) > 0 ? Number(last.perPack) : null;
    if (soldOut && size && closeEnd !== null && closeEnd < size) {
      gaps.push({
        missing: size - closeEnd, prevEnd: closeEnd, nextStart: size,
        prevBy: last.by || "—", nextBy: "—",
        prevDate: dayOf(last), nextDate: dayOf(last), selloutShort: true,
      });
    }
    const gapTickets = gaps.reduce((s, g) => s + (g.missing > 0 ? g.missing : 0), 0);

    rows.push({
      locationId: last.locationId || "", locationName: last.locationName || "",
      pack: String(last.pack).trim(), game: last.game || "(game)", price,
      counts: list.length, soldOut,
      openStart, openDate: dayOf(first), openBy: first.by || "—",
      closeEnd, closeDate: dayOf(last), closeBy: last.by || "—",
      sold, dollars: sold * price,
      moved: openStart !== null && closeEnd !== null ? closeEnd - openStart : null,
      gapTickets, gapDollars: gapTickets * price, gaps,
    });
  }

  rows.sort((a, b) => a.game.localeCompare(b.game) || a.pack.localeCompare(b.pack));
  const totals = rows.reduce((tt, r) => ({
    packs: tt.packs + 1, counts: tt.counts + r.counts,
    sold: tt.sold + r.sold, dollars: tt.dollars + r.dollars,
    gapTickets: tt.gapTickets + r.gapTickets, gapDollars: tt.gapDollars + r.gapDollars,
  }), { packs: 0, counts: 0, sold: 0, dollars: 0, gapTickets: 0, gapDollars: 0 });
  totals.dollars = Math.round(totals.dollars * 100) / 100;
  totals.gapDollars = Math.round(totals.gapDollars * 100) / 100;
  return { rows, totals };
}
