// Auto-generated customer / loyalty IDs (rewards-program-spec.md follow-up —
// "Customer ID auto-populated by the app") and the scannable token that ties a
// customer's QR to a store.
//
// The id is Crockford base32: the 32-symbol alphabet deliberately drops I, L,
// O and U so a code never reads ambiguously (1/I/L, 0/O) when a customer reads
// it aloud or a scanner mis-reads a smudge. 8 symbols ≈ 40 bits — a collision
// within a single store is effectively impossible, and a uniqueness check at
// write time (see /api/rewards) makes it exact. Everything here is pure; the
// server supplies randomness (crypto) and does the uniqueness query.

export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I, L, O, U
const TOKEN_PREFIX = "duocount";

// Map bytes → a Crockford-base32 code of `length` chars. 256 is a whole multiple
// of 32, so `byte % 32` is unbiased. The caller passes `length` random bytes
// (crypto.randomBytes on the server; a fixed array in tests).
export function customerIdFromBytes(bytes = [], length = 8) {
  let out = "";
  for (let i = 0; i < length; i++) out += CROCKFORD[(Number(bytes[i]) || 0) % 32];
  return out;
}

// The scannable token a customer's QR carries: names the store AND the customer,
// so one scan resolves both (and a code from another store is rejected). Blank
// when either part is missing.
export function customerToken(slug, customerId) {
  const s = String(slug ?? "").trim().toLowerCase();
  const c = String(customerId ?? "").trim();
  return s && c ? `${TOKEN_PREFIX}:${s}:${c}` : "";
}

// Parse a scanned string into { slug, customerId } when it is a DuoCount token,
// else null so the caller falls back to phone-number matching. The customerId
// keeps its original form (a store-typed id may contain a colon, so everything
// after the second colon is the id).
export function parseCustomerToken(raw) {
  const str = String(raw ?? "").trim();
  const i1 = str.indexOf(":");
  const i2 = str.indexOf(":", i1 + 1);
  if (i1 < 1 || i2 < 0) return null;
  if (str.slice(0, i1).toLowerCase() !== TOKEN_PREFIX) return null;
  const slug = str.slice(i1 + 1, i2).trim().toLowerCase();
  const customerId = str.slice(i2 + 1).trim();
  if (!slug || !customerId) return null;
  return { slug, customerId };
}
