// Reorder reminder — a pure derived alert over the scratch counts the team
// already logs. When an ACTIVE book is within its last few tickets (remaining =
// perPack − the book's latest ticket position), the store should order a fresh
// book of that game before it sells out. A manager who already has a spare book
// in back stock can DISMISS the reminder for that book (scratchReorderDismissals);
// a replacement book is a new pack id, so the reminder re-arms for it on its own.
//
// Reads only the signed counts — no lifecycle/settlement state. Tickets count UP
// (a sold-out book's terminal endno == perPack), a sold-out book carries
// soldOut:true on its latest count, and perPack comes from the count itself or,
// as a name/price-style convenience, from the catalog. No Firestore, no clock —
// unit-testable.

import { toDate } from "./utils.js";
import { packGameKey, packDisplayParts } from "./scratch-barcode.js";
import { resolveGameEntry } from "./scratch-catalog.js";

const timeOf = (e) => toDate(e.ts)?.getTime() ?? 0;

/**
 * Build the reorder reminders over scratch entries.
 * @param {Array} entries  count entries (scratch ones with a pack # are used)
 * @param {Object} opts
 *   @param {number} [opts.threshold=5]  fire when 0 < perPack − endno <= threshold; 0/off → no reminders
 *   @param {Iterable<string>} [opts.dismissed=[]]  pack ids the manager set aside (a spare is on hand)
 *   @param {Object|null} [opts.catalog=null]  owner catalog for the perPack fallback (bundled otherwise)
 * @returns {Array} one row per book needing a reorder, fewest-left first:
 *   { pack, gameNo, bookNo, locationId, locationName, game, price, perPack, remaining }
 */
export function buildReorderAlerts(entries = [], { threshold = 5, dismissed = [], catalog = null } = {}) {
  const limit = Math.trunc(Number(threshold));
  if (!(limit > 0)) return []; // 0 / off / invalid → no reminders
  const skip = dismissed instanceof Set ? dismissed : new Set(dismissed || []);

  // Latest signed count per book (location + pack #), like buildPackAudit.
  const latest = new Map();
  for (const e of entries) {
    if (e.kind !== "scratch") continue;
    const pack = String(e.pack || "").trim();
    if (!pack) continue;
    const key = `${e.locationId || ""}|${pack}`;
    const cur = latest.get(key);
    if (!cur || timeOf(e) >= timeOf(cur)) latest.set(key, e);
  }

  const rows = [];
  for (const last of latest.values()) {
    if (last.soldOut === true) continue; // retired book — not a reorder target
    const pack = String(last.pack).trim();
    if (skip.has(pack)) continue; // manager has a spare set aside for this book
    const endno = Number(last.endno);
    if (!Number.isFinite(endno)) continue;
    const perPack = Number(last.perPack) > 0
      ? Number(last.perPack)
      : Number(resolveGameEntry(packGameKey(pack), catalog)?.perPack) || 0;
    if (!(perPack > 0)) continue; // unknown book size → can't judge "nearly out"
    const remaining = perPack - endno;
    if (!(remaining > 0 && remaining <= limit)) continue;
    const { gameNo, bookNo } = packDisplayParts(pack);
    rows.push({
      pack, gameNo, bookNo,
      locationId: last.locationId || "", locationName: last.locationName || "",
      game: last.game || "(game)", price: Number(last.price) || 0,
      perPack, remaining,
    });
  }
  rows.sort((a, b) => a.remaining - b.remaining || String(a.game).localeCompare(String(b.game)));
  return rows;
}
