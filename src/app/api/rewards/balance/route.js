import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { throttleDecision, attemptKey, IP_LIMIT, STORE_LIMIT, clientIp } from "@/lib/login-throttle";
import { resolveRewards, canRedeem, normalizePhone } from "@/lib/rewards";

export const runtime = "nodejs";

// Public rewards balance check (rewards-program-spec.md, Phase 3): a customer
// types the store code + their phone number and sees their points — no staff
// session. Because it's unauthenticated, it is a phone-enumeration surface, so
// it borrows the login route's two throttles and — stricter than login —
// counts EVERY request against the windows, not just failures: a customer
// checking their balance a few times is fine; a scraper walking numbers hits
// the per-IP wall almost immediately. It never returns a name — only the
// balance and the store's program shape.
const ipOf = (req) => clientIp((n) => req.headers.get(n));
const err = (status, code, message) =>
  NextResponse.json({ error: message, code }, { status });

export async function POST(req) {
  try {
    const { store, phone: rawPhone } = await req.json();
    const slug = String(store ?? "").trim().toLowerCase();
    const phone = normalizePhone(rawPhone);
    if (!slug || !phone) return err(400, "bad_input", "Enter the store code and a valid phone number.");

    const { adminDb } = await getAdmin();
    const now = Date.now();
    const attempts = adminDb.collection("loginAttempts");
    const ipRef = attempts.doc(`rwb_ip_${attemptKey(ipOf(req))}`);
    const storeRef = attempts.doc(`rwb_store_${attemptKey(slug)}`);
    const [ipSnap, storeSnap] = await Promise.all([ipRef.get(), storeRef.get()]);
    const ipDec = throttleDecision(ipSnap.exists ? ipSnap.data() : null, now, IP_LIMIT);
    const storeDec = throttleDecision(storeSnap.exists ? storeSnap.data() : null, now, STORE_LIMIT);
    if (ipDec.blocked || storeDec.blocked)
      return err(429, "throttled", "Too many attempts — wait a few minutes and try again.");
    await Promise.all([ipRef.set(ipDec.nextOnFail), storeRef.set(storeDec.nextOnFail)]);

    const vSnap = await adminDb.collection("vendors").where("slug", "==", slug).limit(1).get();
    if (vSnap.empty) return err(404, "no_store", "No store found for that code.");
    const vendorDoc = vSnap.docs[0];
    const rules = resolveRewards(vendorDoc.data()?.rewards);
    if (!rules.enabled) return err(403, "rewards_disabled", "Rewards are not enabled for this store.");

    const cSnap = await vendorDoc.ref.collection("customers")
      .where("phone", "==", phone).limit(1).get();
    if (cSnap.empty) return err(404, "not_enrolled", "That number isn't enrolled at this store yet — join at the register.");

    const points = cSnap.docs[0].data().pointsBalance || 0;
    return NextResponse.json({
      ok: true, points,
      goal: rules.redeemPoints, value: rules.redeemValue,
      ready: canRedeem(points, rules),
    });
  } catch (e) {
    return NextResponse.json({ error: "Balance check failed." }, { status: 500 });
  }
}
