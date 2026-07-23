// Pure builder + labels for the platform-admin action audit log. Kept separate
// so the record shape is unit-testable and identical across every dev-route op.
// The log is append-only: written ONLY by the Admin-SDK /api/dev route; no
// client (not even an owner) can read or write it — see firestore.rules
// `adminAudit`. Actor attribution is best-available: a store-account platform
// admin carries a real `${vendorId}_${userId}` id + name, while the shared
// support login logs as "DuoCount support" (per-operator identity is a
// follow-up; the record still fixes WHAT happened, to WHICH store, and WHEN).

export const AUDIT_ACTIONS = [
  "suspend", "activate", "delete", "restore", "rename", "note", "billing", "resetOwnerPin",
];

const clamp = (v, n) => String(v ?? "").slice(0, n);

// Normalize + bound an audit record. `ts` is passed in (the route's server
// clock) so this stays pure/clock-free and testable.
export function buildAuditEntry({ actor, actorId, action, vendorId, vendorName, detail, ts } = {}) {
  return {
    actor: clamp(actor || "developer", 80),
    actorId: clamp(actorId, 80),
    action: clamp(action, 40),
    vendorId: clamp(vendorId, 80),
    vendorName: clamp(vendorName, 120),
    detail: clamp(detail, 300),
    ts: ts ?? null,
  };
}
