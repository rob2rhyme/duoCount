// Normalize ONE manually-entered scratch-game catalog row — the owner typing a
// game in Admin instead of uploading the state's CSV. Same field rules as the
// bulk importer's validateGames (import-parse.js), kept here as a small pure
// function so the Admin card and the trusted /api/catalog route validate a game
// the exact same way (client shows instant feedback; server re-checks on trust).
//
// Shape written per game (matching the bundled catalog + the importer):
//   game# -> { name, price, perPack? }
// It is pure REFERENCE data — a scan fills in Game name + Ticket price so a new
// book needs no typing. It NEVER carries a count or an audited ticket number;
// those come only from the signed, countersigned scratch counts.
//
// Returns { ok: true, game, value } on success (game is the normalized key, value
// is the stored object), or { ok: false, code } with a stable error code the UI
// maps to a localized message. `code` values: game_missing, game_invalid,
// name_missing, price_missing, price_invalid, perpack_invalid.

export function normalizeGameEntry(input = {}) {
  // game number — required, numeric (tolerate a leading '#'); leading zeros
  // normalized so "01801" and "1801" are the same game.
  const gameRaw = String(input.game ?? "").trim();
  if (!gameRaw) return { ok: false, code: "game_missing" };
  const digits = gameRaw.replace(/\D/g, "");
  if (!digits) return { ok: false, code: "game_invalid" };
  const game = String(Number(digits));

  // name — required, capped at 120 chars (same as the importer).
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, code: "name_missing" };

  // price — required, a finite number > 0 (a $0 face value fills nothing useful).
  const priceRaw = String(input.price ?? "").trim().replace(/^\$/, "");
  if (priceRaw === "") return { ok: false, code: "price_missing" };
  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, code: "price_invalid" };

  // tickets-per-pack — optional; a whole number ≥ 1 when given.
  const value = { name: name.slice(0, 120), price };
  const ppRaw = String(input.perPack ?? "").trim();
  if (ppRaw !== "") {
    const perPack = Number(ppRaw);
    if (!Number.isInteger(perPack) || perPack < 1) return { ok: false, code: "perpack_invalid" };
    value.perPack = perPack;
  }

  return { ok: true, game, value };
}
