// Pure, dependency-free builder for demo data. Deterministic given `now` (and
// `days`), so tests and screenshots are stable. Every document is tagged
// `{ seed: true }` and uses a `seed_*` id, so the server route can (a) write
// with explicit ids — making re-load idempotent — and (b) clear by querying
// `seed == true`.
//
// This runs on the server (Admin SDK) where rules are bypassed, which is why it
// can attribute entries to several staff, pre-verify some, and pre-resolve a
// flag — none of which a client could do under the append-only, signed-author
// rules. It only ever touches `seed`-tagged docs; real data is never affected.
//
// `days` controls how much history is generated (default ~4 months). Bump it
// (e.g. 400) to populate longer report periods like semi-annual / annual.

import { weekStartMonday, weekDates, addDays } from "./schedule.js";

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

export function buildDemoData({ owner, now = new Date(), days = 120 }) {
  const rnd = mulberry32(0x5eed5eed);
  const DAY = 86400000;
  const HISTORY = Math.max(21, Math.round(days)); // at least three weeks
  const ts = (daysAgo) => new Date(now.getTime() - daysAgo * DAY);
  const dateStr = (daysAgo) => ts(daysAgo).toISOString().slice(0, 10);
  const born = ts(HISTORY + 7); // static entities predate the earliest count

  // ---- staff (illustrative authors; created without sign-in credentials) ----
  const staff = [
    { id: "seed_usr_sam", name: "Sam Rivera", role: "employee", locationId: "seed_loc_main" },
    { id: "seed_usr_alex", name: "Alex Kim", role: "employee", locationId: "seed_loc_main" },
    { id: "seed_usr_jordan", name: "Jordan Lee", role: "employee", locationId: "seed_loc_kiosk" },
    { id: "seed_usr_dana", name: "Dana Brooks", role: "manager", locationId: null },
  ].map((s) => ({ ...s, active: true, createdAt: born }));

  const manager = { id: "seed_usr_dana", name: "Dana Brooks" };
  const ownerAuthor = { id: owner.id, name: owner.name, role: owner.role || "owner" };
  const authors = [ownerAuthor, ...staff.map((s) => ({ id: s.id, name: s.name, role: s.role }))];
  const mainAuthors = authors.filter((a) => a.id !== "seed_usr_jordan"); // Jordan works the kiosk
  const jordan = { id: staff[2].id, name: staff[2].name, role: staff[2].role };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  // A verifier who isn't the author (managers can't verify their own counts).
  const verifierFor = (author) => (author.id === manager.id ? ownerAuthor : manager);

  const locations = [
    { id: "seed_loc_main", name: "Main Store" },
    { id: "seed_loc_kiosk", name: "Downtown Kiosk" },
  ].map((l) => ({ ...l, active: true, createdAt: born }));

  const drawers = [
    { id: "seed_drw_pos_main", name: "POS Cash Drawer", loc: locations[0] },
    { id: "seed_drw_lot_main", name: "Lottery Cash Drawer", loc: locations[0] },
    { id: "seed_drw_safe_main", name: "Safe", loc: locations[0] },
    { id: "seed_drw_pos_kiosk", name: "POS Cash Drawer", loc: locations[1] },
  ].map((d) => ({ id: d.id, name: d.name, locationId: d.loc.id, _loc: d.loc, active: true, createdAt: born }));
  const drawerDocs = drawers.map(({ _loc, ...d }) => d);

  const items = [
    { id: "seed_itm_marlboro", name: "Marlboro Gold Box", category: "Cigarettes", unit: "pack", locationId: "seed_loc_main" },
    { id: "seed_itm_swisher", name: "Grape Swishers", category: "Cigars", unit: "pack", locationId: "seed_loc_main" },
    { id: "seed_itm_bic", name: "Bic Lighters", category: "Accessories", unit: "each", locationId: "seed_loc_main" },
    { id: "seed_itm_redbull", name: "Red Bull 12oz", category: "Beverages", unit: "can", locationId: "seed_loc_main" },
  ].map((it) => ({ ...it, active: true, createdAt: born }));

  // The pack-lifecycle/settlement feature was retired (settlement is the
  // lottery's job) — packs exist only as the pack #s on scratch count entries.
  // "packs" stays in SEED_COLLECTIONS so clearing still removes legacy demo docs.

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

  // ---- cash: a daily POS close, plus periodic lottery-drawer and kiosk closes,
  // over the whole history window. Most balance; ~30% are a few dollars off.
  const cashClose = (author, d, drawer, salesBase) => {
    const start = 200;
    const sales = salesBase + Math.floor(rnd() * salesBase);
    const paidout = Math.floor(rnd() * 40);
    const expected = round2(start + sales - paidout);
    const off = rnd() < 0.3 ? round2(rnd() * 24 - 12) : 0;
    const counted = round2(expected + off);
    const diff = round2(counted - expected);
    const flagged = Math.abs(diff) >= 5;
    entries.push(baseEntry(author, d, {
      id: eid(), kind: "cash",
      drawerId: drawer.id, drawerName: drawer.name,
      locationId: drawer.locationId, locationName: drawer._loc.name,
      start, sales, paidout, counted, expected, diff, blind: false,
      flagged, varianceStatus: flagged ? "open" : "none",
    }));
  };
  for (let d = HISTORY; d >= 1; d--) {
    cashClose(pick(mainAuthors), d, drawers[0], 400);                       // POS main, every day
    if (rnd() < 0.35) cashClose(pick(mainAuthors), d, drawers[1], 250);     // lottery drawer, some days
    if (rnd() < 0.3) cashClose(jordan, d, drawers[3], 180); // kiosk POS, some days
  }

  // ---- scratch-off counts every ~3 days, walking each pack's ticket numbers.
  const scratchGames = [
    { game: "$5 Bonus Cashword", price: 5, pack: "1234-001" },
    { game: "$10 Colossal Cash", price: 10, pack: "0777-014" },
    { game: "$2 Lucky 7s", price: 2, pack: "0450-208" },
  ];
  const pos = Object.fromEntries(scratchGames.map((g) => [g.pack, 0]));
  for (let d = HISTORY; d >= 1; d -= 3) {
    const g = scratchGames[Math.floor(rnd() * scratchGames.length)];
    const startno = pos[g.pack];
    const sold = 4 + Math.floor(rnd() * 22);
    const endno = startno + sold;
    pos[g.pack] = endno;
    entries.push(baseEntry(pick(mainAuthors), d, {
      id: eid(), kind: "scratch",
      drawerId: "seed_drw_lot_main", drawerName: "Lottery Cash Drawer",
      game: g.game, price: g.price, pack: g.pack, startno, endno,
      sold, dollars: round2(sold * g.price),
    }));
  }

  // ---- inventory shelf counts every ~4 days, rotating items; ~25% show shrink.
  for (let d = HISTORY - 1; d >= 1; d -= 4) {
    const item = items[Math.floor(rnd() * items.length)];
    const startQty = 20 + Math.floor(rnd() * 40);
    const received = Math.floor(rnd() * 20);
    const soldQty = Math.floor(rnd() * 18);
    const removed = rnd() < 0.2 ? 1 + Math.floor(rnd() * 2) : 0;
    const expected = startQty + received - soldQty - removed;
    const shrink = rnd() < 0.25 ? -(1 + Math.floor(rnd() * 3)) : 0;
    const counted = expected + shrink;
    const diff = counted - expected;
    entries.push(baseEntry(pick(mainAuthors), d, {
      id: eid(), kind: "inventory",
      itemId: item.id, itemName: item.name, unit: item.unit,
      startQty, received, soldQty, removed, expected, counted, diff,
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

  // Resolve ~40% of open flags with a cause code; leave the rest open for the queue.
  const causes = [
    ["register-error", "Register mis-rang a lottery payout; corrected at close."],
    ["miscount", "Recount matched the deposit; original tally was off."],
    ["owed-change", "Customer shorted change earlier in the shift; noted and squared."],
  ];
  let resolvedCount = 0;
  for (const e of entries) {
    if (e.varianceStatus !== "open") continue;
    if (rnd() < 0.4) {
      const [code, note] = causes[Math.floor(rnd() * causes.length)];
      e.varianceStatus = "resolved";
      e.causeCode = code;
      e.causeNote = note;
      e.resolvedBy = manager.name;
      e.resolvedAt = new Date(e.ts.getTime() + 7200000);
      resolvedCount++;
    }
  }
  // Guarantee at least one resolved-with-cause even on a sparse draw.
  if (resolvedCount === 0) {
    const f = entries.find((e) => e.varianceStatus === "open");
    if (f) { f.varianceStatus = "resolved"; f.causeCode = "register-error"; f.causeNote = causes[0][1]; f.resolvedBy = manager.name; f.resolvedAt = new Date(f.ts.getTime() + 7200000); }
  }

  // Put one balanced entry into an active dispute, with a short thread.
  const toDispute = entries.find((e) => e.kind === "cash" && e.varianceStatus === "none" && !e.verifiedBy)
    || entries.find((e) => e.kind === "cash");
  if (toDispute) {
    toDispute.disputeStatus = "under-review";
    toDispute.commentCount = 2;
    comments[toDispute.id] = [
      { id: "seed_cmt_1", by: toDispute.by, byId: toDispute.byId, kind: "comment",
        text: "The over/short here looks off — I was covering register 2, not this drawer.", ts: new Date(toDispute.ts.getTime() + 1800000) },
      { id: "seed_cmt_2", by: manager.name, byId: manager.id, kind: "status",
        text: `Dispute marked under review by ${manager.name}`, ts: new Date(toDispute.ts.getTime() + 5400000) },
    ];
  }

  // ---- shift notes scattered across the window (most recent first). ----
  const noteTexts = [
    ["Register 2 drawer is sticking — jiggle the till, don't force it.", true, "open"],
    ["Lottery bin 5 low on $10 Colossal — reorder when the box lands.", false, "close"],
    ["New hire shadowing closing counts this week; double-check their drawer.", false, "close"],
    ["Card reader on POS 1 rebooted twice today — flagged to the processor.", false, "open"],
    ["Coin order comes Thursday; we're short on quarters until then.", false, "close"],
    ["Kiosk heater is out — keep the scratch stock off the north wall.", false, "open"],
    ["Health inspector stopped by, all good. Certificate is back on the wall.", true, "close"],
  ];
  const notes = noteTexts.map(([text, pinned, shift], i) => {
    const author = staff[i % staff.length];
    return {
      id: `seed_note_${i + 1}`, text, pinned, shift, active: true,
      by: author.name, byId: author.id,
      locationId: "seed_loc_main", locationName: "Main Store",
      ts: ts(Math.min(HISTORY - 1, 2 + i * 5)),
    };
  });

  // ---- incidents across the window; a couple acknowledged / closed. ----
  const incidents = [
    { id: "seed_inc_1", title: "POS drawer left unlocked overnight", severity: "warning", subjectId: "seed_usr_sam", subjectName: "Sam Rivera",
      text: "Closing count was fine, but the POS drawer was found unlocked the next morning. Nothing missing; logging for the record and a coaching conversation.", d: 4, status: "open" },
    { id: "seed_inc_2", title: "No-call no-show for opening shift", severity: "serious", subjectId: "seed_usr_alex", subjectName: "Alex Kim",
      text: "Scheduled to open Main Store and did not arrive or call; store opened 25 minutes late.", d: 2, status: "acknowledged" },
    { id: "seed_inc_3", title: "Scratch pack ticket gap between counts", severity: "note", subjectId: null, subjectName: null,
      text: "Gold Rush opened 2 tickets above the previous shift's closing number. Small, but logged so the pattern is visible if it repeats.", d: 34, status: "closed" },
    { id: "seed_inc_4", title: "Repeated register-2 shortages", severity: "warning", subjectId: "seed_usr_jordan", subjectName: "Jordan Lee",
      text: "Register 2 came up short three times in two weeks under the same closer. Coaching scheduled; watching next cycle.", d: 20, status: "closed" },
    { id: "seed_inc_5", title: "Back stockroom door propped open", severity: "note", subjectId: null, subjectName: null,
      text: "Delivery crew propped the back door and left it during a break. Reminded the team; no loss.", d: 55, status: "open" },
  ].map((it) => {
    const base = {
      id: it.id, title: it.title, text: it.text, severity: it.severity,
      subjectId: it.subjectId, subjectName: it.subjectName, links: [],
      status: "open", ackAt: null, ackNote: null, closedBy: null, closedAt: null,
      by: ownerAuthor.name, byId: ownerAuthor.id,
      locationId: "seed_loc_main", locationName: "Main Store", ts: ts(it.d),
    };
    if (it.status === "acknowledged" || it.status === "closed") {
      base.status = "acknowledged";
      base.ackAt = new Date(base.ts.getTime() + 6 * 3600000);
      base.ackNote = it.subjectId ? "Seen — my side is on the record." : null;
    }
    if (it.status === "closed") {
      base.status = "closed";
      base.closedBy = manager.name;
      base.closedAt = new Date(base.ts.getTime() + 2 * DAY);
    }
    return base;
  });

  // ---- workforce: time clock, schedule, availability, templates ----
  // Dates are UTC-ISO like the rest of the app (schedule.js is UTC-based), so
  // the roster lands on exactly the weeks the Schedule tab renders.
  const sam = staff[0], alex = staff[1], mgr = staff[3];
  const iso = (daysAgo) => dateStr(daysAgo);
  const atUTC = (dayIso, hourUTC) => new Date(`${dayIso}T${String(hourUTC).padStart(2, "0")}:00:00Z`);

  // Time-clock punches for the last ~3 weeks: Sam mornings, Alex middays, with
  // one no-show (day 2 — mirrors the no-show incident) plus Sam on the clock now.
  const timeclock = [];
  let tcSeq = 0;
  const punch = (u, dayIso, hourUTC, type, tsOverride) => ({
    id: `seed_tc_${String(++tcSeq).padStart(3, "0")}`,
    userId: u.id, userName: u.name,
    locationId: "seed_loc_main", locationName: "Main Store",
    type, ts: tsOverride || atUTC(dayIso, hourUTC), day: dayIso,
  });
  const TC_DAYS = Math.min(HISTORY, 21);
  for (let d = TC_DAYS; d >= 1; d--) {
    const day = iso(d);
    const dow = new Date(day + "T00:00:00Z").getUTCDay();
    if (dow === 0) continue; // closed Sundays
    timeclock.push(punch(sam, day, 14, "in"));
    timeclock.push(punch(sam, day, 22, "out"));
    if (d !== 2) {
      timeclock.push(punch(alex, day, 16, "in"));
      timeclock.push(punch(alex, day, 23, "out"));
    }
  }
  timeclock.push(punch(sam, iso(0), 0, "in", new Date(now.getTime() - 2 * 3600000))); // on the clock now

  // Rosters for the last three weeks (incl. the current one), so the Schedule
  // tab opens populated and prev-week navigation shows history.
  const schedule = [];
  let schSeq = 0;
  const shift = (u, date, start, end, extra = {}) => ({
    id: `seed_sch_${String(++schSeq).padStart(3, "0")}`,
    userId: u ? u.id : null, userName: u ? u.name : null,
    locationId: "seed_loc_main", locationName: "Main Store",
    date, start, end, by: mgr.name, byId: mgr.id, ts: ts(7), ...extra,
  });
  const thisWeek = weekStartMonday(iso(0));
  for (let w = 2; w >= 0; w--) {
    const ws = addDays(thisWeek, -7 * w);
    const wd = weekDates(ws);
    [0, 1, 2, 3, 4].forEach((i) => schedule.push(shift(sam, wd[i], "09:00", "17:00")));
    [0, 2, 4, 5].forEach((i) => schedule.push(shift(alex, wd[i], "12:00", "20:00")));
    if (w === 0) {
      schedule.push(shift(null, wd[6], "10:00", "18:00", { open: true })); // open shift to grab
      const aFri = schedule.find((s) => s.userId === alex.id && s.date === wd[4]);
      if (aFri) aFri.swapStatus = "offered";
      const aSat = schedule.find((s) => s.userId === alex.id && s.date === wd[5]);
      if (aSat) { aSat.swapStatus = "claimed"; aSat.claimedById = sam.id; aSat.claimedByName = sam.name; }
    }
  }

  const wdNow = weekDates(thisWeek);
  const availability = [
    { id: "seed_avl_1", userId: alex.id, userName: alex.name, date: wdNow[3], ts: ts(5) },
    { id: "seed_avl_2", userId: sam.id, userName: sam.name, date: wdNow[6], ts: ts(4) },
    { id: "seed_avl_3", userId: alex.id, userName: alex.name, date: addDays(wdNow[0], 7), ts: ts(3) },
  ];

  const templates = [
    {
      id: "seed_tpl_standard", name: "Standard week",
      shifts: schedule.filter((s) => s.userId && s.date >= thisWeek).map((s) => ({
        dow: wdNow.indexOf(s.date), userId: s.userId, userName: s.userName,
        start: s.start, end: s.end, locationId: s.locationId, locationName: s.locationName,
      })).filter((t) => t.dow >= 0),
      by: mgr.name, byId: mgr.id, ts: ts(10),
    },
    {
      id: "seed_tpl_holiday", name: "Holiday (short staff)",
      shifts: [
        { dow: 0, userId: sam.id, userName: sam.name, start: "10:00", end: "16:00", locationId: "seed_loc_main", locationName: "Main Store" },
        { dow: 3, userId: alex.id, userName: alex.name, start: "10:00", end: "16:00", locationId: "seed_loc_main", locationName: "Main Store" },
      ],
      by: mgr.name, byId: mgr.id, ts: ts(12),
    },
  ];

  // The last three weeks were published (doc id is the week start, per the API).
  const schedulePublished = [0, 1, 2].map((w) => {
    const ws = addDays(thisWeek, -7 * w);
    return { id: ws, weekStart: ws, weekEnd: addDays(ws, 6), publishedAt: ts(1 + 7 * w), publishedBy: mgr.name, notified: 2, recipients: 2 };
  });

  return {
    staff, locations, drawers: drawerDocs, items, entries, comments, notes, incidents,
    timeclock, schedule, availability, templates, schedulePublished,
  };
}

// Collections whose top-level docs carry a `seed` flag, for tagging + clearing.
// "packs" is retired from seeding but stays so Clear removes legacy demo packs.
export const SEED_COLLECTIONS = [
  "locations", "drawers", "items", "packs", "entries", "notes", "incidents", "users",
  "timeclock", "schedule", "availability", "templates", "schedulePublished",
];
