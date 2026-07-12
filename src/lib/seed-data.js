// Pure, dependency-free builder for demo data. Deterministic given `now`, so
// tests and screenshots are stable. Every document is tagged `{ seed: true }`
// and uses a `seed_*` id, so the server route can (a) write with explicit ids
// — making re-load idempotent — and (b) clear by querying `seed == true`.
//
// This runs on the server (Admin SDK) where rules are bypassed, which is why it
// can attribute entries to several staff, pre-verify some, and pre-resolve a
// flag — none of which a client could do under the append-only, signed-author
// rules. It only ever touches `seed`-tagged docs; real data is never affected.

import { weekStartMonday, weekDates } from "./schedule.js";

// Small seeded PRNG (mulberry32) so "random-looking" values are reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round2 = (n) => Math.round(n * 100) / 100;

export function buildDemoData({ owner, now = new Date() }) {
  const rnd = mulberry32(0x5eed5eed);
  const DAY = 86400000;
  const ts = (daysAgo) => new Date(now.getTime() - daysAgo * DAY);
  const dateStr = (daysAgo) => ts(daysAgo).toISOString().slice(0, 10);

  // ---- staff (illustrative authors; created without sign-in credentials) ----
  const staff = [
    { id: "seed_usr_sam", name: "Sam Rivera", role: "employee", locationId: "seed_loc_main" },
    { id: "seed_usr_alex", name: "Alex Kim", role: "employee", locationId: "seed_loc_main" },
    { id: "seed_usr_dana", name: "Dana Brooks", role: "manager", locationId: null },
  ].map((s) => ({ ...s, active: true, createdAt: ts(30) }));

  const manager = { id: "seed_usr_dana", name: "Dana Brooks" };
  const ownerAuthor = { id: owner.id, name: owner.name, role: owner.role || "owner" };
  const authors = [ownerAuthor, ...staff.map((s) => ({ id: s.id, name: s.name, role: s.role }))];
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  // A verifier who isn't the author (managers can't verify their own counts).
  const verifierFor = (author) => (author.id === manager.id ? ownerAuthor : manager);

  const locations = [
    { id: "seed_loc_main", name: "Main Store" },
    { id: "seed_loc_kiosk", name: "Downtown Kiosk" },
  ].map((l) => ({ ...l, active: true, createdAt: ts(30) }));

  const drawers = [
    { id: "seed_drw_pos_main", name: "POS Cash Drawer", locationId: "seed_loc_main" },
    { id: "seed_drw_lot_main", name: "Lottery Cash Drawer", locationId: "seed_loc_main" },
    { id: "seed_drw_safe_main", name: "Safe", locationId: "seed_loc_main" },
    { id: "seed_drw_pos_kiosk", name: "POS Cash Drawer", locationId: "seed_loc_kiosk" },
  ].map((d) => ({ ...d, active: true, createdAt: ts(30) }));

  const items = [
    { id: "seed_itm_marlboro", name: "Marlboro Gold Box", category: "Cigarettes", unit: "pack", locationId: "seed_loc_main" },
    { id: "seed_itm_swisher", name: "Grape Swishers", category: "Cigars", unit: "pack", locationId: "seed_loc_main" },
    { id: "seed_itm_bic", name: "Bic Lighters", category: "Accessories", unit: "each", locationId: "seed_loc_main" },
  ].map((it) => ({ ...it, active: true, createdAt: ts(30) }));

  const packs = [
    { id: "seed_pak_bonus", game: "$5 Bonus Cashword", pack: "1234-001", price: 5, ticketsPerPack: 60, status: "active", bin: "3", locationId: "seed_loc_main", activatedAt: ts(18), activatedBy: manager.name },
    { id: "seed_pak_colossal", game: "$10 Colossal Cash", pack: "0777-014", price: 10, ticketsPerPack: 40, status: "active", bin: "5", locationId: "seed_loc_main", activatedAt: ts(15), activatedBy: manager.name },
    { id: "seed_pak_lucky", game: "$2 Lucky 7s", pack: "0450-208", price: 2, ticketsPerPack: 75, status: "received", locationId: "seed_loc_main" },
    // A fully settled pack, so the Packs list shows the whole lifecycle and the
    // settlement-reconciliation tool has a recorded figure to match a CSV against
    // ($3 × 44 sold = $132 recorded).
    { id: "seed_pak_cherry", game: "$3 Wild Cherry", pack: "0888-102", price: 3, ticketsPerPack: 50, status: "settled", locationId: "seed_loc_main", activatedAt: ts(24), activatedBy: manager.name, settledAt: ts(3), settledBy: manager.name, soldAtSettle: 44, shortAtSettle: 6 },
  ].map((p) => ({ ...p, createdAt: ts(30) }));

  const entries = [];
  const comments = {}; // entryId -> [comment, ...]
  let seq = 0;
  const eid = () => `seed_ent_${String(++seq).padStart(3, "0")}`;

  const baseEntry = (author, daysAgo, extra) => ({
    date: dateStr(daysAgo), shift: "close",
    locationId: "seed_loc_main", locationName: "Main Store",
    by: author.name, byId: author.id, byRole: author.role,
    verifiedBy: null, disputeStatus: "none", varianceStatus: "none",
    commentCount: 0, ts: ts(daysAgo), ...extra,
  });

  // Daily POS cash close for the last 14 days — most balanced, a few off.
  for (let d = 14; d >= 1; d--) {
    const author = pick(authors);
    const start = 200;
    const sales = 400 + Math.floor(rnd() * 400);
    const paidout = Math.floor(rnd() * 40);
    const expected = round2(start + sales - paidout);
    const off = rnd() < 0.32 ? round2(rnd() * 22 - 11) : 0;
    const counted = round2(expected + off);
    const diff = round2(counted - expected);
    const flagged = Math.abs(diff) >= 5;
    const e = baseEntry(author, d, {
      id: eid(), kind: "cash",
      drawerId: "seed_drw_pos_main", drawerName: "POS Cash Drawer",
      start, sales, paidout, counted, expected, diff, blind: false,
      flagged, varianceStatus: flagged ? "open" : "none",
    });
    entries.push(e);
  }

  // A handful of scratch-off counts on the lottery drawer.
  const scratchDefs = [
    { d: 9, game: "$5 Bonus Cashword", price: 5, pack: "1234-001", startno: 4, endno: 21 },
    { d: 6, game: "$10 Colossal Cash", price: 10, pack: "0777-014", startno: 0, endno: 9 },
    { d: 3, game: "$5 Bonus Cashword", price: 5, pack: "1234-001", startno: 21, endno: 33 },
    { d: 1, game: "$2 Lucky 7s", price: 2, pack: "0450-208", startno: 0, endno: 25 },
  ];
  for (const s of scratchDefs) {
    const author = pick(authors);
    const sold = Math.max(0, s.endno - s.startno);
    entries.push(baseEntry(author, s.d, {
      id: eid(), kind: "scratch",
      drawerId: "seed_drw_lot_main", drawerName: "Lottery Cash Drawer",
      game: s.game, price: s.price, pack: s.pack, startno: s.startno, endno: s.endno,
      sold, dollars: round2(sold * s.price),
    }));
  }

  // Inventory shelf counts — one clean, one over, one short.
  const invDefs = [
    { d: 8, item: items[0], startQty: 25, received: 12, soldQty: 14, removed: 0, counted: 23 },
    { d: 5, item: items[1], startQty: 40, received: 0, soldQty: 9, removed: 1, counted: 30 },
    { d: 2, item: items[2], startQty: 60, received: 24, soldQty: 30, removed: 0, counted: 49 },
  ];
  for (const v of invDefs) {
    const author = pick(authors);
    const expected = v.startQty + v.received - v.soldQty - v.removed;
    const diff = v.counted - expected;
    entries.push(baseEntry(author, v.d, {
      id: eid(), kind: "inventory",
      itemId: v.item.id, itemName: v.item.name, unit: v.item.unit,
      startQty: v.startQty, received: v.received, soldQty: v.soldQty, removed: v.removed,
      expected, counted: v.counted, diff,
      flagged: diff < 0, varianceStatus: diff < 0 ? "open" : "none",
    }));
  }

  // Verify ~60% of entries older than 2 days, by someone other than the author.
  for (const e of entries) {
    const daysAgo = Math.round((now.getTime() - e.ts.getTime()) / DAY);
    if (daysAgo >= 2 && rnd() < 0.6) {
      const v = verifierFor({ id: e.byId });
      e.verifiedBy = v.name;
      e.verifiedAt = new Date(e.ts.getTime() + 3600000);
    }
  }

  // Resolve one open flag with a cause code (leaves the others open).
  const firstFlag = entries.find((e) => e.varianceStatus === "open");
  if (firstFlag) {
    firstFlag.varianceStatus = "resolved";
    firstFlag.causeCode = "register-error";
    firstFlag.causeNote = "Register mis-rang a lottery payout; corrected at close.";
    firstFlag.resolvedBy = manager.name;
    firstFlag.resolvedAt = new Date(firstFlag.ts.getTime() + 7200000);
  }

  // Put one balanced entry into an active dispute, with a short thread.
  const toDispute = entries.find((e) => e.kind === "cash" && e.varianceStatus === "none" && !e.verifiedBy)
    || entries.find((e) => e.kind === "cash");
  if (toDispute) {
    toDispute.disputeStatus = "open";
    toDispute.commentCount = 2;
    comments[toDispute.id] = [
      { id: "seed_cmt_1", by: toDispute.by, byId: toDispute.byId, kind: "comment",
        text: "The over/short here looks off — I was covering register 2, not this drawer.", ts: new Date(toDispute.ts.getTime() + 1800000) },
      { id: "seed_cmt_2", by: manager.name, byId: manager.id, kind: "status",
        text: `Dispute marked under review by ${manager.name}`, ts: new Date(toDispute.ts.getTime() + 5400000) },
    ];
    toDispute.disputeStatus = "under-review";
  }

  const notes = [
    { id: "seed_note_1", text: "Register 2 drawer is sticking — jiggle the till, don't force it.", pinned: true, shift: "open" },
    { id: "seed_note_2", text: "Lottery bin 5 low on $10 Colossal — reorder when the box lands.", pinned: false, shift: "close" },
    { id: "seed_note_3", text: "New hire shadowing closing counts this week; double-check their drawer.", pinned: false, shift: "close" },
  ].map((nRaw, i) => {
    const author = staff[i % staff.length];
    return {
      ...nRaw, active: true,
      by: author.name, byId: author.id,
      locationId: "seed_loc_main", locationName: "Main Store",
      ts: ts(6 - i * 2),
    };
  });

  const incidents = [
    {
      id: "seed_inc_1", title: "POS drawer left unlocked overnight",
      text: "Closing count was fine, but the POS drawer was found unlocked the next morning. Nothing missing; logging for the record and a coaching conversation.",
      severity: "warning", subjectId: "seed_usr_sam", subjectName: "Sam Rivera",
      links: [], ts: ts(4),
    },
    {
      id: "seed_inc_2", title: "No-call no-show for opening shift",
      text: "Scheduled to open Main Store and did not arrive or call; store opened 25 minutes late.",
      severity: "serious", subjectId: "seed_usr_alex", subjectName: "Alex Kim",
      links: [], ts: ts(2),
    },
  ].map((incRaw) => ({
    ...incRaw, status: "open", ackAt: null, ackNote: null, closedBy: null, closedAt: null,
    by: ownerAuthor.name, byId: ownerAuthor.id,
    locationId: "seed_loc_main", locationName: "Main Store",
  }));

  // ---- workforce: time clock, schedule, availability, templates ----
  // Dates are UTC-ISO like the rest of the app (schedule.js is UTC-based), so
  // the roster lands on exactly the week the Schedule tab renders by default.
  const sam = staff[0], alex = staff[1], mgr = staff[2];
  const iso = (daysAgo) => dateStr(daysAgo);
  const atUTC = (dayIso, hourUTC) => new Date(`${dayIso}T${String(hourUTC).padStart(2, "0")}:00:00Z`);

  // Time-clock punches for the last 6 days: Sam a morning shift, Alex a midday
  // shift with one no-show (day 2 — mirrors the no-show incident), plus Sam
  // currently on the clock today (an open, un-paired punch).
  const timeclock = [];
  let tcSeq = 0;
  const punch = (u, dayIso, hourUTC, type, tsOverride) => ({
    id: `seed_tc_${String(++tcSeq).padStart(3, "0")}`,
    userId: u.id, userName: u.name,
    locationId: "seed_loc_main", locationName: "Main Store",
    type, ts: tsOverride || atUTC(dayIso, hourUTC), day: dayIso,
  });
  for (let d = 6; d >= 1; d--) {
    const day = iso(d);
    timeclock.push(punch(sam, day, 14, "in"));
    timeclock.push(punch(sam, day, 22, "out"));
    if (d !== 2) {
      timeclock.push(punch(alex, day, 16, "in"));
      timeclock.push(punch(alex, day, 23, "out"));
    }
  }
  // Sam is still on the clock now (clocked in a couple hours ago, no out yet).
  timeclock.push(punch(sam, iso(0), 0, "in", new Date(now.getTime() - 2 * 3600000)));

  // Roster for the current week (Mon–Sun), so the Schedule tab opens populated.
  const ws = weekStartMonday(iso(0));
  const wd = weekDates(ws);
  const schedule = [];
  let schSeq = 0;
  const shift = (u, date, start, end, extra = {}) => ({
    id: `seed_sch_${String(++schSeq).padStart(3, "0")}`,
    userId: u ? u.id : null, userName: u ? u.name : null,
    locationId: "seed_loc_main", locationName: "Main Store",
    date, start, end, by: mgr.name, byId: mgr.id, ts: ts(7), ...extra,
  });
  [0, 1, 2, 3, 4].forEach((i) => schedule.push(shift(sam, wd[i], "09:00", "17:00")));
  [0, 2, 4, 5].forEach((i) => schedule.push(shift(alex, wd[i], "12:00", "20:00")));
  schedule.push(shift(null, wd[6], "10:00", "18:00", { open: true })); // open shift anyone can grab
  // A swap in flight: Alex offers Friday; his Saturday is claimed by Sam.
  const alexFri = schedule.find((s) => s.userId === alex.id && s.date === wd[4]);
  if (alexFri) alexFri.swapStatus = "offered";
  const alexSat = schedule.find((s) => s.userId === alex.id && s.date === wd[5]);
  if (alexSat) { alexSat.swapStatus = "claimed"; alexSat.claimedById = sam.id; alexSat.claimedByName = sam.name; }

  // Staff availability — days employees marked they can't work.
  const availability = [
    { id: "seed_avl_1", userId: alex.id, userName: alex.name, date: wd[3], ts: ts(5) },
    { id: "seed_avl_2", userId: sam.id, userName: sam.name, date: wd[6], ts: ts(4) },
  ];

  // One saved week template (the assigned shifts, as day-of-week specs).
  const templates = [{
    id: "seed_tpl_standard", name: "Standard week",
    shifts: schedule.filter((s) => s.userId).map((s) => ({
      dow: wd.indexOf(s.date), userId: s.userId, userName: s.userName,
      start: s.start, end: s.end, locationId: s.locationId, locationName: s.locationName,
    })),
    by: mgr.name, byId: mgr.id, ts: ts(10),
  }];

  // The current week was published (the doc id is the week start, per the API).
  const schedulePublished = [{
    id: ws, weekStart: ws, weekEnd: wd[6],
    publishedAt: ts(1), publishedBy: mgr.name, notified: 2, recipients: 2,
  }];

  return {
    staff, locations, drawers, items, packs, entries, comments, notes, incidents,
    timeclock, schedule, availability, templates, schedulePublished,
  };
}

// Collections whose top-level docs carry a `seed` flag, for tagging + clearing.
export const SEED_COLLECTIONS = [
  "locations", "drawers", "items", "packs", "entries", "notes", "incidents", "users",
  "timeclock", "schedule", "availability", "templates", "schedulePublished",
];
