// Pure decision logic for the scratch-off "Scan to log" surface, split out of
// ScratchForm so it can be unit-tested (the component itself has no test
// harness). Three jobs:
//   1. Dedup — refuse an accidental re-scan of the SAME game+pack+ticket within
//      the SAME shift bucket (date + shift + location). Opening and Closing are
//      deliberately separate: the pack is read at open AND at close, so a ticket
//      logged at open must still log at close.
//   2. Reload / second-device safety — rebuild the seen-set from the entries the
//      form already holds, so the block survives a refresh or a second clerk on
//      another device, not just the in-memory Set.
//   3. Same-day replacement — after a pack is settled (sold out), the next book
//      of that game # is a fresh replacement; flag it "new" until the next day.

import { packGameKey } from "./scratch-barcode.js";

// Composite identity of one logged ticket reading. Date + shift + location
// bucket it so two shifts, two days, or two stores never collide; pack + ticket
// name the exact reading. Stringify defensively — callers pass ticket numbers.
export function scanDedupKey({ date, shift, locationId, pack, ticket } = {}) {
  return [date || "", shift || "", locationId || "", String(pack ?? ""), String(ticket ?? "")].join("|");
}

// The dedup keys already PERSISTED for this date+shift+location, read from the
// live entries the form already holds. A scan logs endno = the ticket, so a
// saved reading's ticket identity is its endno. A settled marker (soldOut) is a
// book-closed event, not a scanned ticket — skip it so it never blocks a later
// legitimate scan of that number.
export function loggedScanKeys(entries = [], { date, shift, locationId } = {}) {
  const keys = new Set();
  for (const e of entries) {
    if (!e || e.kind !== "scratch" || e.soldOut === true) continue;
    if ((e.date || "") !== date || (e.shift || "") !== shift || (e.locationId || "") !== locationId) continue;
    if (e.endno == null || e.endno === "") continue;
    keys.add(scanDedupKey({ date, shift, locationId, pack: e.pack || "", ticket: Number(e.endno) }));
  }
  return keys;
}

// Has this exact reading already been logged this shift? The in-memory `seen`
// Set blocks instantly within the tab (before Firestore echoes the write back);
// the entries-derived set blocks across a reload or a second device.
export function isDuplicateScan(reading, entries = [], seen) {
  const key = scanDedupKey(reading);
  if (seen && seen.has(key)) return true;
  return loggedScanKeys(entries, reading).has(key);
}

// Is a no-history book a FRESH replacement? True when a DIFFERENT book of the
// same game # was settled (sold out) earlier TODAY at this location — the store
// swapped a new book in behind the same game #. Keyed on today's date, so the
// signal expires on its own at the next day ("new until next day"). Both sides
// derive the game # through packGameKey, so leading-zero handling stays
// consistent without touching the catalog.
export function replacesSettledToday(entries = [], { date, locationId, gameNo, pack } = {}) {
  if (!gameNo) return false;
  return entries.some((e) =>
    e && e.kind === "scratch" && e.soldOut === true &&
    (e.date || "") === date && (e.locationId || "") === locationId &&
    packGameKey(e.pack || "") === gameNo &&
    String(e.pack || "") !== String(pack)); // a DIFFERENT book = the replacement
}
