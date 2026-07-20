import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireSignedIn, requirePlatformAdmin, isPlatformAdminClaims } from "@/lib/require-manager";
import { buildMessage, canTransition, REASON_MAX } from "@/lib/support";
import { hashPin } from "@/lib/hash";
import { isValidNewPin } from "@/lib/pin";
import { normalizeBilling } from "@/lib/billing";

export const runtime = "nodejs";

// Developer / platform-admin console. Cross-tenant by nature: the store data is
// isolated per vendor, so every read/write here goes through the Admin SDK
// (which bypasses rules) gated by requirePlatformAdmin (the PLATFORM_ADMIN_UIDS
// allowlist). Two jobs the owner asked for:
//   • work the support queue across ALL stores (reply, set pending/resolved);
//   • manage store accounts (suspend / reactivate / rename, reset owner PIN).
//
// `whoami` is the one action any signed-in user may call — it just reports
// whether THEY are a platform admin, so the client can show/hide the console.

const err = (status, code, message) => NextResponse.json({ error: message, code }, { status });
const DOC_BUDGET = 900 * 1024;
const roughSize = (obj) => { try { return Buffer.byteLength(JSON.stringify(obj), "utf8"); } catch { return DOC_BUDGET; } };

export async function POST(req) {
  try {
    const body = await req.json();
    const { action } = body;

    // whoami — the console gate. Accepts ANY valid session (a store account OR a
    // dedicated developer token, which has no vendorId). Reports whether the
    // caller is a developer, and — for the legacy store-account path — their uid
    // (`${vendorId}_${userId}`), so a signed-in-but-not-allowlisted owner can
    // read it off the denied screen and add it to PLATFORM_ADMIN_UIDS.
    if (action === "whoami") {
      const claims = await requireSignedIn(req);
      return NextResponse.json({
        ok: true,
        platformAdmin: isPlatformAdminClaims(claims),
        uid: claims.vendorId && claims.userId ? `${claims.vendorId}_${claims.userId}` : "",
      });
    }

    const claims = await requirePlatformAdmin(req);
    const { adminDb, adminAuth } = await getAdmin();
    const now = new Date();
    const devName = "DuoCount support";

    if (action === "listTickets") {
      const status = body.status;
      let q = adminDb.collection("supportTickets");
      if (["open", "pending", "resolved"].includes(status)) q = q.where("status", "==", status);
      const snap = await q.orderBy("lastActivityAt", "desc").limit(300).get();
      const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const counts = { open: 0, pending: 0, resolved: 0 };
      // Cheap status tallies from a separate light query (open + pending only).
      const live = await adminDb.collection("supportTickets").where("status", "in", ["open", "pending"]).get();
      for (const d of live.docs) counts[d.data().status] = (counts[d.data().status] || 0) + 1;
      return NextResponse.json({ ok: true, tickets, counts });
    }

    if (action === "ticketReply" || action === "ticketStatus") {
      const ref = adminDb.collection("supportTickets").doc(String(body.ticketId || ""));
      const snap = await ref.get();
      if (!snap.exists) return err(404, "not_found", "That ticket doesn't exist.");
      const t = snap.data();

      if (action === "ticketReply") {
        const built = buildMessage(body);
        if (built.error) return err(400, built.error, "Write a message or attach a screenshot.");
        const msg = { by: "dev", byName: devName, ...built.message, ts: now, system: false };
        const next = {
          messages: [...(t.messages || []), msg],
          lastActivityAt: now, lastActorRole: "dev", devSeenAt: now,
          // A dev reply on an open ticket moves it to "in progress".
          ...(t.status === "open" ? { status: "pending" } : {}),
        };
        if (roughSize({ ...t, ...next }) > DOC_BUDGET) return err(413, "attach_budget", "This ticket is full.");
        await ref.update(next);
        return NextResponse.json({ ok: true, status: next.status || t.status });
      }

      // ticketStatus — dev may set open/pending/resolved; resolving records a reason.
      const to = String(body.status || "");
      if (!canTransition(t.status, to, "dev")) return err(400, "bad_status", "Bad status.");
      const reason = String(body.reason ?? "").trim().slice(0, REASON_MAX);
      const sysMsg = {
        by: "dev", byName: devName, system: true,
        text: to === "resolved" ? "dev_resolved" : to === "pending" ? "dev_pending" : "reopened",
        reason: reason || null, attachments: [], ts: now,
      };
      await ref.update({
        status: to, messages: [...(t.messages || []), sysMsg],
        lastActivityAt: now, lastActorRole: "dev", devSeenAt: now,
      });
      return NextResponse.json({ ok: true, status: to });
    }

    if (action === "listStores") {
      const [vSnap, tSnap] = await Promise.all([
        adminDb.collection("vendors").orderBy("createdAt", "desc").limit(500).get(),
        adminDb.collection("supportTickets").where("status", "in", ["open", "pending"]).get(),
      ]);
      const openByVendor = {};
      for (const d of tSnap.docs) { const v = d.data().vendorId; openByVendor[v] = (openByVendor[v] || 0) + 1; }
      // billing/{vendorId} is dev-only (top-level collection, default-deny for
      // clients). One batched getAll keeps it to a single extra read.
      const billingSnaps = vSnap.docs.length
        ? await adminDb.getAll(...vSnap.docs.map((d) => adminDb.collection("billing").doc(d.id)))
        : [];
      const billingById = {};
      for (const b of billingSnaps) if (b.exists) billingById[b.id] = b.data();
      // Staff counts per vendor (bounded fan-out; store scale).
      const stores = await Promise.all(vSnap.docs.map(async (d) => {
        const v = d.data();
        const users = await d.ref.collection("users").where("active", "==", true).get().catch(() => ({ size: 0 }));
        const owner = users.docs?.find?.((u) => u.data().role === "owner");
        const bill = billingById[d.id];
        return {
          id: d.id, name: v.name || "", slug: v.slug || "",
          status: v.status || "active", createdAt: v.createdAt || null,
          rewardsOn: v.rewards?.enabled === true,
          ownerName: owner ? owner.data().name : (v.ownerName || ""),
          ownerEmail: owner ? (owner.data().email || null) : null,
          staffCount: users.size || 0, openTickets: openByVendor[d.id] || 0,
          note: v.devNote || null,
          billing: bill ? { plan: bill.plan, status: bill.status, cycle: bill.cycle, price: bill.price, note: bill.note || null } : null,
        };
      }));
      return NextResponse.json({ ok: true, stores });
    }

    if (action === "storeAction") {
      const vref = adminDb.collection("vendors").doc(String(body.vendorId || ""));
      const vsnap = await vref.get();
      if (!vsnap.exists) return err(404, "no_store", "No such store.");
      const op = body.op;

      if (op === "suspend" || op === "activate") {
        await vref.update({ status: op === "suspend" ? "suspended" : "active" });
        return NextResponse.json({ ok: true, status: op === "suspend" ? "suspended" : "active" });
      }
      if (op === "rename") {
        const name = String(body.name ?? "").trim().slice(0, 80);
        if (name.length < 2) return err(400, "bad_name", "Enter a store name.");
        await vref.update({ name });
        return NextResponse.json({ ok: true, name });
      }
      if (op === "note") {
        const note = String(body.note ?? "").trim().slice(0, 500) || null;
        await vref.update({ devNote: note });
        return NextResponse.json({ ok: true, note });
      }
      if (op === "billing") {
        // Manual subscription record — NO card data. Stored dev-only at
        // billing/{vendorId}; the split from service on/off (suspend/activate)
        // is deliberate, so "past due" doesn't itself cut a store's access.
        const b = normalizeBilling(body.billing || {});
        await adminDb.collection("billing").doc(vref.id).set(
          { ...b, updatedAt: now, updatedBy: claims.name || "developer" }, { merge: true });
        return NextResponse.json({ ok: true, billing: b });
      }
      if (op === "resetOwnerPin") {
        const pin = String(body.pin ?? "").trim();
        if (!isValidNewPin(pin)) return err(400, "bad_pin", "Enter a valid 6-digit PIN.");
        const users = await vref.collection("users").where("role", "==", "owner").where("active", "==", true).limit(1).get();
        if (users.empty) return err(404, "no_owner", "No active owner on that store.");
        const ownerRef = users.docs[0].ref;
        await ownerRef.collection("private").doc("creds").set({ pinHash: hashPin(pin) }, { merge: true });
        // Force re-auth so any live session with the old PIN's token is dropped.
        try { await adminAuth.revokeRefreshTokens(`${vref.id}_${ownerRef.id}`); } catch { /* not signed in */ }
        return NextResponse.json({ ok: true });
      }
      return err(400, "bad_op", "Unknown store operation.");
    }

    return err(400, "bad_action", "Unknown developer action.");
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("dev route error", e);
    return NextResponse.json({ error: "Developer action failed." }, { status: 500 });
  }
}
