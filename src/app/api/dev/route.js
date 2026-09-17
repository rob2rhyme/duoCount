import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireSignedIn, requirePlatformAdmin, resolvePlatformAdmin, assertScope } from "@/lib/require-manager";
import { scopesForRole, ROLES, normalizeRole } from "@/lib/platform-admins";
import { buildMessage, canTransition, REASON_MAX } from "@/lib/support";
import { hasRecoveryEmail, buildResetEmail, buildPinChangedEmail, buildSupportReplyEmail, resetLink, supportReplyEnabled } from "@/lib/recovery";
import { mintToken, appUrlFrom, trySend } from "@/lib/recovery-store";
import { issueTempPin } from "@/lib/pin-store";
import { normalizeBilling } from "@/lib/billing";
import { buildAuditEntry } from "@/lib/admin-audit";

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

// Evict a store's staff on suspend/delete: revoke every store user's refresh
// tokens so their next API call fails the checkRevoked verify. EXCEPT any store
// user who is themselves an ACTIVE platform operator — a developer's console
// identity is separate from their store membership, so killing the store must
// not also knock them out of /dev. Their operator doc keeps them resolvable; the
// suspended store just refuses a fresh store login.
async function revokeStoreUsers(adminDb, adminAuth, vref) {
  const [users, admins] = await Promise.all([
    vref.collection("users").get(),
    adminDb.collection("platformAdmins").get(),
  ]);
  const keepActive = new Set(
    admins.docs.filter((d) => d.data().active !== false).map((d) => d.id));
  await Promise.all(users.docs.map((u) => {
    const uid = `${vref.id}_${u.id}`;
    if (keepActive.has(uid)) return null; // active operator — don't evict from /dev
    return adminAuth.revokeRefreshTokens(uid).catch(() => { /* never signed in */ });
  }));
}

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
      const { adminDb } = await getAdmin();
      const op = await resolvePlatformAdmin(claims, adminDb);
      return NextResponse.json({
        ok: true,
        platformAdmin: !!op,
        role: op?.role || null,
        scopes: op ? scopesForRole(op.role) : [],
        uid: claims.vendorId && claims.userId ? `${claims.vendorId}_${claims.userId}` : "",
      });
    }

    // Every action below requires a resolved operator (`me`); per-action scopes
    // are enforced with assertScope(me, "<scope>") so a support / finance /
    // readonly operator can only reach what their role allows.
    const me = await requirePlatformAdmin(req);
    const { adminDb, adminAuth } = await getAdmin();
    const now = new Date();
    const devName = "DuoCount support";

    if (action === "listTickets") {
      assertScope(me, "read");
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
      assertScope(me, "tickets");
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
        // A signed-out help request came from someone who can't read the
        // in-app thread — that's why they wrote. Mail them the reply, or the
        // one channel built for locked-out people dead-ends.
        let emailed = null;
        if (t.public && t.contactEmail && built.message.text)
          emailed = await trySend({
            to: t.contactEmail,
            ...buildSupportReplyEmail({ lang: t.lang === "es" ? "es" : "en", text: built.message.text, canReply: supportReplyEnabled() }),
          });
        return NextResponse.json({ ok: true, status: next.status || t.status, emailed });
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
      assertScope(me, "read");
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
          deletedAt: v.deletedAt || null, deletedBy: v.deletedBy || null,
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

    if (action === "listAudit") {
      assertScope(me, "read");
      // Recent platform-admin actions, newest first. Read only through this
      // trusted route (clients are denied by firestore.rules `adminAudit`).
      const snap = await adminDb.collection("adminAudit").orderBy("ts", "desc").limit(200).get();
      return NextResponse.json({ ok: true, entries: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    }

    if (action === "storeAction") {
      const vref = adminDb.collection("vendors").doc(String(body.vendorId || ""));
      const vsnap = await vref.get();
      if (!vsnap.exists) return err(404, "no_store", "No such store.");
      const op = body.op;
      const vname = vsnap.data().name || "";
      // Append-only audit of every successful store action. Best-effort so a
      // transient audit-write failure never blocks store management; the record
      // fixes what happened, to which store, by which credential, and when.
      const logAudit = (act, detail = "") =>
        adminDb.collection("adminAudit").add(buildAuditEntry({
          actor: me.name || devName,
          actorId: me.id,
          action: act, vendorId: vref.id, vendorName: vname, detail, ts: now,
        })).catch((e) => { console.error("audit write failed", e); });

      if (op === "suspend" || op === "activate") {
        assertScope(me, "lifecycle");
        const status = op === "suspend" ? "suspended" : "active";
        await vref.update({ status });
        // Suspending must bite live sessions, not just block the next login.
        // Revoke every store user's refresh tokens: their next API call fails
        // the checkRevoked verify in require-manager (401), and no revoked token
        // can mint a fresh ID token — while the login route already refuses a
        // suspended store. (A Firestore client listener on an already-issued ID
        // token can still read until that token expires, ≤1h, then can't
        // refresh; no writes — client rules are append-only / server-gated.)
        // Mirrors the resetOwnerPin revocation below. Activate needs no revoke:
        // the store's users simply sign in again.
        if (op === "suspend") await revokeStoreUsers(adminDb, adminAuth, vref);
        await logAudit(op);
        return NextResponse.json({ ok: true, status });
      }
      if (op === "delete" || op === "restore") {
        assertScope(me, "lifecycle");
        // SOFT delete: flag the store archived (a third `status`) and revoke its
        // users' sessions — the same eviction suspend uses — so a deleted store
        // vanishes for staff (the login route refuses it below) while the doc and
        // its whole subtree stay intact, so a restore is a single write and the
        // audit history keeps its labels. Deliberately NOT a hard subtree purge
        // (the dev-console roadmap forbids un-audited wipes); reversible by design.
        if (op === "delete") {
          await vref.update({ status: "deleted", deletedAt: now, deletedBy: me.name || devName });
          await revokeStoreUsers(adminDb, adminAuth, vref);
          await logAudit("delete");
          return NextResponse.json({ ok: true, status: "deleted" });
        }
        // restore — clear the flags; users simply sign in again (no revoke needed).
        await vref.update({ status: "active", deletedAt: null, deletedBy: null });
        await logAudit("restore");
        return NextResponse.json({ ok: true, status: "active" });
      }
      if (op === "rename") {
        assertScope(me, "stores");
        const name = String(body.name ?? "").trim().slice(0, 80);
        if (name.length < 2) return err(400, "bad_name", "Enter a store name.");
        await vref.update({ name });
        await logAudit("rename", name);
        return NextResponse.json({ ok: true, name });
      }
      if (op === "note") {
        assertScope(me, "stores");
        const note = String(body.note ?? "").trim().slice(0, 500) || null;
        await vref.update({ devNote: note });
        await logAudit("note", note ? "set" : "cleared");
        return NextResponse.json({ ok: true, note });
      }
      if (op === "billing") {
        assertScope(me, "billing");
        // Manual subscription record — NO card data. Stored dev-only at
        // billing/{vendorId}; the split from service on/off (suspend/activate)
        // is deliberate, so "past due" doesn't itself cut a store's access.
        const b = normalizeBilling(body.billing || {});
        await adminDb.collection("billing").doc(vref.id).set(
          { ...b, updatedAt: now, updatedBy: me.name || "developer" }, { merge: true });
        await logAudit("billing", `${b.plan} · ${b.status}`);
        return NextResponse.json({ ok: true, billing: b });
      }
      if (op === "resetOwnerPin") {
        assertScope(me, "pin");
        // This is the most dangerous button in the console — it hands someone
        // access to a store the operator doesn't work at — so it now costs a
        // stated reason, and it never lets support keep a working credential.
        const reason = String(body.reason ?? "").trim().slice(0, REASON_MAX);
        if (reason.length < 10) return err(400, "need_reason", "Say why this reset is needed (at least 10 characters).");
        const users = await vref.collection("users").where("role", "==", "owner").where("active", "==", true).limit(1).get();
        if (users.empty) return err(404, "no_owner", "No active owner on that store.");
        const owner = { id: users.docs[0].id, ...users.docs[0].data() };
        const lang = body.lang === "es" ? "es" : "en";

        // Preferred path: mail the owner the same one-time link the self-serve
        // flow uses. Support triggers the reset but never learns the PIN, and
        // the owner proves they still hold the confirmed address.
        if (body.mode !== "temp") {
          if (!hasRecoveryEmail(owner))
            return err(400, "no_recovery_email", "That owner has no confirmed recovery email — use a temporary PIN instead.");
          const { token } = await mintToken(adminDb, { kind: "reset", vendorId: vref.id, userId: owner.id });
          const mail = buildResetEmail({ lang, storeName: vname, name: owner.name, link: resetLink(appUrlFrom(req), token) });
          const sent = await trySend({ to: owner.email, ...mail });
          await logAudit("ownerResetLink", reason);
          return NextResponse.json({ ok: true, mode: "link", sent, email: owner.email });
        }

        // Fallback for an owner with no confirmed address: a RANDOM one-time
        // PIN, read out over the phone. `mustChangePin` makes it a single trip —
        // the owner must choose their own PIN at the next sign-in, after which
        // what support saw is worthless. The write also drops live sessions and
        // kills any recovery link already in flight.
        const pin = await issueTempPin(adminDb, adminAuth, { vendorId: vref.id, userId: owner.id });
        if (!pin) return err(409, "pin_taken", "Couldn't find a free PIN for that store — try again.");
        if (hasRecoveryEmail(owner))
          await trySend({ to: owner.email, ...buildPinChangedEmail({ lang, storeName: vname, name: owner.name, by: "support", canReply: supportReplyEnabled() }) });
        await logAudit("resetOwnerPin", reason);
        return NextResponse.json({ ok: true, mode: "temp", pin });
      }
      return err(400, "bad_op", "Unknown store operation.");
    }

    // ---- Operator (platform-admin) management — superadmin only ----
    // The roster of who holds platform access (and their roles) is itself
    // sensitive, so LISTING requires the operators scope too — a support /
    // finance / readonly operator can't enumerate the admin set. (The UI already
    // hides this tab for them; this is the matching server gate.)
    if (action === "listAdmins") {
      assertScope(me, "operators");
      const snap = await adminDb.collection("platformAdmins").orderBy("createdAt", "desc").limit(200).get();
      return NextResponse.json({ ok: true, admins: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    }

    if (action === "adminAction") {
      assertScope(me, "operators");
      const aop = body.op;
      const uid = String(body.uid || "").trim();
      if (!uid || /\s/.test(uid) || !uid.includes("_") || uid.length > 200)
        return err(400, "bad_uid", "Enter a valid operator id (vendorId_userId).");
      // Never let an operator change their OWN role/status here — prevents both
      // accidental self-lockout and any self-escalation edge case. (The env
      // break-glass login can always recover access regardless.)
      if (uid === me.id) return err(400, "self_edit", "You can't change your own operator access here.");
      const ref = adminDb.collection("platformAdmins").doc(uid);

      // Guard the registry from being emptied of admins: if this write would drop
      // the last ACTIVE superadmin (a remove, a demotion, or a deactivation of the
      // sole one), refuse. Transactional so two concurrent demotes can't both pass
      // a stale count and race the registry to zero superadmins. `willBeSuper` is
      // the target end-state; `write(tx, prev)` applies the mutation. Returns the
      // prior doc data (for the audit label) or throws code "last_superadmin".
      const withSuperGuard = (willBeSuper, write) =>
        adminDb.runTransaction(async (tx) => {
          const cur = await tx.get(ref);
          const prev = cur.exists ? cur.data() : {};
          const wasActiveSuper = cur.exists && prev.role === "superadmin" && prev.active !== false;
          if (wasActiveSuper && !willBeSuper) {
            const supers = await tx.get(
              adminDb.collection("platformAdmins").where("role", "==", "superadmin").where("active", "==", true));
            if (supers.size <= 1) throw Object.assign(new Error("last superadmin"), { code: "last_superadmin" });
          }
          write(tx, prev);
          return prev;
        });

      if (aop === "remove") {
        // TOMBSTONE (active:false), never a hard delete: if this uid is ALSO in the
        // env PLATFORM_ADMIN_UIDS allowlist, deleting the doc would fall through to
        // the env grant and silently re-mint superadmin (revocation inverting to
        // escalation). The authoritative doc left inactive keeps denying.
        let prev;
        try {
          prev = await withSuperGuard(false, (tx) => tx.set(ref, { active: false, updatedAt: now }, { merge: true }));
        } catch (e) {
          if (e?.code === "last_superadmin") return err(400, "last_superadmin", "You can't remove the last active superadmin.");
          throw e;
        }
        await adminDb.collection("adminAudit").add(buildAuditEntry({
          actor: me.name || devName, actorId: me.id, action: "operator_revoke", vendorId: uid, vendorName: prev?.name || "", detail: "", ts: now,
        })).catch((e) => { console.error("audit write failed", e); });
        return NextResponse.json({ ok: true });
      }
      if (aop === "upsert") {
        if (!ROLES.includes(body.role)) return err(400, "bad_role", "Pick a valid role.");
        const role = normalizeRole(body.role);
        const name = String(body.name ?? "").trim().slice(0, 80);
        const email = String(body.email ?? "").trim().toLowerCase().slice(0, 120);
        const active = body.active !== false;
        let prev;
        try {
          prev = await withSuperGuard(role === "superadmin" && active, (tx, cur) => tx.set(ref, {
            name: name || cur.name || "",
            email: email || cur.email || "",
            role, active,
            addedBy: cur.addedBy || me.id,
            createdAt: cur.createdAt || now,
            updatedAt: now,
          }, { merge: true }));
        } catch (e) {
          if (e?.code === "last_superadmin") return err(400, "last_superadmin", "You can't demote the last active superadmin.");
          throw e;
        }
        await adminDb.collection("adminAudit").add(buildAuditEntry({
          actor: me.name || devName, actorId: me.id, action: "operator_grant",
          vendorId: uid, vendorName: name || prev?.name || "", detail: `${role}${active ? "" : " · inactive"}`, ts: now,
        })).catch((e) => { console.error("audit write failed", e); });
        return NextResponse.json({ ok: true, role });
      }
      return err(400, "bad_op", "Unknown operator operation.");
    }

    return err(400, "bad_action", "Unknown developer action.");
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("dev route error", e);
    return NextResponse.json({ error: "Developer action failed." }, { status: 500 });
  }
}
