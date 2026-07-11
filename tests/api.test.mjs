// Unit tests for fetchJson — the helper that turns non-JSON API responses
// into actionable errors instead of `Unexpected token '<'`. No network: we
// stub global.fetch. Run: npm run test:api
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchJson } from "../src/lib/api.js";

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

// Stub global.fetch with a Response carrying `body` (string) and `status`.
function stub(body, status = 200) {
  global.fetch = async () => new Response(body, { status });
}

test("returns the parsed object on a 2xx JSON response", async () => {
  stub(JSON.stringify({ token: "t", vendor: { id: "v" } }), 200);
  const j = await fetchJson("/api/auth/login", { method: "POST" });
  assert.equal(j.token, "t");
  assert.equal(j.vendor.id, "v");
});

test("surfaces a clean JSON error body on a non-2xx (unchanged behavior)", async () => {
  stub(JSON.stringify({ error: "No store found for that code." }), 404);
  await assert.rejects(() => fetchJson("/api/auth/login", {}),
    /No store found for that code\./);
});

test("an HTML 500 body becomes an actionable message, not a parse error", async () => {
  stub("<!DOCTYPE html><html><body>Internal Error</body></html>", 500);
  await assert.rejects(() => fetchJson("/api/auth/signup", {}), (e) => {
    assert.doesNotMatch(e.message, /Unexpected token/);
    assert.match(e.message, /HTTP 500/);
    assert.match(e.message, /function logs/i);
    return true;
  });
});

test("an HTML 404 points at a stale tab / updating deployment", async () => {
  stub("<!DOCTYPE html>not found", 404);
  await assert.rejects(() => fetchJson("/api/auth/signup", {}), /404[\s\S]*old browser tab|old browser tab[\s\S]*404/);
});

test("an HTML 401/403 names Deployment Protection", async () => {
  stub("<!DOCTYPE html>auth required", 401);
  await assert.rejects(() => fetchJson("/api/staff", {}), /Deployment Protection/);
});

test("a 504 is described as a timeout, not an env-var problem", async () => {
  stub("<!DOCTYPE html>gateway timeout", 504);
  await assert.rejects(() => fetchJson("/api/digest/test", {}), (e) => {
    assert.match(e.message, /timed out/i);
    return true;
  });
});

test("valid JSON that is a bare scalar is treated as non-JSON, not masked", async () => {
  stub("42", 500); // e.g. a proxy that JSON-encodes a scalar
  await assert.rejects(() => fetchJson("/api/auth/signup", {}), /HTTP 500/);
});

test("a JSON null body does not slip through as success", async () => {
  stub("null", 200);
  await assert.rejects(() => fetchJson("/api/auth/signup", {}), /Unexpected non-JSON|HTTP 200/);
});

test("an empty 2xx body returns {} (caller then guards on missing token)", async () => {
  stub("", 200);
  const j = await fetchJson("/api/auth/login", {});
  assert.deepEqual(j, {});
});

test("a thrown fetch (offline/DNS) becomes a friendly network error", async () => {
  global.fetch = async () => { throw new TypeError("failed to fetch"); };
  await assert.rejects(() => fetchJson("/api/auth/login", {}), /Network error/);
});
