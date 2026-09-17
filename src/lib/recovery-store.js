// Account recovery — the I/O half (Admin SDK + Resend). Policy lives in the
// pure recovery.js; this mints, consumes and burns the one-time links and puts
// the mail on the wire. SERVER ONLY.
//
// Storage: one top-level `recoveryTokens/{id}` doc per outstanding link, holding
// only a SALTED HASH of the secret — the same scrypt helper the PIN hashes use.
// A leaked database row therefore can't be replayed as a link. The collection
// matches no rule in firestore.rules beyond an explicit deny, so no client can
// read or write it; everything here runs through the rules-bypassing Admin SDK.
import { randomBytes, randomInt } from "node:crypto";
import { hashPin, verifyPin } from "@/lib/hash";
import { sendEmail } from "@/lib/digest";
import {
  joinToken, splitToken, tokenState, supportReplyTo, RESET_TTL_MS, VERIFY_TTL_DAYS_MS,
} from "@/lib/recovery";

export const TOKENS = "recoveryTokens";

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const ttlFor = (kind) => (kind === "verify" ? VERIFY_TTL_DAYS_MS : RESET_TTL_MS);

/**
 * Mint a one-time link for one user. Returns the token string to put in the
 * email — the only place the secret ever exists in the clear. Minting first
 * burns that user's other outstanding links of the same kind, so asking twice
 * doesn't leave two live doors open (the newest link wins).
 */
export async function mintToken(adminDb, { kind, vendorId, userId, now = new Date() } = {}) {
  await burnTokens(adminDb, { kind, vendorId, userId });
  const id = b64url(randomBytes(9));          // 12 chars, collision-free in practice
  const secret = b64url(randomBytes(32));     // 43 chars of entropy
  await adminDb.collection(TOKENS).doc(id).set({
    kind, vendorId, userId,
    secretHash: hashPin(secret),
    createdAt: now,
    expiresAt: now.getTime() + ttlFor(kind),
    usedAt: null,
  });
  return { token: joinToken(id, secret), id };
}

/**
 * Verify a token and mark it used IN ONE TRANSACTION, so two taps on the same
 * emailed link (or an attacker racing the owner) can't both come back "ok".
 * Returns { state, doc } where state is "ok" | "used" | "expired" | "missing";
 * only "ok" carries a doc, and only "ok" consumed the token.
 */
export async function consumeToken(adminDb, token, kind, now = Date.now()) {
  const parts = splitToken(token);
  if (!parts) return { state: "missing" };
  const ref = adminDb.collection(TOKENS).doc(parts.id);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const doc = snap.exists ? snap.data() : null;
    const state = tokenState(doc, now, kind);
    if (state !== "ok") return { state };
    // The id alone is not the credential: the secret must match the stored hash.
    if (!verifyPin(parts.secret, doc.secretHash)) return { state: "missing" };
    tx.update(ref, { usedAt: new Date(now) });
    return { state: "ok", doc };
  });
}

/**
 * Look at a token WITHOUT consuming it, so the /reset page can tell someone
 * their link has expired before making them type a new PIN into a dead form.
 * Same states as consumeToken; it never reveals whose token it is.
 */
export async function peekToken(adminDb, token, kind, now = Date.now()) {
  const parts = splitToken(token);
  if (!parts) return { state: "missing" };
  const snap = await adminDb.collection(TOKENS).doc(parts.id).get();
  const doc = snap.exists ? snap.data() : null;
  const state = tokenState(doc, now, kind);
  if (state !== "ok") return { state };
  return verifyPin(parts.secret, doc.secretHash) ? { state: "ok", doc } : { state: "missing" };
}

/**
 * Drop every outstanding link of `kind` for a user (omit `kind` for all of
 * them). Called when a PIN changes by ANY route — self-service, an owner reset,
 * a developer reset, or a completed recovery — so a reset link that was already
 * in flight is dead the moment the credential moves.
 */
export async function burnTokens(adminDb, { kind = null, vendorId, userId } = {}) {
  if (!vendorId || !userId) return 0;
  let q = adminDb.collection(TOKENS).where("vendorId", "==", vendorId).where("userId", "==", userId);
  if (kind) q = q.where("kind", "==", kind);
  const snap = await q.get();
  if (snap.empty) return 0;
  const batch = adminDb.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

/**
 * A uniformly random 6-digit temporary PIN (randomInt is rejection-sampled, so
 * there's no modulo bias). Used only where a recovery EMAIL isn't possible —
 * the developer relaying a code by phone — and always paired with
 * mustChangePin, so support never ends up knowing a lasting credential.
 */
export function randomTempPin() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * The absolute URL to build links from. APP_URL is authoritative; without it we
 * fall back to the host the platform reports, which is why the runbook asks for
 * APP_URL to be set (a fabricated Host header would otherwise decide where a
 * recovery link points).
 */
export function appUrlFrom(req) {
  const configured = String(process.env.APP_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const raw = req?.headers?.get?.("x-forwarded-host") || req?.headers?.get?.("host") || "";
  const host = String(raw).split(",")[0].trim().replace(/[^A-Za-z0-9.:-]/g, "").slice(0, 200);
  return host ? `https://${host}` : "";
}

/**
 * Best-effort send. Recovery mail must never change a route's answer: the
 * request endpoint returns the same neutral body whether the address existed,
 * whether Resend is configured, and whether delivery succeeded. Returns a
 * boolean purely so the caller can log.
 *
 * Every send from here carries Reply-To when one is configured — harmless on the
 * mail that doesn't ask for a reply, and the whole point on the mail that does.
 */
export async function trySend({ to, subject, text, html }) {
  if (!to) return false;
  try {
    await sendEmail({ to, subject, text, html, replyTo: supportReplyTo() });
    return true;
  } catch (e) {
    console.error("recovery email failed", e?.message || e);
    return false;
  }
}
