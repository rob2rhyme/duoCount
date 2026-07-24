// Pure "books on hand vs. ever-counted" reconcile. The shift-boundary count and
// its pack audit can't see a book that was NEVER ticket-counted — a freshly
// activated pack skimmed whole leaves no continuity gap and no missing-log,
// because both need a prior count of that pack. The fix is an independent
// physical census (a signed snapshot of the pack IDs on hand); this reconcile
// compares consecutive censuses against the counts to surface what a count alone
// misses:
//   • WALKED  — a pack present in the previous census, gone from the latest, and
//     never marked sold out: it physically disappeared between two censuses.
//   • UNCOUNTED ON HAND — a pack in the latest census with no ticket count in the
//     trail at all: a book on the shelf nobody has vouched for yet.
// No Firestore, no clock reads beyond toDate on the stored ts — unit-testable.

import { toDate } from "./utils.js";

const packOf = (p) => String(p ?? "").trim();

/**
 * @param {Array} censuses  signed snapshots { packs:[id], by, ts, date, locationId }
 * @param {Array} entries   count entries (scratch ones supply counted / sold-out / game)
 * @param {Object} opts      { locationId } — scope both sides to one location
 * @returns {{ latest, prior, walked, uncounted }}
 *   latest/prior: { date, by, ts, count } | null
 *   walked:    [{ pack, game, counted }]  gone since the previous census
 *   uncounted: [{ pack, game }]           on hand now but never ticket-counted
 */
export function buildCensusReconcile(censuses = [], entries = [], { locationId = "" } = {}) {
  const cs = censuses
    .filter((c) => c && Array.isArray(c.packs) && (!locationId || (c.locationId || "") === locationId))
    .map((c) => ({
      date: c.date || "", by: c.by || "—", ts: toDate(c.ts) || null,
      _ms: toDate(c.ts)?.getTime() ?? 0,
      packSet: new Set(c.packs.map(packOf).filter(Boolean)),
    }))
    .sort((a, b) => a._ms - b._ms || String(a.date).localeCompare(String(b.date)));

  if (!cs.length) return { latest: null, prior: null, walked: [], uncounted: [] };

  const latest = cs[cs.length - 1];
  const prior = cs.length > 1 ? cs[cs.length - 2] : null;

  // Ever-counted + sold-out pack sets, and a pack→game label, from the counts.
  const counted = new Set(), soldOut = new Set(), gameOf = new Map();
  for (const e of entries) {
    if (e.kind !== "scratch") continue;
    if (locationId && (e.locationId || "") !== locationId) continue;
    const pack = packOf(e.pack);
    if (!pack) continue;
    counted.add(pack);
    if (e.soldOut === true) soldOut.add(pack);
    if (e.game && !gameOf.has(pack)) gameOf.set(pack, e.game);
  }

  // WALKED: in the previous census, absent from the latest, not sold out.
  const walked = [];
  if (prior) {
    for (const pack of prior.packSet) {
      if (latest.packSet.has(pack) || soldOut.has(pack)) continue;
      walked.push({ pack, game: gameOf.get(pack) || "", counted: counted.has(pack) });
    }
  }
  // UNCOUNTED ON HAND: in the latest census, never a ticket count.
  const uncounted = [];
  for (const pack of latest.packSet) {
    if (counted.has(pack)) continue;
    uncounted.push({ pack, game: gameOf.get(pack) || "" });
  }

  const byGamePack = (a, b) => (a.game || "").localeCompare(b.game || "") || a.pack.localeCompare(b.pack);
  const brief = (c) => (c ? { date: c.date, by: c.by, ts: c.ts, count: c.packSet.size } : null);
  return { latest: brief(latest), prior: brief(prior), walked: walked.sort(byGamePack), uncounted: uncounted.sort(byGamePack) };
}
