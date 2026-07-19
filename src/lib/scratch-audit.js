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
 *              prevBy, prevTs, nextBy, nextTs }] }
 *            `missing` > 0 = tickets unaccounted; < 0 = the next count started
 *            BELOW the previous end (a re-count/rollback worth a look too).
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
        missedDays,
      });
    }
  }

  gaps.sort((a, b) => b.missingDollars - a.missingDollars || b.totalMissing - a.totalMissing);
  missing.sort((a, b) => b.missedDays - a.missedDays || a.game.localeCompare(b.game));
  return { gaps, missing, packsSeen: byPack.size };
}
