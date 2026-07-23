// Pure platform-admin RBAC scope model — no emulator.
// Run: node --test tests/platform-admins.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, ALL_SCOPES, scopesForRole, hasScope, normalizeRole, resolveOperator } from "../src/lib/platform-admins.js";

test("superadmin holds every scope", () => {
  for (const s of ALL_SCOPES) assert.ok(hasScope("superadmin", s), `superadmin should have ${s}`);
});

test("support can read/tickets/stores but not lifecycle/billing/pin/operators", () => {
  for (const s of ["read", "tickets", "stores"]) assert.ok(hasScope("support", s));
  for (const s of ["lifecycle", "billing", "pin", "operators"]) assert.equal(hasScope("support", s), false);
});

test("finance can read/billing only", () => {
  assert.deepEqual(scopesForRole("finance").slice().sort(), ["billing", "read"]);
  assert.equal(hasScope("finance", "tickets"), false);
  assert.equal(hasScope("finance", "operators"), false);
});

test("readonly can read and nothing else", () => {
  assert.deepEqual(scopesForRole("readonly"), ["read"]);
  for (const s of ALL_SCOPES.filter((x) => x !== "read")) assert.equal(hasScope("readonly", s), false);
});

test("unknown / missing role → readonly (least privilege)", () => {
  assert.equal(normalizeRole("wizard"), "readonly");
  assert.equal(normalizeRole(undefined), "readonly");
  assert.deepEqual(scopesForRole("nope"), ["read"]);
  assert.equal(hasScope(null, "billing"), false);
});

test("only the operators scope is destructive-management; lifecycle/pin are superadmin-gated", () => {
  // Nobody but superadmin can manage operators, reset PINs, or kill a store.
  for (const scope of ["operators", "pin", "lifecycle"])
    for (const role of ROLES.filter((r) => r !== "superadmin"))
      assert.equal(hasScope(role, scope), false, `${role} must NOT have ${scope}`);
});

/* ---------- resolveOperator: who is a platform admin, and their role ---------- */
const storeClaims = (over = {}) => ({ vendorId: "v1", userId: "u1", role: "owner", ...over });

test("break-glass env dev token (platformAdmin, no vendorId) → superadmin", () => {
  const op = resolveOperator({ claims: { platformAdmin: true, uid: "platform-admin", name: "DuoCount support" } });
  assert.equal(op.role, "superadmin");
  assert.equal(op.source, "bootstrap");
});

test("a NORMAL store user is NOT a platform admin (no registry doc, not allowlisted)", () => {
  assert.equal(resolveOperator({ claims: storeClaims(), registryDoc: null, envUids: [] }), null);
  // ...even an owner. Platform access is never implied by a store role.
  assert.equal(resolveOperator({ claims: storeClaims({ role: "owner" }), registryDoc: null, envUids: ["v9_u9"] }), null);
});

test("an active registry doc grants exactly its role; a bogus role → readonly", () => {
  assert.equal(resolveOperator({ claims: storeClaims(), registryDoc: { role: "support", active: true } }).role, "support");
  assert.equal(resolveOperator({ claims: storeClaims(), registryDoc: { role: "finance" } }).role, "finance");
  assert.equal(resolveOperator({ claims: storeClaims(), registryDoc: { role: "wizard", active: true } }).role, "readonly");
});

test("a DEACTIVATED registry doc is AUTHORITATIVE — denies even when env-allowlisted", () => {
  // Plain deactivation → denied.
  assert.equal(resolveOperator({ claims: storeClaims(), registryDoc: { role: "superadmin", active: false }, envUids: [] }), null);
  // The security-critical case: the SAME uid is also in PLATFORM_ADMIN_UIDS. The
  // deactivated doc must STILL deny — a fall-through to the env allowlist would
  // invert revocation into re-escalation (deactivate → silently superadmin again).
  assert.equal(resolveOperator({ claims: storeClaims(), registryDoc: { role: "superadmin", active: false }, envUids: ["v1_u1"] }), null);
  // A deactivated non-super doc is likewise denied, env or no env.
  assert.equal(resolveOperator({ claims: storeClaims(), registryDoc: { role: "support", active: false }, envUids: ["v1_u1"] }), null);
});

test("registry wins over the env allowlist (in-app role beats the coarse env grant)", () => {
  const op = resolveOperator({ claims: storeClaims(), registryDoc: { role: "readonly", active: true }, envUids: ["v1_u1"] });
  assert.equal(op.role, "readonly");
  assert.equal(op.source, "registry");
});

test("env allowlist is consulted ONLY when no registry doc exists (back-compat)", () => {
  // No doc + allowlisted → superadmin via env.
  const op = resolveOperator({ claims: storeClaims(), registryDoc: null, envUids: ["v1_u1"] });
  assert.equal(op.role, "superadmin");
  assert.equal(op.source, "env");
  // No doc + not allowlisted → not an operator.
  assert.equal(resolveOperator({ claims: storeClaims(), registryDoc: null, envUids: ["v9_u9"] }), null);
});
