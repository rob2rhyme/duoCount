// Pure admin-audit record builder — no emulator.
// Run: node --test tests/admin-audit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuditEntry, AUDIT_ACTIONS } from "../src/lib/admin-audit.js";

test("buildAuditEntry normalizes fields and carries the timestamp", () => {
  const ts = new Date("2026-07-23T10:00:00Z");
  const e = buildAuditEntry({
    actor: "DuoCount support", actorId: "v1_u1", action: "delete",
    vendorId: "v1", vendorName: "sh-harrisburg", detail: "", ts,
  });
  assert.equal(e.actor, "DuoCount support");
  assert.equal(e.actorId, "v1_u1");
  assert.equal(e.action, "delete");
  assert.equal(e.vendorId, "v1");
  assert.equal(e.vendorName, "sh-harrisburg");
  assert.equal(e.detail, "");
  assert.equal(e.ts, ts);
});

test("defaults: blank actor → 'developer', missing fields → empty, ts → null", () => {
  const e = buildAuditEntry({ action: "rename", vendorId: "v2" });
  assert.equal(e.actor, "developer");
  assert.equal(e.actorId, "");
  assert.equal(e.vendorName, "");
  assert.equal(e.detail, "");
  assert.equal(e.ts, null);
});

test("clamps long strings so one record can't bloat the doc", () => {
  const long = "x".repeat(1000);
  const e = buildAuditEntry({ actor: long, action: long, vendorName: long, detail: long });
  assert.equal(e.actor.length, 80);
  assert.equal(e.action.length, 40);
  assert.equal(e.vendorName.length, 120);
  assert.equal(e.detail.length, 300);
});

test("every store op that mutates a vendor has an audit action label", () => {
  for (const a of ["suspend", "activate", "delete", "restore", "rename", "note", "billing", "resetOwnerPin"])
    assert.ok(AUDIT_ACTIONS.includes(a), `missing audit action ${a}`);
});
