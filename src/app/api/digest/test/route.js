import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { sendDigestForVendor } from "@/lib/digest";

export const runtime = "nodejs";

// Owner-triggered test send. Ignores lastSentDate (and doesn't update it), so
// testing never suppresses the real morning digest.
export async function POST(req) {
  try {
    const authz = req.headers.get("authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { adminAuth, adminDb } = await getAdmin();
    const claims = await adminAuth.verifyIdToken(idToken);
    if (!claims.vendorId || claims.role !== "owner")
      return NextResponse.json({ error: "Owners only." }, { status: 403 });

    const vendorSnap = await adminDb.collection("vendors").doc(claims.vendorId).get();
    if (!vendorSnap.exists) return NextResponse.json({ error: "Vendor not found." }, { status: 404 });

    const recipients = vendorSnap.data().digest?.recipients || [];
    if (!recipients.length)
      return NextResponse.json({ error: "Add recipients and save settings first." }, { status: 400 });

    await sendDigestForVendor(adminDb, vendorSnap, { force: true });
    return NextResponse.json({ ok: true, message: `Test digest sent to ${recipients.length} recipient(s)` });
  } catch (e) {
    const msg = /RESEND_API_KEY|DIGEST_FROM/.test(e.message)
      ? "Email isn't configured yet — set RESEND_API_KEY and DIGEST_FROM. See README."
      : e.message || "Failed.";
    return NextResponse.json({ error: msg }, { status: e.status || 500 });
  }
}
