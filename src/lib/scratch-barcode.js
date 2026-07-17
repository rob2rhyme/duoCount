// Parse a scanned scratch-off ticket barcode into a stable pack id + the ticket
// number the pack is currently at.
//
// Instant-ticket barcodes concatenate a game/book identifier with a 3-digit
// ticket position. Peeling the trailing ticket off yields a pack id that stays
// STABLE across a shift — so the same physical pack scanned at open and at close
// chains together in the log and the shift-boundary pack audit — plus the
// current ticket number to fill into the count.
//
// Formats handled:
//   - delimited (e.g. "1234-567890-012", "567890 012"): the last numeric group
//     is the ticket, the rest identifies the pack;
//   - one long run of digits (a full ticket barcode): the last 3 digits are the
//     ticket, the rest is the pack;
//   - anything shorter / non-numeric: treated as a pack id with no ticket, so a
//     plain book/pack barcode still recognizes the pack (the prior behavior) and
//     no wrong ticket is ever invented.
//
// The exact segmentation varies by state lottery, so this pure function is the
// one place to adapt it. The count fields stay editable and the clerk reviews
// start/end (and the computed "sold") before the signed save, so an off format
// degrades to today's manual entry rather than a bad number.

// A full instant-ticket barcode is long; below this we don't peel a ticket, to
// avoid mistaking part of a short book/pack barcode for a ticket number.
export const MIN_TICKET_BARCODE_LEN = 13;
const TICKET_DIGITS = 3;

const toTicket = (s) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {string} raw  the scanner's output
 * @returns {{ pack: string, ticket: number|null }}
 */
export function parseScratchBarcode(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { pack: "", ticket: null };

  const groups = s.split(/[^0-9]+/).filter(Boolean);

  // Delimited: two or more numeric groups → the last group is the ticket.
  if (groups.length >= 2) {
    return { pack: groups.slice(0, -1).join("-"), ticket: toTicket(groups[groups.length - 1]) };
  }

  // One long run of digits → peel the trailing ticket off.
  const digits = groups[0] || "";
  if (digits.length >= MIN_TICKET_BARCODE_LEN) {
    return { pack: digits.slice(0, -TICKET_DIGITS), ticket: toTicket(digits.slice(-TICKET_DIGITS)) };
  }

  // Too short / non-numeric to hold a ticket — a plain pack/book id.
  return { pack: s, ticket: null };
}
