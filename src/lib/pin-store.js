// Writing a PIN — the one server-side path, shared by every route that sets one
// (an owner in Admin, a member changing their own, a recovery link, the /dev
// console). SERVER ONLY.
//
// Sign-in resolves WHO you are by which salted hash matches, so two people at
// one store must never share a PIN: `pinTaken` is the check every writer runs,
// and `setUserPin` is the write, so the surrounding bookkeeping — killing any
// in-flight recovery link, forcing a change where one is owed, dropping live
// sessions — can't be remembered in one route and forgotten in the next.
import { hashPin, verifyPin } from "@/lib/hash";
import { burnTokens, randomTempPin } from "@/lib/recovery-store";

/**
 * Is `pin` already some OTHER active-or-not user's PIN at this store? Salted
 * hashes can't be queried, so this verifies against each user's stored hash —
 * fine for the handful of staff a store has. Returns that user's id, or null.
 */
export async function pinTaken(adminDb, vendorId, pin, exceptUserId = null) {
  const users = await adminDb.collection("vendors").doc(vendorId).collection("users").get();
  for (const u of users.docs) {
    if (u.id === exceptUserId) continue;
    const creds = await u.ref.collection("private").doc("creds").get();
    if (creds.exists && verifyPin(pin, creds.data().pinHash)) return u.id;
  }
  return null;
}

/**
 * Set a user's PIN and do everything that must travel with it:
 *   • store the salted hash (never the PIN);
 *   • set or clear `mustChangePin` — true when somebody ELSE chose this PIN, so
 *     it's a one-trip credential the holder must replace on next sign-in;
 *   • delete any outstanding recovery link for that user, so a reset email
 *     already in someone's inbox is dead the moment the credential moves;
 *   • revoke refresh tokens, so sessions carrying the old PIN's token stop at
 *     the next checkRevoked verify instead of lingering until expiry.
 */
export async function setUserPin(adminDb, adminAuth, { vendorId, userId, pin, mustChangePin = false, revoke = true } = {}) {
  const userRef = adminDb.collection("vendors").doc(vendorId).collection("users").doc(userId);
  await userRef.collection("private").doc("creds").set({ pinHash: hashPin(pin) }, { merge: true });
  await userRef.update({ mustChangePin: !!mustChangePin });
  await burnTokens(adminDb, { kind: "reset", vendorId, userId });
  if (revoke) {
    try { await adminAuth.revokeRefreshTokens(`${vendorId}_${userId}`); }
    catch { /* never signed in yet — nothing to revoke */ }
  }
}

// How many times to redraw a temporary PIN before giving up. A store has a
// handful of staff against a million-PIN space, so a first-draw clash is already
// remote; this just makes "remote" into "handled".
const TEMP_PIN_TRIES = 12;

/**
 * Issue a server-chosen one-time PIN that is UNIQUE at this store, and mark it
 * must-change. Uniqueness is not cosmetic here: login identifies a person by
 * whichever hash matches and refuses outright when two match, so a temporary PIN
 * that happened to collide with a clerk's would lock out BOTH of them — the
 * lockout this call exists to end. Returns the PIN to read out once, or null if
 * every draw collided (the caller reports that rather than issuing a dud).
 */
export async function issueTempPin(adminDb, adminAuth, { vendorId, userId } = {}) {
  for (let i = 0; i < TEMP_PIN_TRIES; i++) {
    const pin = randomTempPin();
    if (await pinTaken(adminDb, vendorId, pin, userId)) continue;
    await setUserPin(adminDb, adminAuth, { vendorId, userId, pin, mustChangePin: true });
    return pin;
  }
  return null;
}
