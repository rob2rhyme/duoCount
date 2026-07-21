import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireMember } from "@/lib/require-manager";
import { computeSplit } from "@/lib/gaming";
import { normalizeRequestId, ledgerDocId } from "@/lib/idempotency";

export const runtime = "nodejs";

// Gaming/amusement-machine collection ledger — the same trusted posture as
// /api/stock-move and /api/rewards. ANY member (the attending staff on
// collection day) records a machine's total collection + payout; the route
// looks up that machine's contract, recomputes the store/company split
// server-side (store floors at $0), and appends ONE signed, append-only line.
// Client rules allow no writes at all to gamingCollections, and reads are
// owner-only — staff enter, they don't see the totals.
//
//   body: { machineId, collectionDate (YYYY-MM-DD), collection, payout, note? }
//
// The response deliberately carries NO money back: staff submit blind, so the
// split and the store's take stay owner-only end to end.

const err = (status, code, message) => NextResponse.json({ error: message, code }, { status });
const MAX = 10_000_000; // a single collection/payout ceiling — a sanity bound, not a business rule
const isMoney = (v) => Number.isFinite(v) && v >= 0 && v <= MAX;

export async function POST(req) {
  try {
    const claims = await requireMember(req);
    const { machineId, collectionDate, collection, payout, note, requestId } = await req.json();

    if (!machineId || typeof machineId !== "string")
      return err(400, "machine_missing", "Pick a machine.");
    // Idempotency: a client-supplied key dedupes a replayed POST. Malformed →
    // reject; missing → today's behavior (a fresh line every time).
    const rid = normalizeRequestId(requestId);
    if (rid.error) return err(400, "bad_request_id", "Invalid request id.");
    if (typeof collectionDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(collectionDate))
      return err(400, "date_invalid", "Enter a valid collection date.");
    const c = Number(collection);
    const p = Number(payout);
    if (!isMoney(c)) return err(400, "collection_invalid", "Enter a collection amount of 0 or more.");
    if (!isMoney(p)) return err(400, "payout_invalid", "Enter a payout amount of 0 or more.");

    const { adminDb } = await getAdmin();
    const vendorRef = adminDb.collection("vendors").doc(claims.vendorId);
    const machineRef = vendorRef.collection("machines").doc(machineId);
    const mSnap = await machineRef.get();
    if (!mSnap.exists)
      return err(404, "machine_not_found", "That machine isn't in the registry.");
    const m = mSnap.data();
    if (m.active === false)
      return err(409, "machine_inactive", "That machine is disabled.");

    // Contract terms come from the machine doc, never the client — the split is
    // recomputed here so a tampered client can't inflate the store's take.
    const split = computeSplit(c, p, m.storePct);

    // A deterministic doc id from the requestId means a replay lands on the same
    // doc; create() refuses to overwrite, so ALREADY_EXISTS is the idempotent
    // no-op. No requestId → a fresh id, never a collision.
    const gc = vendorRef.collection("gamingCollections");
    const lineRef = rid.id ? gc.doc(ledgerDocId(machineId, rid.id)) : gc.doc();
    try {
      await lineRef.create({
        machineId,
        machineName: m.name || "",
        company: m.company || "",
        machineType: m.type || "other",
        cadence: m.cadence || "weekly",
        collectionDate,
        collection: split.collection,
        payout: split.payout,
        net: split.net,
        storePct: split.storePct,
        storeShare: split.storeShare,
        companyShare: split.companyShare,
        note: String(note ?? "").trim().slice(0, 200) || null,
        by: claims.name || "",
        byId: claims.userId,
        byRole: claims.role || "employee",
        ts: new Date(),
      });
    } catch (e) {
      // gRPC ALREADY_EXISTS (6) → the same request already booked this line.
      if (rid.id && (e?.code === 6 || e?.code === "already-exists"))
        return NextResponse.json({ ok: true, deduped: true });
      throw e;
    }

    // No money in the response — staff submit blind (owner-only totals).
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("gaming error", e);
    return NextResponse.json({ error: "Collection entry failed." }, { status: 500 });
  }
}
