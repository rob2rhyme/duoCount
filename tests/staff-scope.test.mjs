import test from "node:test";
import assert from "node:assert/strict";
import {
  STAFF_SCOPES, DEFAULT_STAFF_SCOPE,
  resolveStaffScope, seesEveryone, scopeEntries, displaySigner,
} from "../src/lib/staff-scope.js";

const E = (byId, by, extra = {}) => ({ byId, by, kind: "cash", ...extra });
const sam = E("u_sam", "Sam");
const rt = E("u_rt", "RT");
const legacy = { by: "Old Import", kind: "cash" }; // no byId at all

test("the default is own-only — a store that never opens the setting keeps clerks scoped", () => {
  assert.equal(DEFAULT_STAFF_SCOPE, "own");
  assert.equal(resolveStaffScope(undefined), "own");
  assert.equal(resolveStaffScope({}), "own");
  assert.equal(resolveStaffScope(null), "own");
});

test("unknown / malformed modes fall back rather than opening the store up", () => {
  for (const bad of ["everyone", "ALL", "", 0, true, {}, []]) {
    assert.equal(resolveStaffScope({ staffScope: bad }), "own", `staffScope=${JSON.stringify(bad)}`);
  }
  assert.equal(resolveStaffScope({ staffScope: "store" }), "store");
  assert.deepEqual(STAFF_SCOPES, ["own", "store"]);
});

test("managers and owners always see everyone, in either mode", () => {
  assert.equal(seesEveryone({ staffScope: "own" }, true), true);
  assert.equal(seesEveryone({ staffScope: "store" }, true), true);
  assert.equal(seesEveryone(undefined, true), true);
});

test("a clerk sees everyone only in shared-log mode", () => {
  assert.equal(seesEveryone({ staffScope: "own" }, false), false);
  assert.equal(seesEveryone({}, false), false);
  assert.equal(seesEveryone({ staffScope: "store" }, false), true);
});

test("scopeEntries keeps only the clerk's own counts", () => {
  const rows = scopeEntries([sam, rt, sam], { vendor: {}, isManager: false, viewerId: "u_sam" });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.byId === "u_sam"));
});

test("scopeEntries is a pass-through for a manager (same reference, no churn)", () => {
  const input = [sam, rt];
  assert.equal(scopeEntries(input, { vendor: {}, isManager: true, viewerId: "u_mgr" }), input);
  assert.equal(scopeEntries(input, { vendor: { staffScope: "store" }, isManager: false, viewerId: "u_sam" }), input);
});

test("scopeEntries never throws on a missing list or a missing viewer", () => {
  assert.deepEqual(scopeEntries(undefined, { isManager: false, viewerId: "u_sam" }), []);
  assert.deepEqual(scopeEntries(null, { isManager: false, viewerId: "u_sam" }), []);
  assert.deepEqual(scopeEntries([sam], {}), []);           // no viewer id → nothing claimed
  assert.deepEqual(scopeEntries([sam, null], { isManager: false, viewerId: "u_sam" }), [sam]);
});

test("a legacy entry with no byId is never claimed by a clerk", () => {
  // Guards the empty-string collision: viewerId "" must not match byId "".
  assert.deepEqual(scopeEntries([legacy], { isManager: false, viewerId: "u_sam" }), []);
  assert.deepEqual(scopeEntries([legacy, sam], { isManager: false, viewerId: "" }), []);
});

test("displaySigner names the signer for a manager", () => {
  assert.equal(displaySigner("RT", "u_rt", { isManager: true, viewerId: "u_mgr", otherLabel: "someone" }), "RT");
});

test("displaySigner gives a clerk their own name and masks a coworker", () => {
  const ctx = { vendor: {}, isManager: false, viewerId: "u_sam", otherLabel: "another staff member" };
  assert.equal(displaySigner("Sam", "u_sam", ctx), "Sam");
  assert.equal(displaySigner("RT", "u_rt", ctx), "another staff member");
});

test("displaySigner unmasks in shared-log mode", () => {
  const ctx = { vendor: { staffScope: "store" }, isManager: false, viewerId: "u_sam", otherLabel: "another staff member" };
  assert.equal(displaySigner("RT", "u_rt", ctx), "RT");
});

test("a nameless own entry still renders a dash, not an empty cell", () => {
  assert.equal(displaySigner("", "u_sam", { isManager: false, viewerId: "u_sam", otherLabel: "x" }), "—");
  assert.equal(displaySigner(null, "u_mgr", { isManager: true }), "—");
});

test("scoping is display-only: the input array is never mutated", () => {
  const input = [sam, rt];
  const before = JSON.stringify(input);
  scopeEntries(input, { vendor: {}, isManager: false, viewerId: "u_sam" });
  assert.equal(JSON.stringify(input), before);
  assert.equal(input.length, 2);
});
