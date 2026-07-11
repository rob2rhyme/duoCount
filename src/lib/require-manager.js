import { getAdmin } from "@/lib/firebase-admin";

// Verify a request's Bearer ID token and require a manager/owner. Returns the
// decoded claims ({ vendorId, userId, role, name, ... }). Throws with a .status
// so route handlers can map it to an HTTP code. Shared by the staff and
// schedule-publish routes.
export async function requireManager(req) {
  const authz = req.headers.get("authorization") || "";
  const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!idToken) throw Object.assign(new Error("Not signed in."), { status: 401 });
  const { adminAuth } = await getAdmin();
  const claims = await adminAuth.verifyIdToken(idToken);
  if (!claims.vendorId || !["owner", "manager"].includes(claims.role))
    throw Object.assign(new Error("Managers only."), { status: 403 });
  return claims;
}
