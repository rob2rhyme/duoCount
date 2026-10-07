// Staff rollup for the /dev Stores tab. Run: npm run test:dev-stores
import { test } from "node:test";
import assert from "node:assert/strict";
import { indexStaffByVendor, NO_STAFF } from "../src/lib/dev-stores.js";

const row = (vendorId, role, name, email) => ({ vendorId, role, name, email });

test("counts staff per vendor and never bleeds across tenants", () => {
  // The whole risk of swapping a per-vendor fan-out for one collection-group
  // query: every row now arrives in a single list, so attribution is this
  // function's job rather than the query's.
  const by = indexStaffByVendor([
    row("a", "owner", "Ann", "ann@x.com"), row("a", "staff", "Al"),
    row("b", "staff", "Bo"), row("b", "manager", "Bea"), row("b", "staff", "Ben"),
  ]);
  assert.equal(by.get("a").staffCount, 2);
  assert.equal(by.get("b").staffCount, 3);
  assert.deepEqual(by.get("a").owner, { name: "Ann", email: "ann@x.com", emailVerifiedAt: null });
});

test("a vendor with no owner row reports none, so the caller can fall back", () => {
  const by = indexStaffByVendor([row("b", "staff", "Bo"), row("b", "manager", "Bea")]);
  assert.equal(by.get("b").owner, null);
  assert.equal(by.get("b").staffCount, 2);
});

test("an owner with no email reads as null, not undefined", () => {
  const by = indexStaffByVendor([row("a", "owner", "Ann")]);
  assert.deepEqual(by.get("a").owner, { name: "Ann", email: null, emailVerifiedAt: null });
});

test("rows with no vendorId are dropped rather than bucketed under undefined", () => {
  // A collection-group document whose parent chain isn't vendors/{id}/users
  // must not invent a store or inflate a real one.
  const by = indexStaffByVendor([
    row(undefined, "owner", "Ghost"), row(null, "staff", "Ghost2"), row("", "staff", "Ghost3"),
    row("a", "staff", "Real"),
  ]);
  assert.equal(by.size, 1);
  assert.equal(by.get("a").staffCount, 1);
});

test("an unknown vendor is simply absent — the caller supplies NO_STAFF", () => {
  const by = indexStaffByVendor([row("a", "staff", "Al")]);
  assert.equal(by.get("zzz"), undefined);
  assert.deepEqual(NO_STAFF, { staffCount: 0, owner: null });
});

test("empty, null and junk input never throw", () => {
  for (const bad of [[], null, undefined, [null, undefined, {}, 7, "x"]]) {
    assert.equal(indexStaffByVendor(bad).size, 0);
  }
});

test("both read strategies fold to the identical result", () => {
  // The fallback exists because the collection-group index may not be built
  // yet. It is only safe if the two paths are indistinguishable downstream.
  const groupOrder = [row("a", "staff", "Al"), row("b", "owner", "Bo"), row("a", "owner", "Ann")];
  const fanOutOrder = [row("a", "staff", "Al"), row("a", "owner", "Ann"), row("b", "owner", "Bo")];
  assert.deepEqual([...indexStaffByVendor(groupOrder)].sort(), [...indexStaffByVendor(fanOutOrder)].sort());
});

test("the owner's email-confirmed state survives indexing", () => {
  // Dropped here, the Stores list would report every owner unreachable and
  // support would fall back to in-app for tenants it could have emailed.
  const at = new Date("2026-10-01T00:00:00Z");
  const idx = indexStaffByVendor([
    { vendorId: "v1", role: "owner", name: "Moon", email: "m@e.com", emailVerifiedAt: at },
    { vendorId: "v2", role: "owner", name: "Pat", email: "p@e.com" },
  ]);
  assert.equal(idx.get("v1").owner.emailVerifiedAt, at);
  assert.equal(idx.get("v2").owner.emailVerifiedAt, null, "unconfirmed must read null, not undefined");
  assert.equal(idx.get("v1").owner.email, "m@e.com");
});

test("a store with no owner row still has a usable shape", () => {
  // hasRecoveryEmail(null) must be reachable without a crash — a store whose
  // owner was disabled still renders in the console.
  const idx = indexStaffByVendor([{ vendorId: "v3", role: "employee", name: "Sam", email: "s@e.com" }]);
  assert.equal(idx.get("v3").owner, null);
  assert.equal(idx.get("v3").staffCount, 1);
});
