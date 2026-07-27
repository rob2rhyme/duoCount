// buildShiftLog is pure — no emulator. Run: npm run test:scratch-shift-log
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShiftLog } from "../src/lib/scratch-shift-log.js";

// A scratch count. `ts` is the server-pinned scan time; `startno` is the
// CHAINED baseline from the pack's previous count, `endno` the reading taken now.
const e = (over = {}) => ({
  kind: "scratch", date: "2026-07-26", shift: "open",
  locationId: "loc1", locationName: "Main",
  game: "$20 Frenzy", pack: "17920011361", price: 20,
  startno: 0, endno: 0, sold: 0, dollars: 0,
  by: "RT", byId: "u1", ts: new Date("2026-07-26T11:00:00Z"), ...over,
});

test("a clean open+close pairs into ONE row with both readings, times and signers", () => {
  const rows = buildShiftLog([
    e({ shift: "open", startno: 30, endno: 37, by: "Ana", ts: new Date("2026-07-26T11:02:00Z") }),
    e({ shift: "close", startno: 37, endno: 61, by: "Luis", ts: new Date("2026-07-26T19:04:00Z") }),
  ]).rows;
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.date, "2026-07-26");
  assert.equal(r.game, "$20 Frenzy");
  assert.equal(r.openTicket, 37);          // the OPEN count's endno — the reading
  assert.equal(r.closeTicket, 61);
  assert.equal(r.openBy, "Ana");
  assert.equal(r.closeBy, "Luis");
  assert.equal(r.openTs.getTime(), Date.UTC(2026, 6, 26, 11, 2));
  assert.equal(r.closeTs.getTime(), Date.UTC(2026, 6, 26, 19, 4));
  assert.equal(r.sold, 24);                 // 61 − 37, visible on the row
  assert.equal(r.dollars, 480);
  assert.equal(r.status, "complete");
  assert.equal(r.carriedIn, 30);            // where the pack stood at the prior close
});

test("the reading is endno, never startno — the chained baseline is only `carriedIn`", () => {
  // Pack closed last night at 30; 2 walked overnight, so this morning reads 32.
  const [r] = buildShiftLog([
    e({ shift: "open", startno: 30, endno: 32, ts: new Date("2026-07-26T11:00:00Z") }),
    e({ shift: "close", startno: 32, endno: 50, ts: new Date("2026-07-26T19:00:00Z") }),
  ]).rows;
  assert.equal(r.openTicket, 32);   // NOT 30
  assert.equal(r.carriedIn, 30);
  assert.equal(r.sold, 18);         // this shift only — the overnight 2 is not shift sales
});

test("several opening scans → the FIRST wins; several closing scans → the LAST wins", () => {
  const [r] = buildShiftLog([
    e({ shift: "open", startno: 10, endno: 12, ts: new Date("2026-07-26T11:00:00Z") }),
    e({ shift: "open", startno: 12, endno: 14, ts: new Date("2026-07-26T11:30:00Z") }),
    e({ shift: "close", startno: 14, endno: 40, ts: new Date("2026-07-26T18:00:00Z") }),
    e({ shift: "close", startno: 40, endno: 44, ts: new Date("2026-07-26T19:30:00Z") }),
  ]).rows;
  assert.equal(r.openTicket, 12);   // where the shift began
  assert.equal(r.closeTicket, 44);  // where it ended
  assert.equal(r.sold, 32);
  assert.equal(r.counts, 4);
});

test("a sold-out final count IS the closing reading (matches the pack-flow print)", () => {
  // settlePack snaps endno to the pack size; buildPackFlow shows that as the
  // close, so this table must agree or two printed reports contradict.
  const [r] = buildShiftLog([
    e({ shift: "open", startno: 0, endno: 300, ts: new Date("2026-07-26T11:00:00Z") }),
    e({ shift: "close", startno: 300, endno: 340, ts: new Date("2026-07-26T18:00:00Z") }),
    e({ shift: "close", startno: 340, endno: 500, soldOut: true, perPack: 500, by: "Mgr", ts: new Date("2026-07-26T19:00:00Z") }),
  ]).rows;
  assert.equal(r.closeTicket, 500);
  assert.equal(r.soldOut, true);
  assert.equal(r.soldOutTo, 500);
  assert.equal(r.closeBy, "Mgr");
  assert.equal(r.sold, 200);        // 500 − 300
});

test("opened but not yet closed → open_only, flagged incomplete for a both-shifts store", () => {
  const [r] = buildShiftLog([e({ shift: "open", startno: 30, endno: 37 })]).rows;
  assert.equal(r.status, "open_only");
  assert.equal(r.openTicket, 37);
  assert.equal(r.closeTicket, null);
  assert.equal(r.sold, 7);            // real movement since the pack's last count
  assert.equal(r.incomplete, true);   // this store counts at both ends
});

test("the store's shift policy decides what counts as incomplete", () => {
  const openOnly = [e({ shift: "open", startno: 30, endno: 37 })];
  const closeOnly = [e({ shift: "close", startno: 30, endno: 37 })];
  // A store that only counts at opening is NOT missing a closing count.
  assert.equal(buildShiftLog(openOnly, { policy: "open" }).rows[0].incomplete, false);
  assert.equal(buildShiftLog(openOnly, { policy: "close" }).rows[0].incomplete, true);
  // ...and the mirror image for a closing-only store.
  assert.equal(buildShiftLog(closeOnly, { policy: "close" }).rows[0].incomplete, false);
  assert.equal(buildShiftLog(closeOnly, { policy: "both" }).rows[0].incomplete, true);
  // Both readings present is complete under every policy.
  const both = [
    e({ shift: "open", startno: 30, endno: 32, ts: new Date("2026-07-26T11:00:00Z") }),
    e({ shift: "close", startno: 32, endno: 50, ts: new Date("2026-07-26T19:00:00Z") }),
  ];
  for (const p of ["both", "open", "close"])
    assert.equal(buildShiftLog(both, { policy: p }).rows[0].incomplete, false, `policy ${p}`);
});

test("a clerk sees the shifts they signed — either side — with the coworker still named", () => {
  const entries = [
    e({ pack: "A", shift: "open", byId: "ana", by: "Ana", startno: 0, endno: 10, ts: new Date("2026-07-26T11:00:00Z") }),
    e({ pack: "A", shift: "close", byId: "luis", by: "Luis", startno: 10, endno: 30, ts: new Date("2026-07-26T19:00:00Z") }),
    e({ pack: "B", shift: "close", byId: "luis", by: "Luis", startno: 0, endno: 5, ts: new Date("2026-07-26T19:00:00Z") }),
  ];
  const ana = buildShiftLog(entries, { staffId: "ana" }).rows;
  assert.equal(ana.length, 1);            // only the pack Ana touched
  assert.equal(ana[0].pack, "A");
  assert.equal(ana[0].openBy, "Ana");
  assert.equal(ana[0].closeBy, "Luis");   // the pairing survives the staff filter
  assert.equal(ana[0].sold, 20);          // and so does the real shift math
  assert.equal(buildShiftLog(entries, { staffId: "luis" }).rows.length, 2);
  assert.equal(buildShiftLog(entries).rows.length, 2); // a manager sees everything
});

test("a store that counts once a day (close only) still gets its shift span", () => {
  // The manual form's Start/End are that day's own span, and this entry's signed
  // `sold` is already in the KPI tiles — printing a dash here would contradict them.
  const [r] = buildShiftLog([e({ shift: "close", startno: 40, endno: 75 })]).rows;
  assert.equal(r.status, "close_only");
  assert.equal(r.openTicket, null);
  assert.equal(r.closeTicket, 75);
  assert.equal(r.carriedIn, 40);
  assert.equal(r.sold, 35);
  assert.equal(r.dollars, 700);
});

test("a closing reading BELOW the opening is a rollback — never a fabricated 0", () => {
  const [r] = buildShiftLog([
    e({ shift: "open", startno: 400, endno: 500, ts: new Date("2026-07-26T11:00:00Z") }),
    e({ shift: "close", startno: 500, endno: 480, ts: new Date("2026-07-26T19:00:00Z") }),
  ]).rows;
  assert.equal(r.status, "rollback");
  assert.equal(r.openTicket, 500);
  assert.equal(r.closeTicket, 480);   // both still shown — the owner sees the contradiction
  assert.equal(r.sold, null);
  assert.equal(r.dollars, null);
});

test("an entry with no ts can never masquerade as the opening reading", () => {
  const [r] = buildShiftLog([
    e({ shift: "open", startno: 10, endno: 12, by: "Real", ts: new Date("2026-07-26T11:00:00Z") }),
    e({ shift: "open", startno: 12, endno: 99, by: "Pending", ts: null }),
  ]).rows;
  assert.equal(r.openTicket, 12);
  assert.equal(r.openBy, "Real");
});

test("one pack on two dates → two rows, newest first; two locations → two rows", () => {
  const rows = buildShiftLog([
    e({ date: "2026-07-25", shift: "close", startno: 0, endno: 20, ts: new Date("2026-07-25T19:00:00Z") }),
    e({ date: "2026-07-26", shift: "close", startno: 20, endno: 40, ts: new Date("2026-07-26T19:00:00Z") }),
    e({ date: "2026-07-26", shift: "close", locationId: "loc2", locationName: "East", startno: 5, endno: 9, ts: new Date("2026-07-26T19:00:00Z") }),
  ]).rows;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].date, "2026-07-26");           // newest first
  assert.equal(rows[rows.length - 1].date, "2026-07-25");
  assert.equal(new Set(rows.map((r) => r.locationId)).size, 2);
});

test("date range + location scoping, and non-scratch / packless rows are ignored", () => {
  const entries = [
    e({ date: "2026-07-20", shift: "close", endno: 5 }),
    e({ date: "2026-07-26", shift: "close", endno: 9 }),
    e({ date: "2026-07-26", shift: "close", locationId: "loc2", endno: 9 }),
    e({ pack: "   ", date: "2026-07-26" }),
    { kind: "cash", date: "2026-07-26", diff: -5 },
  ];
  const scoped = buildShiftLog(entries, { from: "2026-07-25", to: "2026-07-27", locationId: "loc1" });
  assert.equal(scoped.rows.length, 1);
  assert.equal(scoped.rows[0].date, "2026-07-26");
});

test("totals roll up only rows with a real span, and count the incomplete ones", () => {
  const { totals } = buildShiftLog([
    e({ pack: "A", shift: "open", startno: 0, endno: 10, ts: new Date("2026-07-26T11:00:00Z") }),
    e({ pack: "A", shift: "close", startno: 10, endno: 30, ts: new Date("2026-07-26T19:00:00Z") }),
    e({ pack: "B", shift: "open", startno: 0, endno: 5 }),                    // open_only
    e({ pack: "C", shift: "close", startno: 100, endno: 90 }),                // rollback
  ]);
  assert.equal(totals.rows, 3);
  assert.equal(totals.packs, 3);
  assert.equal(totals.sold, 25);        // 20 from the paired row + 5 real movement on B
  assert.equal(totals.dollars, 500);
  assert.equal(totals.openOnly, 1);
  assert.equal(totals.rollback, 1);     // C's span is negative — contributes nothing
  assert.equal(totals.incomplete, 2);   // B has no close, C has no open
});

test("empty input is a clean empty result", () => {
  const { rows, totals } = buildShiftLog([]);
  assert.deepEqual(rows, []);
  assert.equal(totals.rows, 0);
  assert.equal(totals.sold, 0);
});
