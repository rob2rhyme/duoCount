import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireMember } from "@/lib/require-manager";
import { verifyPin } from "@/lib/hash";
import { isValidNewPin } from "@/lib/pin";
import { pinTaken, setUserPin } from "@/lib/pin-store";
import {
  cleanEmailInput, buildVerifyEmail, buildPinChangedEmail, buildRecoveryEmailChangedEmail,
  verifyLink, verifyConflict, hasRecoveryEmail,
} from "@/lib/recovery";
import { mintToken, burnTokens, appUrlFrom, trySend } from "@/lib/recovery-store";

export const runtime = "nodejs";

// "My account" — the things a signed-in person may do to their OWN credential,
// which no other route offers:
//   • changePin  — rotate your own PIN with your current one. Until this
//     existed nobody could change their own PIN at all: /api/staff refuses
//     `userId === claims.userId`, so an owner reset by support was stuck with
//     whatever support had chosen.
//   • setEmail / resendVerify — put a recovery address on file and confirm it.
//     An address only counts for recovery once confirmed (see recovery.js), so
//     a typo'd or someone-else's address can never be used to take an account.
//
// Every action is scoped to the caller's own uid from the verified token — no
// userId is read from the body — so this route can't touch anyone else.

const err = (status, code, message) => NextResponse.json({ error: message, code }, { status });

export async function POST(req) {
  try {
    const claims = await requireMember(req);
    const body = await req.json();
    const { action } = body;
    const { adminDb, adminAuth } = await getAdmin();
    const { vendorId, userId } = claims;
    const userRef = adminDb.collection("vendors").doc(vendorId).collection("users").doc(userId);
    const [userSnap, vendorSnap] = await Promise.all([
      userRef.get(),
      adminDb.collection("vendors").doc(vendorId).get(),
    ]);
    if (!userSnap.exists) return err(404, "no_user", "Your account no longer exists.");
    const me = { id: userSnap.id, ...userSnap.data() };
    const storeName = vendorSnap.exists ? (vendorSnap.data().name || "") : "";
    const lang = body.lang === "es" ? "es" : "en";

    if (action === "changePin") {
      const current = String(body.currentPin ?? "").trim();
      const next = String(body.pin ?? "").trim();
      if (!isValidNewPin(next)) return err(400, "bad_new_pin", "PIN must be 6 digits.");
      // Someone who walked up to an unlocked phone shouldn't be able to take the
      // account over, so the CURRENT PIN is required — even though the session
      // is already authenticated. `mustChangePin` is the one exception: that PIN
      // was handed to the person by an owner or by support, and demanding they
      // re-enter it would just be theatre.
      const credsSnap = await userRef.collection("private").doc("creds").get();
      const stored = credsSnap.exists ? credsSnap.data().pinHash : null;
      if (!me.mustChangePin && (!stored || !verifyPin(current, stored)))
        return err(401, "bad_current_pin", "That's not your current PIN.");
      // Re-entering the PIN you already have is never a change. Checked against
      // the STORED hash, not against what was typed: on the forced-change screen
      // no current PIN is submitted, so comparing the two inputs would happily
      // let someone "replace" support's temporary PIN with itself — clearing
      // mustChangePin while leaving the credential support read out still live.
      if (stored && verifyPin(next, stored))
        return err(400, "same_pin", "Choose a PIN you haven't used here.");
      // Generic on purpose: naming the colliding staff member would turn this
      // form into a probe for the store's live PINs.
      if (await pinTaken(adminDb, vendorId, next, userId))
        return err(409, "pin_taken", "Pick a different PIN.");

      await setUserPin(adminDb, adminAuth, { vendorId, userId, pin: next, mustChangePin: false });
      if (hasRecoveryEmail(me)) {
        const mail = buildPinChangedEmail({ lang, storeName, name: me.name, by: "self" });
        await trySend({ to: me.email, ...mail });
      }
      // setUserPin revoked this session along with every other: the client signs
      // out and comes back with the new PIN.
      return NextResponse.json({ ok: true, signOut: true });
    }

    if (action === "setEmail") {
      const em = cleanEmailInput(body.email);
      if (em.error) return err(400, "bad_email", "Enter a valid email (or leave it blank).");

      // Setting the recovery address IS a credential change — arguably a bigger
      // one than the PIN. It decides who can take this account over later, and
      // unlike a PIN it OUTLIVES every later PIN change, so the rightful owner
      // can't evict a hijacker by rotating their PIN. Without the current PIN
      // here, a minute alone with a signed-in device (the exact threat the
      // changePin branch above guards against) converts into permanent, silent
      // account takeover: repoint the address, confirm it from your own inbox,
      // walk away, and request a reset link from anywhere, forever.
      const credsSnap = await userRef.collection("private").doc("creds").get();
      const stored = credsSnap.exists ? credsSnap.data().pinHash : null;
      if (!stored || !verifyPin(String(body.currentPin ?? "").trim(), stored))
        return err(401, "bad_current_pin", "That's not your current PIN.");

      // Whoever holds the address that's losing its claim is the one party who
      // can spot a hijack and — by definition — isn't the attacker. Tell them,
      // on a change and on a removal alike. Best-effort: never blocks the edit.
      const losing = hasRecoveryEmail(me) && (me.email || null) !== (em.email || null) ? me.email : null;
      const notifyLosing = (newEmail) => (losing
        ? trySend({ to: losing, ...buildRecoveryEmailChangedEmail({ lang, storeName, name: me.name, newEmail }) })
        : Promise.resolve(false));

      if (!em.email) {
        // Clearing the address also clears the confirmation and any link in
        // flight — otherwise a removed address could still recover the account.
        await userRef.update({ email: null, emailVerifiedAt: null });
        await burnTokens(adminDb, { kind: "verify", vendorId, userId });
        await notifyLosing(null);
        return NextResponse.json({ ok: true, email: null, verified: false });
      }
      const users = (await adminDb.collection("vendors").doc(vendorId).collection("users").get())
        .docs.map((d) => ({ id: d.id, ...d.data() }));
      if (verifyConflict(users, em.email, userId))
        return err(409, "email_claimed", "Another person at this store already recovers with that address.");
      // A changed address is unconfirmed until its owner proves they read it.
      await userRef.update({ email: em.email, emailVerifiedAt: null });
      const { token } = await mintToken(adminDb, { kind: "verify", vendorId, userId });
      const link = verifyLink(appUrlFrom(req), token);
      const mail = buildVerifyEmail({ lang, storeName, name: me.name, link });
      const sent = await trySend({ to: em.email, ...mail });
      await notifyLosing(em.email);
      return NextResponse.json({ ok: true, email: em.email, verified: false, sent });
    }

    if (action === "resendVerify") {
      const email = me.email || null;
      if (!email) return err(400, "no_email", "Add an email first.");
      if (me.emailVerifiedAt) return NextResponse.json({ ok: true, verified: true, sent: false });
      const { token } = await mintToken(adminDb, { kind: "verify", vendorId, userId });
      const link = verifyLink(appUrlFrom(req), token);
      const mail = buildVerifyEmail({ lang, storeName, name: me.name, link });
      const sent = await trySend({ to: email, ...mail });
      return NextResponse.json({ ok: true, verified: false, sent });
    }

    return err(400, "bad_action", "Unknown account action.");
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("account route error", e);
    return NextResponse.json({ error: "Account action failed.", code: "account_failed" }, { status: 500 });
  }
}
