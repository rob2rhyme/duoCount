import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { hashPin } from "@/lib/hash";
import { isValidNewPin, PIN_ERROR } from "@/lib/pin";
import { requireOwner } from "@/lib/require-manager";
import { pinTaken, setUserPin } from "@/lib/pin-store";
import { cleanEmailInput, buildVerifyEmail, buildPinChangedEmail, verifyLink, hasRecoveryEmail, supportReplyEnabled } from "@/lib/recovery";
import { mintToken, burnTokens, appUrlFrom, trySend } from "@/lib/recovery-store";

export const runtime = "nodejs";

// "" clears the email; a non-empty value must look like an address. The rule
// itself lives in recovery.js so this route, /api/account and sign-up can't
// drift on what counts as an address.
function cleanEmail(raw) {
  const r = cleanEmailInput(raw);
  return r.error ? { error: "Enter a valid email (or leave it blank)." } : r;
}

// A client-supplied locationId is untrusted: verify it names a real, active
// location in this vendor before persisting it. Otherwise a stale or forged id
// silently strands an employee — their reads filter by locationId, so they'd
// open to a permanently empty log with no error anywhere. Returns an error
// string, or null when the id is valid.
async function locationError(adminDb, vendorId, locationId) {
  const loc = await adminDb
    .collection("vendors").doc(vendorId)
    .collection("locations").doc(String(locationId)).get();
  if (!loc.exists || loc.data().active === false) return "That location doesn't exist.";
  return null;
}

export async function POST(req) {
  try {
    const claims = await requireOwner(req);
    const { name, pin, role, locationId, email, lang } = await req.json();
    if (!name || name.trim().length < 2)
      return NextResponse.json({ error: "Enter a name." }, { status: 400 });
    if (!isValidNewPin(pin))
      return NextResponse.json({ error: PIN_ERROR }, { status: 400 });
    const em = cleanEmail(email);
    if (em.error) return NextResponse.json({ error: em.error }, { status: 400 });
    const newRole = ["employee", "manager", "owner"].includes(role) ? role : "employee";
    if (newRole === "owner" && claims.role !== "owner")
      return NextResponse.json({ error: "Only an owner can create another owner." }, { status: 403 });
    if (newRole === "employee" && !locationId)
      return NextResponse.json({ error: "Assign employees to a location." }, { status: 400 });

    const { adminDb } = await getAdmin();
    const vendorRef = adminDb.collection("vendors").doc(claims.vendorId);

    if (locationId) {
      const locErr = await locationError(adminDb, claims.vendorId, locationId);
      if (locErr) return NextResponse.json({ error: locErr }, { status: 400 });
    }

    // PIN must be unique within this store so login can identify the person.
    if (await pinTaken(adminDb, claims.vendorId, pin))
      return NextResponse.json({ error: "That PIN is already in use at this store." }, { status: 409 });

    const ref = vendorRef.collection("users").doc();
    await ref.set({
      name: name.trim(), role: newRole,
      locationId: newRole === "employee" ? locationId : (locationId || null),
      // Unconfirmed until this person opens the link — an owner typing an
      // address is not proof that its reader wants to recover this account.
      email: em.email, emailVerifiedAt: null, active: true, createdAt: new Date(),
    });
    await ref.collection("private").doc("creds").set({ pinHash: hashPin(pin) });
    if (em.email) await sendVerify(req, adminDb, { vendorId: claims.vendorId, userId: ref.id, name: name.trim(), email: em.email, lang });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("staff error", e);
    return NextResponse.json({ error: "Staff action failed." }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const claims = await requireOwner(req);
    const { userId, role, active, locationId, pin, email, lang } = await req.json();
    if (!userId) return NextResponse.json({ error: "Missing userId." }, { status: 400 });
    if (userId === claims.userId)
      return NextResponse.json({ error: "You can't modify your own account here." }, { status: 400 });

    const { adminDb, adminAuth } = await getAdmin();
    const ref = adminDb.collection("vendors").doc(claims.vendorId).collection("users").doc(userId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
    const target = snap.data();

    const patch = {};
    if (role !== undefined) {
      if (!["employee", "manager", "owner"].includes(role))
        return NextResponse.json({ error: "Bad role." }, { status: 400 });
      if ((role === "owner" || target.role === "owner") && claims.role !== "owner")
        return NextResponse.json({ error: "Only an owner can change owner roles." }, { status: 403 });
      patch.role = role;
    }
    if (active !== undefined) {
      if (target.role === "owner" && claims.role !== "owner")
        return NextResponse.json({ error: "Only an owner can disable an owner." }, { status: 403 });
      patch.active = !!active;
    }
    if (locationId !== undefined) {
      if (locationId) {
        const locErr = await locationError(adminDb, claims.vendorId, locationId);
        if (locErr) return NextResponse.json({ error: locErr }, { status: 400 });
      }
      patch.locationId = locationId || null;
    }
    let verifyFor = null; // set below when a new address needs confirming
    if (email !== undefined) {
      const em = cleanEmail(email);
      if (em.error) return NextResponse.json({ error: em.error }, { status: 400 });
      // Changing or clearing the address drops its confirmation and kills any
      // outstanding link, so an address the owner just removed can't still
      // recover the account from a mail someone already received.
      if ((em.email || null) !== (target.email || null)) {
        patch.email = em.email;
        patch.emailVerifiedAt = null;
        await burnTokens(adminDb, { kind: "verify", vendorId: claims.vendorId, userId });
        verifyFor = em.email;
      }
    }

    // A store must always keep at least one active owner. If this change would
    // demote or deactivate the last one, refuse — otherwise nobody could ever
    // manage settings or owners again.
    const demotingOwner = target.role === "owner" && patch.role !== undefined && patch.role !== "owner";
    const deactivatingOwner = target.role === "owner" && patch.active === false;
    if (demotingOwner || deactivatingOwner) {
      const owners = await ref.parent.where("role", "==", "owner").get();
      const otherActiveOwner = owners.docs.some(
        (d) => d.id !== userId && d.data().active !== false);
      if (!otherActiveOwner)
        return NextResponse.json(
          { error: "This is the store's last active owner — make someone else an owner first." },
          { status: 400 });
    }

    if (Object.keys(patch).length) await ref.update(patch);

    // Deactivating or changing a user's role must take effect now, not whenever
    // their ID token happens to expire. Revoke their refresh tokens so the next
    // privileged call (verified with checkRevoked) is rejected and the client is
    // forced to re-authenticate — at which point login re-reads their live role
    // and won't sign in a now-inactive user at all. No-op-safe before first
    // sign-in (no Firebase Auth user exists yet).
    if (patch.active === false || patch.role !== undefined) {
      try {
        await adminAuth.revokeRefreshTokens(`${claims.vendorId}_${userId}`);
      } catch (e) {
        if (e.code !== "auth/user-not-found") throw e;
      }
    }

    if (pin !== undefined) {
      // Only an owner may reset an owner's PIN — otherwise a manager could reset
      // the owner's PIN and sign in as the owner (privilege escalation). Mirrors
      // the owner-guard on the role/active branches above.
      if (target.role === "owner" && claims.role !== "owner")
        return NextResponse.json({ error: "Only an owner can reset an owner's PIN." }, { status: 403 });
      if (!isValidNewPin(pin))
        return NextResponse.json({ error: PIN_ERROR }, { status: 400 });
      // A reset PIN must stay unique within the store (excluding this user).
      // Sign-in identifies a person by their PIN, so a collision would let login
      // resolve to the wrong identity — same check the create path enforces.
      if (await pinTaken(adminDb, claims.vendorId, pin, userId))
        return NextResponse.json({ error: "That PIN is already in use at this store." }, { status: 409 });
      // In-store reset: the owner hands the PIN over face to face, which is the
      // documented model here, so no forced change. What DOES travel with it is
      // the rest of the bookkeeping — any recovery link in flight dies and live
      // sessions are dropped. (Support's cross-tenant reset in /api/dev is the
      // one that forces a change; a developer must never keep a working
      // credential for a store they don't work at.)
      await setUserPin(adminDb, adminAuth, { vendorId: claims.vendorId, userId, pin, mustChangePin: false });
      if (hasRecoveryEmail({ ...target, ...patch }))
        await trySend({
          to: patch.email !== undefined ? patch.email : target.email,
          ...buildPinChangedEmail({ lang: lang === "es" ? "es" : "en", storeName: await storeNameOf(adminDb, claims.vendorId), name: target.name, by: "owner", canReply: supportReplyEnabled() }),
        });
    }
    if (verifyFor)
      await sendVerify(req, adminDb, { vendorId: claims.vendorId, userId, name: target.name, email: verifyFor, lang });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("staff error", e);
    return NextResponse.json({ error: "Staff action failed." }, { status: 500 });
  }
}

// Mail a confirmation link for a staff address the OWNER typed. Best-effort:
// the staff edit itself has already succeeded, and an unconfirmed address is
// simply one that can't recover an account yet.
async function sendVerify(req, adminDb, { vendorId, userId, name, email, lang }) {
  try {
    const { token } = await mintToken(adminDb, { kind: "verify", vendorId, userId });
    await trySend({
      to: email,
      ...buildVerifyEmail({
        lang: lang === "es" ? "es" : "en",
        storeName: await storeNameOf(adminDb, vendorId), name,
        link: verifyLink(appUrlFrom(req), token),
      }),
    });
  } catch (e) {
    console.error("staff verify email failed", e?.message || e);
  }
}

async function storeNameOf(adminDb, vendorId) {
  try {
    const snap = await adminDb.collection("vendors").doc(vendorId).get();
    return snap.exists ? (snap.data().name || "") : "";
  } catch { return ""; }
}
