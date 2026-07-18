import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireMember } from "@/lib/require-manager";
import { resolveRewards, rewardTiers, pointsForSale, normalizePhone, maskPhone } from "@/lib/rewards";

export const runtime = "nodejs";

// Customer rewards register flow (rewards-program-spec.md, Phase 1). All
// writes go through this trusted route — the same Admin-SDK posture as
// signup/seed/import — so the ledger is append-only BY CONSTRUCTION: the
// client rules allow no writes at all to `customers` / `rewardEvents`, every
// event is signed with the verified caller, points are computed server-side
// from the owner's settings (never taken from the client), and the customer's
// balance is maintained in the same transaction that appends the event, so
// the two can't drift.
//
//   body: { action: "lookup" | "enroll" | "earn" | "redeem" | "adjust",
//           phone, name?, saleDollars?, points?, note? }
//
// Errors carry a stable `code` beside the English message so the register UI
// localizes (the auth-route pattern). `adjust` is owner-only, needs a note,
// and exists so a correction is a new signed line — never an edit.

const err = (status, code, message) =>
  NextResponse.json({ error: message, code }, { status });

const publicCustomer = (id, c) => ({
  id, name: c.name || null, phone: maskPhone(c.phone), pointsBalance: c.pointsBalance || 0,
});

export async function POST(req) {
  try {
    const claims = await requireMember(req);
    const { action, phone: rawPhone, name, saleDollars, points, note, tierId } = await req.json();
    if (!["lookup", "enroll", "earn", "redeem", "adjust"].includes(action))
      return err(400, "bad_action", "Unknown rewards action.");

    const { adminDb } = await getAdmin();
    const vendorRef = adminDb.collection("vendors").doc(claims.vendorId);
    const vendorSnap = await vendorRef.get();
    const rules = resolveRewards(vendorSnap.data()?.rewards);
    if (!rules.enabled) return err(403, "rewards_disabled", "Rewards are not enabled for this store.");

    const phone = normalizePhone(rawPhone);
    if (!phone) return err(400, "bad_phone", "Enter a valid phone number (7–15 digits).");

    const customers = vendorRef.collection("customers");
    const events = vendorRef.collection("rewardEvents");
    const found = await customers.where("phone", "==", phone).limit(1).get();
    const existing = found.empty ? null : found.docs[0];

    if (action === "lookup") {
      return NextResponse.json({
        ok: true, rules,
        customer: existing ? publicCustomer(existing.id, existing.data()) : null,
      });
    }

    if (action === "enroll") {
      if (existing) // idempotent — typing an enrolled number just pulls them up
        return NextResponse.json({ ok: true, rules, customer: publicCustomer(existing.id, existing.data()) });
      const doc = {
        phone, name: String(name ?? "").trim().slice(0, 80) || null,
        pointsBalance: 0, createdAt: new Date(), lastEarnAt: null,
        by: claims.name || "", byId: claims.userId,
      };
      const ref = await customers.add(doc);
      return NextResponse.json({ ok: true, rules, customer: publicCustomer(ref.id, doc), enrolled: true });
    }

    // earn / redeem / adjust need an enrolled customer.
    if (!existing) return err(404, "customer_not_found", "No rewards customer with that number — enroll them first.");
    const customerRef = existing.ref;

    // The signed, append-only ledger line + the balance move, atomically.
    const signedEvent = (kind, pts, extra = {}) => ({
      kind, points: pts, customerId: customerRef.id,
      by: claims.name || "", byId: claims.userId, byRole: claims.role || "employee",
      ts: new Date(), ...extra,
    });
    const commit = (kind, pts, extra, minBalance = 0) =>
      adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(customerRef);
        const balance = snap.data()?.pointsBalance || 0;
        if (kind === "redeem" && balance < minBalance)
          throw Object.assign(new Error("Not enough points to redeem."), { status: 409, code: "insufficient_points" });
        tx.set(events.doc(), signedEvent(kind, pts, extra));
        tx.update(customerRef, {
          pointsBalance: balance + pts,
          ...(kind === "earn" ? { lastEarnAt: new Date() } : {}),
        });
        return balance + pts;
      });

    if (action === "earn") {
      const d = Number(saleDollars);
      if (!Number.isFinite(d) || d <= 0 || d > 100000)
        return err(400, "bad_sale", "Enter the qualifying sale total (over $0).");
      const pts = pointsForSale(d, rules); // server-computed — never the client's number
      if (pts < 1) return err(400, "sale_too_small", "That sale is too small to earn a point.");
      const balance = await commit("earn", pts, { saleDollars: Math.round(d * 100) / 100 });
      return NextResponse.json({ ok: true, rules, earned: pts, balance });
    }

    if (action === "redeem") {
      // Tier-aware: the reward menu is resolved server-side from the owner's
      // settings, so the client can only pick which configured tier to redeem —
      // never its points or value. Missing tierId → the (cheapest) first tier,
      // which for a store with no tiers is the legacy single reward.
      const tiers = rewardTiers(vendorSnap.data()?.rewards);
      const tier = tierId ? tiers.find((tt) => tt.id === tierId) : tiers[0];
      if (!tier) return err(400, "bad_tier", "That reward isn't available.");
      const balance = await commit(
        "redeem", -tier.points,
        { value: tier.value, rewardName: tier.name || null, tierId: tier.id },
        tier.points,
      );
      return NextResponse.json({ ok: true, rules, redeemed: tier.points, value: tier.value, reward: tier.name || null, balance });
    }

    // adjust — owner-only, note required; a correction is a new signed line.
    if (claims.role !== "owner") return err(403, "owner_only", "Only the owner can adjust points.");
    const pts = Math.trunc(Number(points));
    if (!Number.isFinite(pts) || pts === 0 || Math.abs(pts) > 100000)
      return err(400, "bad_adjust", "Enter a non-zero whole number of points.");
    const trimmedNote = String(note ?? "").trim();
    if (!trimmedNote) return err(400, "note_required", "An adjustment needs a note — it's part of the permanent record.");
    const balance = await commit("adjust", pts, { note: trimmedNote.slice(0, 300) });
    return NextResponse.json({ ok: true, rules, adjusted: pts, balance });
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("rewards route error", e);
    return NextResponse.json({ error: "Rewards action failed." }, { status: 500 });
  }
}
