import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { throttleDecision, attemptKey, clientIp, RECOVERY_CONFIRM_LIMIT } from "@/lib/login-throttle";
import { isValidNewPin } from "@/lib/pin";
import { pinTaken, setUserPin } from "@/lib/pin-store";
import { hasRecoveryEmail, buildPinChangedEmail, supportReplyEnabled } from "@/lib/recovery";
import { peekToken, consumeToken, trySend } from "@/lib/recovery-store";

export const runtime = "nodejs";

// "I forgot my PIN" — step 2: spend the link.
//
//   { action: "check" } — does this link still work? The /reset page asks first,
//     so an expired link says so before anyone types a new PIN into a dead form.
//     A peek never consumes and never says WHOSE link it is.
//   { action: "set" }   — set the new PIN. consumeToken marks the token used in
//     the same transaction that validates it, so a double tap (or an attacker
//     racing the owner) can't both succeed.
//
// A store the developer suspended or removed can't be recovered into: the link
// is refused even if it was minted before the suspension.

const err = (status, code, message) => NextResponse.json({ error: message, code }, { status });
const ipOf = (req) => clientIp((n) => req.headers.get(n));

export async function POST(req) {
  try {
    const { token, pin, action, lang } = await req.json();
    const { adminDb, adminAuth } = await getAdmin();
    const now = Date.now();

    const ipRef = adminDb.collection("loginAttempts").doc(`reset_confirm_${attemptKey(ipOf(req))}`);
    const ipSnap = await ipRef.get();
    const dec = throttleDecision(ipSnap.exists ? ipSnap.data() : null, now, RECOVERY_CONFIRM_LIMIT);
    if (dec.blocked)
      return err(429, "throttled", "Too many attempts — wait a few minutes and try again.");
    await ipRef.set(dec.nextOnFail);

    if (action === "check") {
      const { state } = await peekToken(adminDb, token, "reset", now);
      return NextResponse.json({ ok: true, state });
    }

    if (!isValidNewPin(pin)) return err(400, "bad_new_pin", "PIN must be 6 digits.");

    // Validate the store BEFORE burning the token, so a locked-out owner of a
    // suspended store still has their link if the store is reactivated.
    const { state, doc } = await peekToken(adminDb, token, "reset", now);
    if (state !== "ok") return err(400, `link_${state}`, "That link isn't usable — ask for a new one.");
    const vendorSnap = await adminDb.collection("vendors").doc(doc.vendorId).get();
    if (!vendorSnap.exists) return err(400, "link_missing", "That link isn't usable — ask for a new one.");
    const vendor = vendorSnap.data();
    if (vendor.status === "suspended" || vendor.status === "deleted")
      return err(403, "store_closed", "This store is closed to sign-in. Contact DuoCount support.");

    const userRef = vendorSnap.ref.collection("users").doc(doc.userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists || userSnap.data().active === false)
      return err(400, "link_missing", "That link isn't usable — ask for a new one.");
    const me = { id: userSnap.id, ...userSnap.data() };

    // Same generic answer as every other PIN writer: never name the collision.
    if (await pinTaken(adminDb, doc.vendorId, pin, doc.userId))
      return err(409, "pin_taken", "Pick a different PIN.");

    // Spend the link only once everything else has passed.
    const spent = await consumeToken(adminDb, token, "reset", now);
    if (spent.state !== "ok") return err(400, `link_${spent.state}`, "That link isn't usable — ask for a new one.");

    await setUserPin(adminDb, adminAuth, {
      vendorId: doc.vendorId, userId: doc.userId, pin, mustChangePin: false,
    });
    if (hasRecoveryEmail(me)) {
      const mail = buildPinChangedEmail({
        lang: lang === "es" ? "es" : "en",
        storeName: vendor.name || "", name: me.name, by: "reset", canReply: supportReplyEnabled(),
      });
      await trySend({ to: me.email, ...mail });
    }
    return NextResponse.json({ ok: true, storeCode: vendor.slug || "" });
  } catch (e) {
    console.error("reset confirm error", e);
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    return err(500, "reset_failed", "Couldn't set that PIN. Try the link again.");
  }
}
