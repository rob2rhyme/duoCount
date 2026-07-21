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

// A pack id is game# + book#. The game# is the leading portion; the book# is a
// specific pack of that game. Splitting them lets a NEW book of an
// already-sold game carry that game's name + price forward (see packGameKey):
// the barcode itself has no name/price text, so history is the only source. In
// delimited barcodes the first group is the game#; in one long run this is the
// leading-digit count. Like MIN_TICKET_BARCODE_LEN, the exact split varies by
// state lottery — this constant is the one place to adapt it. A wrong split
// only affects the name/price CONVENIENCE fill (always editable, and the clerk
// reviews before the signed save); it never touches the ticket numbers the
// theft audit is built on.
export const GAME_DIGITS = 4;

const toTicket = (s) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {string} raw  the scanner's output
 * @returns {{ pack: string, ticket: number|null, game: string }}
 */
export function parseScratchBarcode(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { pack: "", ticket: null, game: "" };

  const groups = s.split(/[^0-9]+/).filter(Boolean);

  // Delimited: two or more numeric groups → the last group is the ticket.
  if (groups.length >= 2) {
    const pack = groups.slice(0, -1).join("-");
    return { pack, ticket: toTicket(groups[groups.length - 1]), game: packGameKey(pack) };
  }

  // One long run of digits = a scanned ticket barcode. PA lays it out as
  // game(4) + book(7) + ticket(3); the scanner appends a couple of validation
  // digits the printed number omits — e.g. the ticket printed "1792-0011361-016"
  // scans as "179200113610 16" plus 2 more on the end. Read the ticket from its
  // FIXED position right after game+book and ignore anything trailing, so those
  // extra digits are never mistaken for the ticket number.
  const digits = groups[0] || "";
  const HEAD = GAME_DIGITS + BOOK_DIGITS;         // game+book = the stable pack id
  if (digits.length >= HEAD + TICKET_DIGITS) {    // full game+book+ticket present
    const pack = digits.slice(0, HEAD);
    return { pack, ticket: toTicket(digits.slice(HEAD, HEAD + TICKET_DIGITS)), game: packGameKey(pack) };
  }
  if (digits.length >= MIN_TICKET_BARCODE_LEN) {
    const pack = digits.slice(0, -TICKET_DIGITS);
    return { pack, ticket: toTicket(digits.slice(-TICKET_DIGITS)), game: packGameKey(pack) };
  }

  // Too short / non-numeric to hold a ticket — a plain pack/book id.
  return { pack: s, ticket: null, game: packGameKey(s) };
}

/**
 * Derive the game identifier from a pack id — for a scanned pack or a stored
 * `entry.pack`, so the two can be matched. A new book of a known game then
 * shares a game key with the last count of that game and inherits its name +
 * price. Returns "" when no stable key can be read (so no false match fires).
 *
 * @param {string} pack  a pack id from parseScratchBarcode or a saved entry
 * @returns {string}
 */
export function packGameKey(pack) {
  const p = String(pack ?? "").trim();
  if (!p) return "";
  // Delimited (game-book…): the first group is the game#.
  if (p.includes("-")) return p.split("-")[0];
  // One run of digits: the leading GAME_DIGITS. Only when there is a book# tail
  // to distinguish, so two books of one game differ while sharing the game key.
  if (/^\d+$/.test(p) && p.length > GAME_DIGITS) return p.slice(0, GAME_DIGITS);
  return "";
}

/**
 * Build the canonical pack id from a PA ticket's two printed identifiers — the
 * game number (e.g. 1792) and the pack/book number (e.g. 0011361). A scan
 * concatenates them (game + book + ticket), so hand-typed entry must produce the
 * SAME id — otherwise the same physical pack scanned one shift and typed the
 * next splits into two, and the shift-boundary theft audit silently misses the
 * gap across that boundary. This is the one helper both paths agree through.
 *
 * Blank game # → the book # exactly as typed (the original behavior, so a store
 * that never fills a game # is unchanged). If the book field already leads with
 * the game # (the clerk typed the whole thing, or pasted a scan) it is NOT
 * double-prefixed. Non-numeric ids are left untouched.
 *
 * @param {string} gameNo  the 4-digit game number (leading zeros tolerated)
 * @param {string} bookNo  the pack / book number
 * @returns {string} the canonical pack id used for saving + audit chaining
 */
export function packIdFromParts(gameNo, bookNo) {
  const book = String(bookNo ?? "").trim();
  const g = String(gameNo ?? "").replace(/\D/g, "");
  if (!g) return book;               // no game # → book as typed
  if (!book) return "";
  const b = book.replace(/\D/g, "");
  if (!b) return book;               // non-numeric book → leave as-is
  return b.startsWith(g) ? b : g + b; // don't double-prefix an already-full id
}

/**
 * Reduce a value headed for a GAME-NUMBER field/key to just the game section.
 * A whole pack or ticket (game+book[+ticket], e.g. "17920011361016" or
 * "1792-0011361-016") collapses to its leading game # ("1792"); a bare game #
 * comes back unchanged. This keeps the owner catalog keyed by GAME, so a scan —
 * which looks a game up by its leading digits — always finds a stored game
 * instead of a whole ticket masquerading as a 14-digit "game" no scan can match.
 * The digit-count threshold is PA-tuned like the constants above.
 *
 * @param {string} raw
 * @returns {string} the game section, or the input unchanged when already short
 */
export function reduceToGameNumber(raw) {
  const s = String(raw ?? "").trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length >= GAME_DIGITS + BOOK_DIGITS) return digits.slice(0, GAME_DIGITS);
  return s;
}

// A PA pack/book number is this many digits; a scan (and the canonical id the
// form saves) prefixes the 4-digit game #, so a FULL id is GAME_DIGITS +
// BOOK_DIGITS long. Like the constants above it is PA-tuned — the one place to
// adapt for another state's layout.
export const BOOK_DIGITS = 7;

/**
 * Split a pack id back into the two numbers printed on the ticket — game # and
 * book # — for DISPLAY only (it never affects the audit's grouping, which keys
 * off the raw pack string). Mirrors the shelf/ticket labels so a manager
 * chasing a flagged gap can find the exact book.
 *
 * It never invents a split that isn't clearly there: a delimited id splits on
 * its delimiter; a plain digit run splits only when it is long enough to hold a
 * game # in front of a full book #, so a bare book # (typed before this store
 * captured game #s) is shown whole rather than mis-cut. Blank / short / already
 * partial ids come back with a blank gameNo and the whole id as bookNo.
 *
 * @param {string} pack  a stored entry.pack / audit pack id
 * @returns {{ gameNo: string, bookNo: string }}
 */
export function packDisplayParts(pack) {
  const p = String(pack ?? "").trim();
  if (!p) return { gameNo: "", bookNo: "" };
  if (p.includes("-")) {
    const i = p.indexOf("-");
    const g = p.slice(0, i), book = p.slice(i + 1);
    return g && book ? { gameNo: g, bookNo: book } : { gameNo: "", bookNo: p };
  }
  if (/^\d+$/.test(p) && p.length >= GAME_DIGITS + BOOK_DIGITS) {
    return { gameNo: p.slice(0, GAME_DIGITS), bookNo: p.slice(GAME_DIGITS) };
  }
  return { gameNo: "", bookNo: p };
}
