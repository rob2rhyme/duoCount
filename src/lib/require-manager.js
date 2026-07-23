import { getAdmin } from "@/lib/firebase-admin";
import { hasScope, resolveOperator } from "@/lib/platform-admins";

// Verify a request's Bearer ID token, with checkRevoked=true so a token whose
// refresh tokens were revoked — which the staff route does on deactivate/demote —
// is rejected immediately, not only once it naturally expires. Any verify failure
// (missing / invalid / expired / revoked) surfaces as a 401 so the client
// re-authenticates. Returns the decoded claims ({ vendorId, userId, role, ... }).
async function verifyBearer(req) {
  const authz = req.headers.get("authorization") || "";
  const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!idToken) throw Object.assign(new Error("Not signed in."), { status: 401 });
  const { adminAuth } = await getAdmin();
  try {
    return await adminAuth.verifyIdToken(idToken, true); // checkRevoked
  } catch {
    throw Object.assign(new Error("Session expired — please sign in again."), { status: 401 });
  }
}

// Require any signed-in, token-valid member of a vendor (employee, manager, or
// owner). Used by the rewards register flow — earning/redeeming is a clerk
// action; the route enforces anything role-specific (e.g. owner-only adjust).
export async function requireMember(req) {
  const claims = await verifyBearer(req);
  if (!claims.vendorId || !claims.userId)
    throw Object.assign(new Error("Not signed in."), { status: 401 });
  return claims;
}

// Require ANY valid Firebase session — a store member OR a platform-admin token
// (which has no vendorId). Used by /api/dev whoami, the console gate that just
// reports whether the caller is a developer.
export async function requireSignedIn(req) {
  return verifyBearer(req);
}

// Require a manager or owner. Shared by the staff and schedule-publish routes.
export async function requireManager(req) {
  const claims = await verifyBearer(req);
  if (!claims.vendorId || !["owner", "manager"].includes(claims.role))
    throw Object.assign(new Error("Managers only."), { status: 403 });
  return claims;
}

// Require an owner. Shared by the demo-seed and digest-test routes.
export async function requireOwner(req) {
  const claims = await verifyBearer(req);
  if (!claims.vendorId || claims.role !== "owner")
    throw Object.assign(new Error("Owners only."), { status: 403 });
  return claims;
}

// Platform-admin (developer) identity. The store data is tenant-isolated, so
// there is no cross-tenant ROLE. Two ways to be a developer:
//   1. The dedicated developer login (/api/auth/dev) mints a token with a
//      `platformAdmin: true` claim and no vendorId — the intended path, since a
//      developer doesn't own a store.
//   2. Legacy/bootstrap: a store account whose uid (`${vendorId}_${userId}`) is
//      in the PLATFORM_ADMIN_UIDS env allowlist (the CRON_SECRET posture).
// Both are server-signed — a store login never sets the platformAdmin claim — so
// neither can be forged from the client. Env-based, revocable by redeploy.
export function platformAdminUids() {
  return String(process.env.PLATFORM_ADMIN_UIDS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

// Resolve the platform OPERATOR behind a verified token, with their RBAC role.
// Order (fail-closed):
//   1. Break-glass — the dedicated env dev login (a `platformAdmin` token with no
//      vendorId; also covers already-issued legacy tokens) → superadmin. This
//      path is env-only and can never be locked out, so the console always has a
//      way back in even if the registry is empty or a Firestore read fails.
//   2. A store account whose registry doc platformAdmins/{vendorId_userId} is
//      active → the role stored there. The registry is the primary grant path
//      (it replaces hand-editing the PLATFORM_ADMIN_UIDS env var).
//   3. Legacy env allowlist PLATFORM_ADMIN_UIDS → superadmin (back-compat).
// The registry doc is RE-READ on every call, so a deactivation or role change
// takes effect immediately — no stale-token privilege. Returns null for anyone
// else; a normal store user is NOT a platform admin. Custom claims are only ever
// set server-side (the store login never sets `platformAdmin`), so none of this
// can be forged from a client.
export async function resolvePlatformAdmin(claims, adminDb) {
  // The env break-glass path needs no registry read.
  if (!claims?.vendorId || !claims?.userId)
    return resolveOperator({ claims, registryDoc: null, envUids: [] });
  const uid = `${claims.vendorId}_${claims.userId}`;
  let registryDoc = null;
  try {
    const snap = await adminDb.collection("platformAdmins").doc(uid).get();
    if (snap.exists) registryDoc = snap.data();
  } catch {
    // Registry read failed (Firestore outage). We deliberately fall through to
    // the env allowlist so the deployment-configured break-glass superadmins
    // keep access during an outage — availability over a convenience-revocation.
    // A store account NOT in PLATFORM_ADMIN_UIDS still resolves to null here, so
    // an outage never GRANTS access to a non-env account; it only preserves the
    // env break-glass. True revocation of an env-listed uid is removing it from
    // PLATFORM_ADMIN_UIDS (the authoritative grant), not just the registry.
  }
  return resolveOperator({ claims, registryDoc, envUids: platformAdminUids() });
}

// Gate a /api/dev call: verify the token and resolve the operator (+ role).
// Returns the operator { id, name, role, source }; throws 403 for a non-operator.
export async function requirePlatformAdmin(req) {
  const claims = await verifyBearer(req);
  const { adminDb } = await getAdmin();
  const op = await resolvePlatformAdmin(claims, adminDb);
  if (!op)
    throw Object.assign(new Error("Developer access only."), { status: 403, code: "not_platform_admin" });
  return op;
}

// Enforce a scope on an already-resolved operator; throws 403 if they lack it.
export function assertScope(op, scope) {
  if (scope && !hasScope(op?.role, scope))
    throw Object.assign(new Error("You don't have permission for that action."), { status: 403, code: "forbidden_scope" });
}
