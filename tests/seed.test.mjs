// buildDemoData is pure — no Firebase needed. Run: npm run test:seed
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoData } from "../src/lib/seed-data.js";

const NOW = new Date("2026-07-11T12:00:00Z");
const owner = { id: "owner1", name: "Jordan Price", role: "owner" };
const build = () => buildDemoData({ owner, now: NOW });

const round2 = (n) => Math.round(n * 100) / 100;
const allDocs = (d) => [...d.staff, ...d.locations, ...d.drawers, ...d.items, ...d.packs, ...d.entries, ...d.notes, ...d.incidents];

test("deterministic given the same now", () => {
  assert.deepEqual(build(), build());
});

test("expected collection counts", () => {
  const d = build();
  assert.equal(d.staff.length, 3);
  assert.equal(d.locations.length, 2);
  assert.equal(d.drawers.length, 4);
  assert.equal(d.items.length, 3);
  assert.equal(d.packs.length, 3);
  assert.equal(d.entries.length, 21); // 14 cash + 4 scratch + 3 inventory
  assert.equal(d.notes.length, 3);
  assert.equal(d.incidents.length, 2);
});

test("every doc is seed-namespaced and ids are unique", () => {
  const d = build();
  const ids = allDocs(d).map((x) => x.id);
  for (const id of ids) assert.ok(/^seed_/.test(id), `id not seed-namespaced: ${id}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate ids");
});

test("entries are well-formed and signed", () => {
  const d = build();
  for (const e of d.entries) {
    assert.ok(["cash", "scratch", "inventory"].includes(e.kind));
    assert.ok(e.by && e.byId && e.byRole, "entry missing author");
    assert.equal(e.disputeStatus !== undefined, true);
  }
});

test("cash and inventory math is consistent", () => {
  const d = build();
  for (const e of d.entries) {
    if (e.kind === "cash") {
      assert.equal(e.expected, round2(e.start + e.sales - e.paidout));
      assert.equal(e.diff, round2(e.counted - e.expected));
    }
    if (e.kind === "inventory") {
      assert.equal(e.expected, e.startQty + e.received - e.soldQty - e.removed);
      assert.equal(e.diff, e.counted - e.expected);
    }
    if (e.kind === "scratch") {
      assert.equal(e.sold, Math.max(0, e.endno - e.startno));
      assert.equal(e.dollars, round2(e.sold * e.price));
    }
  }
});

test("no entry is verified by its own author", () => {
  const d = build();
  for (const e of d.entries) {
    if (e.verifiedBy) assert.notEqual(e.verifiedBy, e.by, `self-verified: ${e.id}`);
  }
});

test("the log has the demo variety it promises", () => {
  const d = build();
  const has = (pred) => d.entries.some(pred);
  assert.ok(has((e) => e.varianceStatus === "open"), "expected an open flag");
  assert.ok(has((e) => e.varianceStatus === "resolved" && e.causeCode), "expected a resolved flag with a cause code");
  assert.ok(has((e) => ["open", "under-review"].includes(e.disputeStatus)), "expected a dispute");
  assert.ok(has((e) => e.verifiedBy), "expected some verified entries");
  assert.ok(has((e) => e.kind === "scratch") && has((e) => e.kind === "inventory"), "expected scratch + inventory");
});

test("dispute thread is wired to a real entry with a matching count", () => {
  const d = build();
  const ids = Object.keys(d.comments);
  assert.ok(ids.length >= 1, "expected at least one comment thread");
  for (const id of ids) {
    const e = d.entries.find((x) => x.id === id);
    assert.ok(e, `comment thread ${id} has no entry`);
    assert.equal(e.commentCount, d.comments[id].length);
    assert.ok(["open", "under-review"].includes(e.disputeStatus));
  }
});
