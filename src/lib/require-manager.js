import { getAdmin } from "@/lib/firebase-admin";

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

// The platform-admin (developer) allowlist — the store data is tenant-isolated,
// so there is no cross-tenant ROLE; the developer is instead identified by their
// Firebase Auth UID, which is `${vendorId}_${userId}` (the login route mints
// tokens under that uid). PLATFORM_ADMIN_UIDS is a comma-separated allowlist,
// the same shared-secret-in-env posture as CRON_SECRET. The developer signs in
// through their normal store account; the dev console + /api/dev unlock only
// when their uid is on the list. Env-based so it's revocable by redeploy with no
// bootstrap problem.
export function platformAdminUids() {
  return String(process.env.PLATFORM_ADMIN_UIDS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}
export function isPlatformAdminClaims(claims) {
  const uid = `${claims.vendorId}_${claims.userId}`;
  return platformAdminUids().includes(uid);
}
export async function requirePlatformAdmin(req) {
  const claims = await verifyBearer(req);
  if (!claims.vendorId || !claims.userId || !isPlatformAdminClaims(claims))
    throw Object.assign(new Error("Developer access only."), { status: 403, code: "not_platform_admin" });
  return claims;
}
