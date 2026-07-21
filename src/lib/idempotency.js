// Idempotency keys for the trusted ledger routes (rewards / stock-move /
// gaming). The client sends a per-action `requestId`; the route derives a
// deterministic ledger doc id from it and refuses to write the same line
// twice — so a network/proxy replay of an already-committed write (the classic
// "504 after commit, auto-retry") can't create a duplicate earn / redeem /
// stock-move / gaming line. All pure + framework-free so it's unit-testable and
// shared by both the server routes and the client fetch wrappers.

// Validate a client-supplied request id. Returns:
//   { id: <string> } — a usable key (derive the deterministic doc id from it),
//   { id: null }      — none sent; caller falls back to a fresh random doc id
//                       (no idempotency — preserves old-client behavior),
//   { error: "bad_request_id" } — present but malformed; reject the call.
// The charset is restricted to what is always safe as a Firestore doc-id
// segment (no "/", no "." / "..", bounded length).
export function normalizeRequestId(raw) {
  if (raw === undefined || raw === null || raw === "") return { id: null };
  const s = String(raw);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(s)) return { error: "bad_request_id" };
  return { id: s };
}

// Deterministic ledger doc id: prefixed and entity-scoped, so the same request
// can only ever address one line, and two different entities (customers /
// items / machines) can't collide even if a buggy client reuses a requestId.
export function ledgerDocId(scope, requestId) {
  return `req_${scope}_${requestId}`;
}

// A fresh request id for one client action, reused verbatim across any network
// retry of the SAME call so the retry dedupes (a genuine re-tap makes a new
// call → new id → not deduped, which is correct). Prefers the platform UUID;
// the fallback is still collision-safe for dedupe purposes.
export function newRequestId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
