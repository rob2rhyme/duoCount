import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { throttleDecision, attemptKey, clientIp, RESET_IP_LIMIT, RESET_STORE_LIMIT } from "@/lib/login-throttle";
import { NEUTRAL_RESULT, normalizeEmail, resolveResetTarget, resetLink, buildResetEmail } from "@/lib/recovery";
import { mintToken, appUrlFrom, trySend } from "@/lib/recovery-store";

export const runtime = "nodejs";

// "I forgot my PIN" — step 1: ask for a link.
//
// The answer is ALWAYS the same body (recovery.NEUTRAL_RESULT), whatever
// happened: unknown store code, unknown address, an address nobody confirmed,
// two people sharing one address, a suspended store, Resend not configured, a
// bounced send. Anything else would turn this open form into a directory of
// which stores exist and who works at them. The one observable difference is
// the 429 when the caller is hammering it, which says nothing about any store.
//
// Only a CONFIRMED address can receive a link (recovery.resolveResetTarget), so
// an attacker who types a victim's store code plus their own address gets
// silence, not a link.

const ipOf = (req) => clientIp((n) => req.headers.get(n));

export async function POST(req) {
  try {
    const { storeCode, email, lang } = await req.json();
    const { adminDb } = await getAdmin();
    const now = Date.now();
    const slug = String(storeCode ?? "").trim().toLowerCase();

    // Per-IP and per-store, counting every attempt — see login-throttle.js.
    const attempts = adminDb.collection("loginAttempts");
    const ipRef = attempts.doc(`reset_ip_${attemptKey(ipOf(req))}`);
    const storeRef = attempts.doc(`reset_store_${attemptKey(slug)}`);
    const [ipSnap, storeSnap] = await Promise.all([ipRef.get(), storeRef.get()]);
    const ipDec = throttleDecision(ipSnap.exists ? ipSnap.data() : null, now, RESET_IP_LIMIT);
    const storeDec = throttleDecision(storeSnap.exists ? storeSnap.data() : null, now, RESET_STORE_LIMIT);
    if (ipDec.blocked || storeDec.blocked)
      return NextResponse.json({ error: "Too many attempts — wait a few minutes and try again.", code: "throttled" }, { status: 429 });
    await Promise.all([ipRef.set(ipDec.nextOnFail), storeRef.set(storeDec.nextOnFail)]);

    const wanted = normalizeEmail(email);
    if (!slug || !wanted) return NextResponse.json(NEUTRAL_RESULT);

    const vSnap = await adminDb.collection("vendors").where("slug", "==", slug).limit(1).get();
    if (vSnap.empty) return NextResponse.json(NEUTRAL_RESULT);
    const vendorDoc = vSnap.docs[0];
    const vendor = vendorDoc.data();
    // A suspended or removed store can't sign anyone in, so it can't recover
    // anyone either — and it says so no more loudly than anything else here.
    if (vendor.status === "suspended" || vendor.status === "deleted")
      return NextResponse.json(NEUTRAL_RESULT);

    const users = (await vendorDoc.ref.collection("users").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    const target = resolveResetTarget(users, wanted);
    if (!target) return NextResponse.json(NEUTRAL_RESULT);

    const { token } = await mintToken(adminDb, { kind: "reset", vendorId: vendorDoc.id, userId: target.id });
    const link = resetLink(appUrlFrom(req), token);
    const mail = buildResetEmail({
      lang: lang === "es" ? "es" : "en",
      storeName: vendor.name || "", name: target.name, link,
    });
    await trySend({ to: target.email, ...mail }); // best-effort: never changes the answer
    return NextResponse.json(NEUTRAL_RESULT);
  } catch (e) {
    console.error("reset request error", e);
    // Even an internal failure keeps the neutral shape — a 500 here would tell a
    // prober that their input got further than someone else's.
    return NextResponse.json(NEUTRAL_RESULT);
  }
}
