import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { throttleDecision, attemptKey, clientIp, RECOVERY_CONFIRM_LIMIT } from "@/lib/login-throttle";
import { verifyConflict } from "@/lib/recovery";
import { peekToken, consumeToken } from "@/lib/recovery-store";

export const runtime = "nodejs";

// Confirm a recovery address. Signed OUT on purpose — the link lands in a
// mailbox that may be read on a different device from the one the app is
// installed on, so requiring a session would strand exactly the people who most
// need recovery set up.
//
// Confirming is what makes an address able to reset a PIN, so it's also where
// the one-address-per-person rule is enforced: if somebody else at the store
// already confirmed it, this refuses rather than leaving two accounts tied to
// one inbox (which resolveResetTarget would then refuse to recover, silently).

const err = (status, code, message) => NextResponse.json({ error: message, code }, { status });
const ipOf = (req) => clientIp((n) => req.headers.get(n));

export async function POST(req) {
  try {
    const { token } = await req.json();
    const { adminDb } = await getAdmin();
    const now = Date.now();

    const ipRef = adminDb.collection("loginAttempts").doc(`verify_${attemptKey(ipOf(req))}`);
    const ipSnap = await ipRef.get();
    const dec = throttleDecision(ipSnap.exists ? ipSnap.data() : null, now, RECOVERY_CONFIRM_LIMIT);
    if (dec.blocked) return err(429, "throttled", "Too many attempts — wait a few minutes and try again.");
    await ipRef.set(dec.nextOnFail);

    // Peek first, spend last: a conflict or a deactivated account is worth
    // reporting without also burning the link on the way out.
    const { state, doc } = await peekToken(adminDb, token, "verify", now);
    if (state !== "ok") return err(400, `link_${state}`, "That link isn't usable — send yourself a new one.");

    const vendorRef = adminDb.collection("vendors").doc(doc.vendorId);
    const userRef = vendorRef.collection("users").doc(doc.userId);
    const [userSnap, usersSnap] = await Promise.all([userRef.get(), vendorRef.collection("users").get()]);
    if (!userSnap.exists || userSnap.data().active === false)
      return err(400, "link_missing", "That link isn't usable — send yourself a new one.");
    const me = { id: userSnap.id, ...userSnap.data() };
    if (!me.email) return err(400, "no_email", "There's no email on that account any more.");

    const others = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (verifyConflict(others, me.email, me.id))
      return err(409, "email_claimed", "Another person at this store already recovers with that address.");

    const spent = await consumeToken(adminDb, token, "verify", now);
    if (spent.state !== "ok") return err(400, `link_${spent.state}`, "That link isn't usable — send yourself a new one.");
    await userRef.update({ emailVerifiedAt: new Date(now) });
    return NextResponse.json({ ok: true, email: me.email });
  } catch (e) {
    console.error("verify-email error", e);
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    return err(500, "verify_failed", "Couldn't confirm that address. Try the link again.");
  }
}
