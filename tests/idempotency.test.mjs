import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRequestId, ledgerDocId, newRequestId } from "../src/lib/idempotency.js";

test("normalizeRequestId: missing key → { id: null } (no idempotency)", () => {
  for (const v of [undefined, null, ""]) assert.deepEqual(normalizeRequestId(v), { id: null });
});

test("normalizeRequestId: well-formed keys pass through", () => {
  assert.deepEqual(normalizeRequestId("3f2504e0-4f89-41d3-9a0c-0305e82c3301"),
    { id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" });
  assert.deepEqual(normalizeRequestId("abcd1234"), { id: "abcd1234" });
  assert.deepEqual(normalizeRequestId("A_b-C_d-9"), { id: "A_b-C_d-9" });
});

test("normalizeRequestId: malformed keys are rejected, never silently used", () => {
  assert.ok(normalizeRequestId("short").error);           // < 8 chars
  assert.ok(normalizeRequestId("bad/slash/id!!").error);  // "/" would break the doc path
  assert.ok(normalizeRequestId("has spaces x").error);    // whitespace
  assert.ok(normalizeRequestId("dot.dot.id").error);      // "." disallowed
  assert.ok(normalizeRequestId("x".repeat(129)).error);   // > 128 chars
});

test("ledgerDocId: prefixed, entity-scoped, and doc-id-safe", () => {
  const id = ledgerDocId("cust123", "3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  assert.equal(id, "req_cust123_3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  assert.ok(!id.includes("/"));
  // Different entities never collide on the same requestId.
  assert.notEqual(ledgerDocId("A", "same-request-id"), ledgerDocId("B", "same-request-id"));
});

test("newRequestId: nonempty, unique across calls, and self-validates", () => {
  const a = newRequestId();
  const b = newRequestId();
  assert.notEqual(a, b);
  assert.ok(normalizeRequestId(a).id, "generated id passes normalizeRequestId");
  assert.ok(normalizeRequestId(b).id, "generated id passes normalizeRequestId");
});
