import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireOwner } from "@/lib/require-manager";
import { sendDigestForVendor } from "@/lib/digest";

export const runtime = "nodejs";

// Owner-triggered test send. Ignores lastSentDate (and doesn't update it), so
// testing never suppresses the real morning digest.
export async function POST(req) {
  try {
    const claims = await requireOwner(req);
    const { adminDb } = await getAdmin();

    const vendorSnap = await adminDb.collection("vendors").doc(claims.vendorId).get();
    if (!vendorSnap.exists) return NextResponse.json({ error: "Vendor not found." }, { status: 404 });

    const recipients = vendorSnap.data().digest?.recipients || [];
    if (!recipients.length)
      return NextResponse.json({ error: "Add recipients and save settings first." }, { status: 400 });

    await sendDigestForVendor(adminDb, vendorSnap, { force: true });
    return NextResponse.json({ ok: true, message: `Test digest sent to ${recipients.length} recipient(s)` });
  } catch (e) {
    // Keep the one actionable config hint; otherwise surface only typed errors,
    // never a raw message (which could carry project/config detail).
    if (/RESEND_API_KEY|DIGEST_FROM/.test(e.message || ""))
      return NextResponse.json({ error: "Email isn't configured yet — set RESEND_API_KEY and DIGEST_FROM. See README." }, { status: e.status || 500 });
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("digest test error", e);
    return NextResponse.json({ error: "Failed to send the test digest." }, { status: 500 });
  }
}
