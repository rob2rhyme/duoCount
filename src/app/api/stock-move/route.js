import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireMember } from "@/lib/require-manager";
import { normalizeRequestId, ledgerDocId } from "@/lib/idempotency";

export const runtime = "nodejs";

// Backroom quick moves — the "pulled a Geekbar to the front" tap. The same
// trusted posture as /api/rewards: ANY member can move stock, but the item's
// live quantity and the signed, append-only movement line commit in ONE
// transaction, so the running count and the audit trail can never drift.
// Client rules allow no writes at all to stockMoves.
//
//   body: { itemId, delta, note? }   delta: whole units, + restock / − pull
//
// A pull floors at zero — the ledger records what ACTUALLY moved (`applied`),
// never a fantasy negative shelf.

const err = (status, code, message) =>
  NextResponse.json({ error: message, code }, { status });

export async function POST(req) {
  try {
    const claims = await requireMember(req);
    const { itemId, delta: rawDelta, note, requestId } = await req.json();
    const delta = Math.trunc(Number(rawDelta));
    if (!itemId || !Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 999)
      return err(400, "bad_move", "Enter a non-zero whole move of at most 999 units.");
    // Idempotency: a client key dedupes a replayed POST so one tap can't book
    // two moves. Malformed → reject; missing → today's behavior.
    const rid = normalizeRequestId(requestId);
    if (rid.error) return err(400, "bad_request_id", "Invalid request id.");

    const { adminDb } = await getAdmin();
    const vendorRef = adminDb.collection("vendors").doc(claims.vendorId);
    const itemRef = vendorRef.collection("items").doc(String(itemId));
    const moves = vendorRef.collection("stockMoves");
    // A deterministic move-line id (scoped by item) makes a replay land on the
    // same line; the transaction short-circuits if it already exists.
    const moveRef = rid.id ? moves.doc(ledgerDocId(itemRef.id, rid.id)) : moves.doc();

    const out = await adminDb.runTransaction(async (tx) => {
      // All reads before any write (Firestore rule).
      const snap = await tx.get(itemRef);
      const prior = rid.id ? await tx.get(moveRef) : null;
      if (!snap.exists)
        throw Object.assign(new Error("No such item."), { status: 404, code: "item_not_found" });
      const it = snap.data();
      const cur = Number.isFinite(Number(it.quantity)) ? Number(it.quantity) : 0;
      // Idempotent replay: this request already moved stock — report the live
      // quantity + the move it recorded, applying nothing further.
      if (prior && prior.exists) {
        const p = prior.data();
        return { newQty: cur, applied: Number(p.delta) || 0, deduped: true };
      }
      const applied = delta < 0 ? -Math.min(cur, -delta) : delta;
      if (applied === 0)
        throw Object.assign(new Error("Nothing left to pull."), { status: 409, code: "stock_empty" });
      const newQty = cur + applied;
      tx.set(moveRef, {
        itemId: itemRef.id, itemName: it.name || "", locationId: it.locationId || null,
        delta: applied, newQty, note: String(note ?? "").trim().slice(0, 120) || null,
        by: claims.name || "", byId: claims.userId, byRole: claims.role || "employee",
        source: "backroom", ts: new Date(),
      });
      tx.update(itemRef, { quantity: newQty });
      return { newQty, applied };
    });

    return NextResponse.json({ ok: true, itemId, quantity: out.newQty, applied: out.applied, ...(out.deduped ? { deduped: true } : {}) });
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("stock-move error", e);
    return NextResponse.json({ error: "Stock move failed." }, { status: 500 });
  }
}
