import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { sendDigestForVendor } from "@/lib/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Constant-time string compare so matching the cron secret can't be teased out
// by response-timing. Length differing is fine to short-circuit (not secret).
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Daily digest cron (see vercel.json). Vercel sends
// `Authorization: Bearer ${CRON_SECRET}` automatically when the env var is set.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization") || "";
  if (!secret || !safeEqual(authz, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { adminDb } = await getAdmin();
    const vendors = await adminDb.collection("vendors").where("digest.enabled", "==", true).get();

    let sent = 0, skipped = 0, failed = 0;
    for (const v of vendors.docs) {
      try {
        const result = await sendDigestForVendor(adminDb, v);
        if (result === "sent") sent++; else skipped++;
      } catch (e) {
        failed++;
        console.error(`digest failed for vendor ${v.id}:`, e.message);
      }
    }
    return NextResponse.json({ sent, skipped, failed, vendors: vendors.size });
  } catch (e) {
    console.error("cron digest error", e);
    return NextResponse.json({ error: e.message || "Failed." }, { status: 500 });
  }
}
