import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAdmin } from "@/lib/firebase-admin";
import { requireMember } from "@/lib/require-manager";
import { resolveRewards, rewardTiers, tierDollarValue, vipTierFor, nextStreak, pointsForSale, sanitizeProfile, normalizePhone, maskPhone, pointsExpiry } from "@/lib/rewards";
import { customerIdFromBytes } from "@/lib/customer-id";

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

// Legacy customers predate lifetimePoints — floor it at the current balance
// (they earned at least what they hold), so status never starts negative.
const lifetimeOf = (c) => Math.max(Number(c.lifetimePoints) || 0, Number(c.pointsBalance) || 0);

// A signed ledger line for points that lapsed under the inactivity-expiry
// policy. Written by the SYSTEM, not a clerk — it's a policy event, not an
// action — so it never reads as personnel activity. lifetimePoints is left
// untouched (expiry sheds spendable points, never earned VIP status).
const expireLine = (customerId, balance, months) => ({
  kind: "expire", points: -Math.abs(balance), customerId,
  by: "System", byId: "system", byRole: "system", ts: new Date(),
  note: `Points expired after ${months} months of inactivity`,
});

// A unique auto customer id for this store — a short Crockford code, re-rolled on
// the ~never in-store collision (an 8-char code is ~1 in 10^12). The register
// enrolls through the Admin SDK, so this query + write are trusted.
async function generateUniqueCustomerId(customers) {
  for (let i = 0; i < 8; i++) {
    const code = customerIdFromBytes(randomBytes(8), 8);
    const hit = await customers.where("customerId", "==", code).limit(1).get();
    if (hit.empty) return code;
  }
  return customerIdFromBytes(randomBytes(12), 12); // vanishingly unlikely fallback
}

const publicCustomer = (id, c, rules) => {
  const exp = pointsExpiry(c, rules);
  return {
    id, name: c.name || null, phone: maskPhone(c.phone), pointsBalance: c.pointsBalance || 0,
    lifetimePoints: lifetimeOf(c), vipTier: vipTierFor(lifetimeOf(c), rules)?.name || null,
    currentStreak: Number(c.currentStreak) || 0, longestStreak: Number(c.longestStreak) || 0,
    // CRM fields the register card shows (staff serve the customer with them).
    note: c.note || null, email: c.email || null, address: c.address || null,
    customerId: c.customerId || null,
    birthdayMonth: c.birthdayMonth ?? null, birthdayDay: c.birthdayDay ?? null,
    stamps: c.stamps || {},
    // Inactivity-expiry disclosure the register can show the customer.
    expiryMonths: exp.months, expiresAt: exp.expiresAt ? exp.expiresAt.toISOString().slice(0, 10) : null,
  };
};

export async function POST(req) {
  try {
    const claims = await requireMember(req);
    const { action, phone: rawPhone, name, saleDollars, points, note, tierId, referredBy, cardId, eventId,
      email, address, birthdayMonth, birthdayDay, customerId, initialPoints,
      newName, newPhone, newNote, newEmail, newBirthdayMonth, newBirthdayDay, newAddress, newCustomerId } = await req.json();
    if (!["lookup", "enroll", "earn", "redeem", "adjust", "update", "stamp", "stampRedeem", "undo"].includes(action))
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

    // Load an enrolled customer for a READ, keeping two invariants current: (1)
    // backfill a missing customer id — legacy customers predate auto-ids, so the
    // register and the customer's QR always have one; (2) materialize lapsed
    // points as a signed "expire" line and zero the balance if the account has
    // been inactive past the owner's expiry window (the earn/redeem/adjust path
    // expires inside its own transaction, see commit). Both are idempotent no-ops
    // once satisfied.
    const hydrateCustomer = async (doc) => {
      let data = doc.data();
      if (!(data.customerId && String(data.customerId).trim())) {
        const code = await generateUniqueCustomerId(customers);
        await doc.ref.update({ customerId: code });
        data = { ...data, customerId: code };
      }
      const exp = pointsExpiry(data, rules, new Date());
      if (!(exp.expired && (data.pointsBalance || 0) > 0)) return data;
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(doc.ref);
        const c = snap.data() || {};
        const bal = c.pointsBalance || 0;
        if (pointsExpiry(c, rules, new Date()).expired && bal > 0) {
          tx.set(events.doc(), expireLine(doc.id, bal, exp.months));
          tx.update(doc.ref, { pointsBalance: 0 });
        }
      });
      return { ...data, pointsBalance: 0 };
    };

    if (action === "lookup") {
      return NextResponse.json({
        ok: true, rules,
        customer: existing ? publicCustomer(existing.id, await hydrateCustomer(existing), rules) : null,
      });
    }

    if (action === "enroll") {
      if (existing) // idempotent — typing an enrolled number just pulls them up
        return NextResponse.json({ ok: true, rules, customer: publicCustomer(existing.id, await hydrateCustomer(existing), rules) });

      // Referral (optional): the new customer names who sent them. Both sides
      // get points as signed "referral" ledger lines — a kind the outpaced-
      // sales audit ignores (it reconciles EARNS against sales), so a referral
      // drive never reads as invented points. Bad referrer phone → the
      // enrollment still succeeds; the response says why no bonus landed.
      const refPhone = normalizePhone(referredBy);
      const refWanted = refPhone && (rules.referral.referrer > 0 || rules.referral.friend > 0);
      let referrerDoc = null;
      let referral = null;
      if (refWanted) {
        if (refPhone === phone) referral = { error: "self_referral" };
        else {
          const refSnap = await customers.where("phone", "==", refPhone).limit(1).get();
          if (refSnap.empty) referral = { error: "referrer_not_found" };
          else referrerDoc = refSnap.docs[0];
        }
      }

      // CRM fields + a store-assigned customer id set right at enrollment (same
      // validators as the owner Profile edit). A bad email/birthday rejects the
      // whole enroll rather than silently dropping the field.
      const prof = sanitizeProfile({ note, email, address, birthdayMonth, birthdayDay, customerId });
      if (prof.error) return err(400, prof.error, "Check the customer details.");
      // A starting points balance is a POINTS GRANT, so it's owner-only (the same
      // gate as adjust) and recorded as a signed ledger line below — never a
      // silent, unaudited balance a clerk could seed.
      let startPts = 0;
      if (initialPoints !== undefined && initialPoints !== null && String(initialPoints).trim() !== "") {
        if (claims.role !== "owner") return err(403, "owner_only", "Only the owner can set a starting points balance.");
        const ip = Math.trunc(Number(initialPoints));
        if (!Number.isFinite(ip) || ip < 0 || ip > 100000)
          return err(400, "bad_initial_points", "Starting points must be a whole number, 0 or more.");
        startPts = ip;
      }

      const friendPts = referrerDoc ? rules.referral.friend : 0;
      const startBalance = friendPts + startPts;
      // Auto-populate the customer id: use the one the clerk typed if any, else
      // generate a unique short code so every customer has a scannable id.
      const autoCustomerId = prof.patch.customerId || await generateUniqueCustomerId(customers);
      const doc = {
        phone, name: String(name ?? "").trim().slice(0, 80) || null,
        ...prof.patch, // note, email, address, birthday, customerId (overridden below)
        customerId: autoCustomerId,
        pointsBalance: startBalance, lifetimePoints: startBalance, createdAt: new Date(), lastEarnAt: null,
        by: claims.name || "", byId: claims.userId,
        ...(referrerDoc ? { referredBy: referrerDoc.id } : {}),
      };
      const ref = await customers.add(doc);
      // Audit the seeded balance as a signed adjust line (owner-gated above).
      if (startPts > 0) {
        await events.add({
          kind: "adjust", points: startPts, customerId: ref.id,
          by: claims.name || "", byId: claims.userId, byRole: claims.role || "owner",
          ts: new Date(), note: "Starting balance (enrollment)",
        });
      }

      if (referrerDoc) {
        const signed = (pts, extra) => ({
          kind: "referral", points: pts,
          by: claims.name || "", byId: claims.userId, byRole: claims.role || "employee",
          ts: new Date(), ...extra,
        });
        if (friendPts > 0)
          await events.add(signed(friendPts, { customerId: ref.id, referredBy: referrerDoc.id }));
        if (rules.referral.referrer > 0) {
          // Credit the referrer atomically against their LIVE balance.
          await adminDb.runTransaction(async (tx) => {
            const s = await tx.get(referrerDoc.ref);
            const c = s.data() || {};
            tx.set(events.doc(), signed(rules.referral.referrer, { customerId: referrerDoc.id, referredCustomerId: ref.id }));
            tx.update(referrerDoc.ref, {
              pointsBalance: (c.pointsBalance || 0) + rules.referral.referrer,
              // Referral points are earned points for status purposes — but a
              // referral is not a VISIT, so lastEarnAt/streak stay untouched.
              lifetimePoints: lifetimeOf(c) + rules.referral.referrer,
            });
          });
        }
        referral = {
          ok: true, referrerName: referrerDoc.data().name || maskPhone(referrerDoc.data().phone),
          referrerPts: rules.referral.referrer, friendPts,
        };
      }
      return NextResponse.json({ ok: true, rules, customer: publicCustomer(ref.id, doc, rules), enrolled: true, referral });
    }

    // earn / redeem / adjust / update need an enrolled customer.
    if (!existing) return err(404, "customer_not_found", "No rewards customer with that number — enroll them first.");
    const customerRef = existing.ref;

    if (action === "update") {
      // Owner-only profile edit (name / phone / CRM fields). Touches identity
      // and profile fields ONLY — never points, never the ledger. A phone
      // change checks uniqueness so two customers can't collide on one number.
      if (claims.role !== "owner") return err(403, "owner_only", "Only the owner can edit customer profiles.");
      const prof = sanitizeProfile({
        note: newNote, email: newEmail, address: newAddress, customerId: newCustomerId,
        birthdayMonth: newBirthdayMonth, birthdayDay: newBirthdayDay,
      });
      if (prof.error) return err(400, prof.error, "Check the profile fields.");
      const patch = { ...prof.patch };
      if (newName !== undefined) patch.name = String(newName ?? "").trim().slice(0, 80) || null;
      if (newPhone !== undefined) {
        const p = normalizePhone(newPhone);
        if (!p) return err(400, "bad_phone", "Enter a valid phone number (7–15 digits).");
        if (p !== phone) {
          const clash = await customers.where("phone", "==", p).limit(1).get();
          if (!clash.empty) return err(409, "phone_taken", "Another customer already uses that number.");
          patch.phone = p;
        }
      }
      if (Object.keys(patch).length) await customerRef.set(patch, { merge: true });
      const fresh = { ...existing.data(), ...patch };
      return NextResponse.json({ ok: true, rules, customer: publicCustomer(existing.id, fresh, rules), phoneDigits: fresh.phone });
    }

    // Punch cards (port slice 5): a stamp is a signed ledger line + the card
    // counter move, atomically — the same posture as points, but a separate
    // currency (points: 0 on every stamp line, so no points math ever shifts).
    if (action === "stamp" || action === "stampRedeem") {
      const card = rules.stamps.find((cd) => cd.id === cardId);
      if (!card) return err(400, "bad_card", "That punch card isn't configured.");
      const out = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(customerRef);
        const c = snap.data() || {};
        const cur = Math.max(0, Math.trunc(Number(c.stamps?.[card.id]) || 0));
        if (action === "stampRedeem" && cur < card.goal)
          throw Object.assign(new Error("The card isn't full yet."), { status: 409, code: "stamps_short" });
        const next = action === "stamp" ? cur + 1 : cur - card.goal;
        const eventRef = events.doc();
        tx.set(eventRef, {
          kind: action === "stamp" ? "stamp" : "stampRedeem", points: 0,
          customerId: customerRef.id, cardId: card.id, cardName: card.name,
          count: next, goal: card.goal,
          ...(action === "stampRedeem" ? { reward: card.reward } : {}),
          by: claims.name || "", byId: claims.userId, byRole: claims.role || "employee",
          ts: new Date(),
        });
        tx.update(customerRef, { [`stamps.${card.id}`]: next });
        return { count: next, eventId: eventRef.id };
      });
      return NextResponse.json({
        ok: true, rules, cardId: card.id, count: out.count, goal: card.goal, eventId: out.eventId,
        ...(action === "stampRedeem" ? { reward: card.reward } : {}),
      });
    }

    // Undo — the register's 15-minute take-back. NEVER an edit: the reversal
    // is a NEW signed "undo" ledger line, and the original merely gains a
    // reversedBy pointer so it can't be reversed twice. Your own recent lines
    // only (the owner can undo anyone's); referrals are excluded (two-sided).
    if (action === "undo") {
      const UNDO_WINDOW_MS = 15 * 60 * 1000;
      if (!eventId) return err(404, "undo_not_found", "Nothing to undo.");
      const evRef = events.doc(String(eventId));
      const out = await adminDb.runTransaction(async (tx) => {
        const [evSnap, cSnap] = await Promise.all([tx.get(evRef), tx.get(customerRef)]);
        const boom = (status, code, message) => Object.assign(new Error(message), { status, code });
        if (!evSnap.exists) throw boom(404, "undo_not_found", "Nothing to undo.");
        const ev = evSnap.data();
        if (ev.customerId !== customerRef.id) throw boom(404, "undo_not_found", "Nothing to undo.");
        if (ev.reversedBy) throw boom(409, "undo_already", "Already undone.");
        if (ev.kind === "undo" || ev.kind === "referral")
          throw boom(400, "undo_not_allowed", "That line can't be undone.");
        if (ev.byId !== claims.userId && claims.role !== "owner")
          throw boom(403, "undo_not_yours", "Only the person who made it (or the owner) can undo it.");
        const ts = ev.ts?.toDate ? ev.ts.toDate() : (ev.ts ? new Date(ev.ts) : null);
        if (!ts || Number.isNaN(ts.getTime()) || Date.now() - ts.getTime() > UNDO_WINDOW_MS)
          throw boom(409, "undo_expired", "Too late to undo — it's part of the permanent record now.");

        const c = cSnap.data() || {};
        const undoRef = events.doc();
        const base = {
          kind: "undo", reversesId: evRef.id, reversesKind: ev.kind, customerId: customerRef.id,
          by: claims.name || "", byId: claims.userId, byRole: claims.role || "employee", ts: new Date(),
        };
        const patch = {};
        if (ev.kind === "stamp" || ev.kind === "stampRedeem") {
          const cur = Math.max(0, Math.trunc(Number(c.stamps?.[ev.cardId]) || 0));
          const next = ev.kind === "stamp" ? Math.max(0, cur - 1) : cur + (Number(ev.goal) || 0);
          patch[`stamps.${ev.cardId}`] = next;
          tx.set(undoRef, { ...base, points: 0, cardId: ev.cardId, cardName: ev.cardName || "", count: next, goal: ev.goal ?? null });
        } else {
          const pts = -(Number(ev.points) || 0);
          patch.pointsBalance = Math.max(0, (c.pointsBalance || 0) + pts);
          // A mistaken EARN inflated lifetime too — deflate it, or VIP status
          // could be farmed with earn+undo loops. Redeem/adjust never touch it.
          if (ev.kind === "earn") patch.lifetimePoints = Math.max(0, lifetimeOf(c) + pts);
          tx.set(undoRef, { ...base, points: pts });
        }
        tx.update(evRef, { reversedBy: undoRef.id });
        tx.update(customerRef, patch);
        const stamps = { ...(c.stamps || {}) };
        if (patch[`stamps.${ev.cardId}`] !== undefined) stamps[ev.cardId] = patch[`stamps.${ev.cardId}`];
        return {
          balance: patch.pointsBalance ?? (c.pointsBalance || 0),
          stamps, undoneKind: ev.kind,
        };
      });
      return NextResponse.json({ ok: true, rules, ...out });
    }

    // The signed, append-only ledger line + the balance move, atomically.
    const signedEvent = (kind, pts, extra = {}) => ({
      kind, points: pts, customerId: customerRef.id,
      by: claims.name || "", byId: claims.userId, byRole: claims.role || "employee",
      ts: new Date(), ...extra,
    });
    // pts/extra may be functions of the live customer doc, so per-customer
    // state (the VIP multiplier from lifetime points) is read INSIDE the
    // transaction — no race with a concurrent earn.
    const commit = (kind, ptsOrFn, extraOrFn, minBalance = 0) =>
      adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(customerRef);
        const c = snap.data() || {};
        // Expire lapsed points FIRST, as a signed line, so this action operates
        // on the real post-expiry balance: a redeem can't spend expired points,
        // and an earn re-starts the balance (and resets the inactivity clock).
        let balance = c.pointsBalance || 0;
        const exp = pointsExpiry(c, rules, new Date());
        if (exp.expired && balance > 0) {
          tx.set(events.doc(), expireLine(customerRef.id, balance, exp.months));
          balance = 0;
        }
        const pts = typeof ptsOrFn === "function" ? ptsOrFn(c) : ptsOrFn;
        const extra = typeof extraOrFn === "function" ? extraOrFn(c) : extraOrFn;
        if (kind === "redeem" && balance < minBalance)
          throw Object.assign(new Error("Not enough points to redeem."), { status: 409, code: "insufficient_points" });
        const eventRef = events.doc();
        tx.set(eventRef, signedEvent(kind, pts, extra));
        // Streak advances on visits (earns) only, computed from the PRE-earn
        // lastEarnAt inside this transaction; longest is a high-water mark.
        const streak = kind === "earn" ? nextStreak(c, new Date(), rules) : null;
        tx.update(customerRef, {
          pointsBalance: balance + pts,
          // Lifetime points are MONOTONIC: they grow with earns and are never
          // reduced by redeem/adjust — that's what makes VIP status durable.
          ...(kind === "earn" ? {
            lastEarnAt: new Date(), lifetimePoints: lifetimeOf(c) + pts,
            currentStreak: streak, longestStreak: Math.max(Number(c.longestStreak) || 0, streak),
          } : {}),
        });
        return { balance: balance + pts, pts, extra, streak, eventId: eventRef.id };
      });

    if (action === "earn") {
      const d = Number(saleDollars);
      if (!Number.isFinite(d) || d <= 0 || d > 100000)
        return err(400, "bad_sale", "Enter the qualifying sale total (over $0).");
      const base = pointsForSale(d, rules); // server-computed — never the client's number
      if (base < 1) return err(400, "sale_too_small", "That sale is too small to earn a point.");
      // The VIP multiplier resolves from the customer's lifetime points inside
      // the transaction; the ledger line records it so the audit can normalize
      // issued points back to the base rate (no false outpaced-sales alarms).
      const vipOf = (c) => vipTierFor(lifetimeOf(c), rules);
      const r = await commit("earn",
        (c) => Math.round(base * (vipOf(c)?.multiplier || 1)),
        (c) => {
          const vip = vipOf(c);
          return {
            saleDollars: Math.round(d * 100) / 100,
            ...(vip && vip.multiplier !== 1 ? { multiplier: vip.multiplier, vipTier: vip.name } : {}),
          };
        });
      return NextResponse.json({
        ok: true, rules, earned: r.pts, balance: r.balance,
        vipTier: r.extra.vipTier || null, multiplier: r.extra.multiplier || 1,
        streak: r.streak, eventId: r.eventId,
      });
    }

    if (action === "redeem") {
      // Tier-aware: the reward menu is resolved server-side from the owner's
      // settings, so the client can only pick which configured tier to redeem —
      // never its points or value. Missing tierId → the (cheapest) first tier,
      // which for a store with no tiers is the legacy single reward.
      const tiers = rewardTiers(vendorSnap.data()?.rewards);
      const tier = tierId ? tiers.find((tt) => tt.id === tierId) : tiers[0];
      if (!tier) return err(400, "bad_tier", "That reward isn't available.");
      // The ledger line records the typed grant so the permanent record says
      // exactly what was handed over; `value` stays the worst-case $ for the
      // liability/audit math (percent → its cap).
      const grant = {
        value: tierDollarValue(tier), rewardName: tier.name || null,
        tierId: tier.id, rewardType: tier.type,
        ...(tier.type === "percent" ? { percent: tier.percent, cap: tier.cap } : {}),
        ...(tier.type === "item" && tier.withPurchase ? { withPurchase: true } : {}),
      };
      const { balance, eventId: redeemEventId } = await commit("redeem", -tier.points, grant, tier.points);
      return NextResponse.json({
        ok: true, rules, redeemed: tier.points, value: tierDollarValue(tier),
        reward: tier.name || null, rewardType: tier.type,
        percent: tier.type === "percent" ? tier.percent : null,
        cap: tier.type === "percent" ? tier.cap : null,
        withPurchase: tier.type === "item" && tier.withPurchase === true,
        balance, eventId: redeemEventId,
      });
    }

    // adjust — owner-only, note required; a correction is a new signed line.
    if (claims.role !== "owner") return err(403, "owner_only", "Only the owner can adjust points.");
    const pts = Math.trunc(Number(points));
    if (!Number.isFinite(pts) || pts === 0 || Math.abs(pts) > 100000)
      return err(400, "bad_adjust", "Enter a non-zero whole number of points.");
    const trimmedNote = String(note ?? "").trim();
    if (!trimmedNote) return err(400, "note_required", "An adjustment needs a note — it's part of the permanent record.");
    const { balance, eventId: adjustEventId } = await commit("adjust", pts, { note: trimmedNote.slice(0, 300) });
    return NextResponse.json({ ok: true, rules, adjusted: pts, balance, eventId: adjustEventId });
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("rewards route error", e);
    return NextResponse.json({ error: "Rewards action failed." }, { status: 500 });
  }
}
