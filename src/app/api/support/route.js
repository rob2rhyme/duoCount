import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireOwner } from "@/lib/require-manager";
import { buildTicket, buildMessage, canTransition, REASON_MAX } from "@/lib/support";

export const runtime = "nodejs";

// Owner-facing support desk. The store owner reports an app issue (with
// screenshots), follows the thread, and marks their own ticket resolved or
// reopens it. Same trusted posture as the rewards ledger: client rules allow
// NO writes, so every ticket + message is written here (Admin SDK), append-
// only, stamped with the verified caller — the platform developer works the
// same tickets through /api/dev.
//
//   body: { action: "create" | "reply" | "setStatus" | "markSeen", ... }

const err = (status, code, message) => NextResponse.json({ error: message, code }, { status });

// A single Firestore document caps at ~1 MiB. Screenshots ride inline as
// downscaled data-URIs, so we refuse a write that would push the doc past a
// safe budget — the client downscales, and support.js caps each image; this is
// the last backstop (a full ticket says "resolve or open a new one").
const DOC_BUDGET = 900 * 1024;
const roughSize = (obj) => {
  try { return Buffer.byteLength(JSON.stringify(obj), "utf8"); } catch { return DOC_BUDGET; }
};

export async function POST(req) {
  try {
    const claims = await requireOwner(req);
    const body = await req.json();
    const { action } = body;
    if (!["create", "reply", "setStatus", "markSeen"].includes(action))
      return err(400, "bad_action", "Unknown support action.");

    const { adminDb } = await getAdmin();
    const tickets = adminDb.collection("supportTickets");
    const now = new Date();

    if (action === "create") {
      const built = buildTicket(body);
      if (built.error) return err(400, built.error, "Check the form.");
      const vendorSnap = await adminDb.collection("vendors").doc(claims.vendorId).get();
      const v = vendorSnap.data() || {};
      const doc = {
        vendorId: claims.vendorId, storeName: v.name || "", storeSlug: v.slug || "",
        ...built.fields, // subject, body, category, priority, attachments
        status: "open",
        createdByName: claims.name || "", createdById: claims.userId,
        createdAt: now, lastActivityAt: now, lastActorRole: "owner",
        ownerSeenAt: now, devSeenAt: null, messages: [],
      };
      if (roughSize(doc) > DOC_BUDGET) return err(413, "attach_budget", "Those screenshots are too large together — send fewer or smaller ones.");
      const ref = await tickets.add(doc);
      return NextResponse.json({ ok: true, id: ref.id });
    }

    // reply / setStatus / markSeen all target an existing ticket the caller owns.
    const id = String(body.ticketId || "");
    const ref = tickets.doc(id);
    const snap = await ref.get();
    if (!snap.exists) return err(404, "not_found", "That ticket doesn't exist.");
    const t = snap.data();
    if (t.vendorId !== claims.vendorId) return err(403, "not_yours", "That ticket isn't yours.");

    if (action === "markSeen") {
      await ref.update({ ownerSeenAt: now });
      return NextResponse.json({ ok: true });
    }

    if (action === "reply") {
      const built = buildMessage(body);
      if (built.error) return err(400, built.error, "Write a message or attach a screenshot.");
      const msg = {
        by: "owner", byName: claims.name || "", ...built.message, ts: now, system: false,
      };
      const next = {
        messages: [...(t.messages || []), msg],
        lastActivityAt: now, lastActorRole: "owner", ownerSeenAt: now,
        // A reply on a resolved ticket reopens it — the owner has more to say.
        ...(t.status === "resolved" ? { status: "open" } : {}),
      };
      if (roughSize({ ...t, ...next }) > DOC_BUDGET) return err(413, "attach_budget", "This ticket is full — please open a new one for anything more.");
      await ref.update(next);
      return NextResponse.json({ ok: true, status: next.status || t.status });
    }

    // setStatus — owner may resolve or reopen (never "pending"; that's the dev's).
    const to = String(body.status || "");
    if (!canTransition(t.status, to, "owner")) return err(400, "bad_status", "You can't set that status.");
    const reason = String(body.reason ?? "").trim().slice(0, REASON_MAX);
    const sysMsg = {
      by: "owner", byName: claims.name || "", system: true,
      text: to === "resolved" ? "resolved" : "reopened", reason: reason || null,
      attachments: [], ts: now,
    };
    await ref.update({
      status: to, messages: [...(t.messages || []), sysMsg],
      lastActivityAt: now, lastActorRole: "owner", ownerSeenAt: now,
    });
    return NextResponse.json({ ok: true, status: to });
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("support route error", e);
    return NextResponse.json({ error: "Support action failed." }, { status: 500 });
  }
}
