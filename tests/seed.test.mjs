// buildDemoData is pure — no Firebase needed. Run: npm run test:seed
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoData } from "../src/lib/seed-data.js";

const NOW = new Date("2026-07-11T12:00:00Z");
const owner = { id: "owner1", name: "Jordan Price", role: "owner" };
const build = () => buildDemoData({ owner, now: NOW });

const round2 = (n) => Math.round(n * 100) / 100;
// Every seed doc except schedulePublished, whose id is intentionally the week
// start (so the app recognizes the week as published), not a seed_ id.
const allDocs = (d) => [
  ...d.staff, ...d.locations, ...d.drawers, ...d.items, ...d.packs, ...d.entries,
  ...d.notes, ...d.incidents, ...d.timeclock, ...d.schedule, ...d.availability, ...d.templates,
];

test("deterministic given the same now", () => {
  assert.deepEqual(build(), build());
});

test("expected collection shape (counts scale with the history window)", () => {
  const d = build();
  assert.equal(d.staff.length, 4);
  assert.equal(d.locations.length, 2);
  assert.equal(d.drawers.length, 4);
  assert.equal(d.items.length, 4);
  assert.ok(d.packs.length >= 6, "expected the full pack lifecycle set");
  assert.ok(d.entries.length > 150, `expected a rich log, got ${d.entries.length}`);
  assert.ok(d.notes.length >= 5, "expected several notes");
  assert.ok(d.incidents.length >= 4, "expected several incidents");
  assert.ok(d.timeclock.length >= 30, "expected weeks of punches");
  assert.ok(d.schedule.length >= 24, "expected multiple weeks of shifts");
  assert.ok(d.availability.length >= 2);
  assert.ok(d.templates.length >= 1);
  assert.ok(d.schedulePublished.length >= 1);
});

test("history length is configurable and scales the log", () => {
  const short = buildDemoData({ owner, now: NOW, days: 30 });
  const long = buildDemoData({ owner, now: NOW, days: 240 });
  assert.ok(long.entries.length > short.entries.length * 3, "more days -> proportionally more counts");
  // Entries span roughly the requested window.
  const oldest = long.entries.reduce((m, e) => Math.min(m, e.ts.getTime()), Infinity);
  const daysBack = (NOW.getTime() - oldest) / 86400000;
  assert.ok(daysBack > 180, `expected ~240 days of history, got ${Math.round(daysBack)}`);
});

test("counts span both locations and every kind", () => {
  const d = build();
  const kinds = new Set(d.entries.map((e) => e.kind));
  assert.ok(kinds.has("cash") && kinds.has("scratch") && kinds.has("inventory"));
  const locs = new Set(d.entries.map((e) => e.locationId));
  assert.ok(locs.has("seed_loc_main") && locs.has("seed_loc_kiosk"), "expected multi-location data");
});

test("packs cover the full lifecycle incl. settled packs for reconciliation", () => {
  const d = build();
  const settled = d.packs.filter((p) => p.status === "settled");
  assert.ok(settled.length >= 2, "expected several settled packs");
  for (const p of settled) assert.ok(Number.isFinite(p.soldAtSettle), "settled pack needs soldAtSettle");
  assert.ok(d.packs.some((p) => p.status === "active") && d.packs.some((p) => p.status === "received"));
});

test("time-clock punches are signed, typed, and pair into shifts", () => {
  const d = build();
  for (const p of d.timeclock) {
    assert.ok(["in", "out"].includes(p.type), "punch type must be in/out");
    assert.ok(p.userId && p.userName, "punch must be signed");
    assert.ok(p.ts instanceof Date && typeof p.day === "string");
  }
  // Exactly one open (unpaired) punch: someone currently on the clock.
  const ins = d.timeclock.filter((p) => p.type === "in").length;
  const outs = d.timeclock.filter((p) => p.type === "out").length;
  assert.equal(ins - outs, 1, "expected one open shift (one extra 'in')");
});

test("schedule has assigned shifts, an open shift, and a swap in flight", () => {
  const d = build();
  assert.ok(d.schedule.some((s) => s.userId && !s.open), "expected assigned shifts");
  assert.ok(d.schedule.some((s) => s.open === true && s.userId === null), "expected an open shift");
  assert.ok(d.schedule.some((s) => s.swapStatus === "offered"), "expected an offered swap");
  const claimed = d.schedule.find((s) => s.swapStatus === "claimed");
  assert.ok(claimed && claimed.claimedById && claimed.claimedByName, "expected a claimed swap with a claimer");
  for (const s of d.schedule) assert.ok(s.by && s.byId, "shift must be signed by a manager");
});

test("the published-week record keys off the week start (not a seed_ id)", () => {
  const d = build();
  const pub = d.schedulePublished[0];
  assert.equal(pub.id, pub.weekStart, "doc id must equal the week start");
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(pub.weekStart) && /^\d{4}-\d{2}-\d{2}$/.test(pub.weekEnd));
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
