// Pure roles + scopes for platform-admin (developer console) RBAC. Kept separate
// so the scope model is unit-testable and shared by the auth resolver
// (require-manager) and the /dev UI (which hides actions an operator can't do).
// AUTHORIZATION only — authentication stays with the operator's normal login (a
// store account's signed PIN, or the break-glass env dev login). An operator's
// platform role lives in the server-only `platformAdmins/{uid}` registry.

export const ROLES = ["superadmin", "support", "finance", "readonly"];

// The full scope set. "read" gates the listing actions (stores / tickets /
// audit / operators); the rest gate specific mutations. Deny-by-default: a role
// not in this map, or an unknown role, gets no scopes.
export const ALL_SCOPES = ["read", "tickets", "stores", "lifecycle", "billing", "pin", "operators"];

export const ROLE_SCOPES = Object.freeze({
  superadmin: ["read", "tickets", "stores", "lifecycle", "billing", "pin", "operators"],
  support: ["read", "tickets", "stores"],
  finance: ["read", "billing"],
  readonly: ["read"],
});

// Unknown / missing role → readonly (least privilege), never a throw.
export function normalizeRole(role) {
  return ROLES.includes(role) ? role : "readonly";
}
export function scopesForRole(role) {
  return ROLE_SCOPES[normalizeRole(role)] || [];
}
export function hasScope(role, scope) {
  return scopesForRole(role).includes(scope);
}

// Pure operator resolution from already-fetched inputs (the Firestore read lives
// in require-manager.resolvePlatformAdmin). Order is fail-closed:
//   1. break-glass env dev token (platformAdmin claim, no vendorId) → superadmin;
//   2. an active platformAdmins registry doc → its role;
//   3. the legacy PLATFORM_ADMIN_UIDS allowlist → superadmin (back-compat).
// `registryDoc` is the platformAdmins/{uid} data (or null); `envUids` is the
// allowlist array. Returns { id, name, role, source } or null (not an operator).
// Custom claims are only set server-side, so nothing here is client-forgeable.
export function resolveOperator({ claims, registryDoc = null, envUids = [] } = {}) {
  if (claims?.platformAdmin === true && !claims?.vendorId)
    return { id: claims.uid || "platform-admin", name: claims.name || "DuoCount support", role: "superadmin", source: "bootstrap" };
  if (!claims?.vendorId || !claims?.userId) return null;
  const uid = `${claims.vendorId}_${claims.userId}`;
  // An existing registry doc is AUTHORITATIVE: a deactivated doc DENIES and we do
  // NOT fall through to the env allowlist — otherwise deactivating an operator who
  // is also in PLATFORM_ADMIN_UIDS would silently re-grant them superadmin
  // (revocation inverting to escalation). The env allowlist is consulted ONLY when
  // no registry doc exists at all (pure legacy back-compat).
  if (registryDoc)
    return registryDoc.active === false
      ? null
      : { id: uid, name: registryDoc.name || claims.name || "", role: normalizeRole(registryDoc.role), source: "registry" };
  if (Array.isArray(envUids) && envUids.includes(uid))
    return { id: uid, name: claims.name || "", role: "superadmin", source: "env" };
  return null;
}
