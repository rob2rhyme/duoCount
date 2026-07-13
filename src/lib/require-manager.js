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
