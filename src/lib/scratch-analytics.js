// Pure aggregation engine behind the two scratch-off report surfaces — the
// staff in-tab "history" (per staff, per shift) and the owner "combined report".
// Deriving everything here (not in the components) keeps the two views' numbers
// in lockstep and makes the math unit-testable (the components aren't). Clock-
// free: it groups on the business-date STRING (YYYY-MM-DD) like every other
// report builder, and reuses buildPackFlow for the theft-gap totals.

import { csvCell } from "./utils.js";
import { buildPackFlow } from "./scratch-report.js";
import { buildShiftLog } from "./scratch-shift-log.js";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Filter to scratch entries inside an optional business-date window / location /
// staff. `from`/`to` are inclusive ISO date strings; blank means "no bound".
export function filterScratch(entries = [], { from = "", to = "", locationId = "", staffId = "" } = {}) {
  return entries.filter((e) => {
    if (!e || e.kind !== "scratch") return false;
    const d = e.date || "";
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (locationId && (e.locationId || "") !== locationId) return false;
    if (staffId && (e.byId || "") !== staffId) return false;
    return true;
  });
}

const blank = () => ({ counts: 0, tickets: 0, dollars: 0, soldOut: 0, packs: new Set() });
const fold = (acc, e) => {
  acc.counts += 1;
  acc.tickets += num(e.sold);
  acc.dollars += num(e.dollars);
  if (e.soldOut === true) acc.soldOut += 1;
  if (e.pack) acc.packs.add(String(e.pack));
  return acc;
};
const seal = (a) => ({ counts: a.counts, tickets: a.tickets, dollars: round2(a.dollars), soldOut: a.soldOut, packs: a.packs.size });
const shiftOf = (e) => (e.shift === "close" ? "close" : "open");

// The full analytics bundle both report surfaces render. `opts`: { from, to,
// locationId, staffId }. staffId scopes the staff-facing aggregates to one clerk;
// the theft-gap pack-flow always uses the un-staff-scoped set so a pack counted
// by two people still chains correctly.
export function buildScratchAnalytics(entries = [], opts = {}) {
  const rows = filterScratch(entries, opts);
  const totals = seal(rows.reduce(fold, blank()));

  const staffMap = new Map();
  for (const e of rows) {
    const id = e.byId || e.by || "?";
    if (!staffMap.has(id)) staffMap.set(id, { byId: e.byId || "", by: e.by || "—", byRole: e.byRole || "", acc: blank() });
    fold(staffMap.get(id).acc, e);
  }
  const byStaff = [...staffMap.values()]
    .map((s) => ({ byId: s.byId, by: s.by, byRole: s.byRole, ...seal(s.acc) }))
    .sort((a, b) => b.dollars - a.dollars || a.by.localeCompare(b.by));

  const shiftAcc = { open: blank(), close: blank() };
  for (const e of rows) fold(shiftAcc[shiftOf(e)], e);
  const byShift = { open: seal(shiftAcc.open), close: seal(shiftAcc.close) };

  const dayMap = new Map();
  for (const e of rows) {
    const d = e.date || "";
    if (!dayMap.has(d)) dayMap.set(d, { date: d, all: blank(), open: blank(), close: blank() });
    const rec = dayMap.get(d);
    fold(rec.all, e);
    fold(rec[shiftOf(e)], e);
  }
  const byDay = [...dayMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ date: r.date, tickets: r.all.tickets, dollars: round2(r.all.dollars),
      openDollars: round2(r.open.dollars), closeDollars: round2(r.close.dollars) }));

  const gameMap = new Map();
  for (const e of rows) {
    const key = e.game || e.pack || "?";
    if (!gameMap.has(key)) gameMap.set(key, { game: e.game || "—", price: num(e.price), acc: blank() });
    fold(gameMap.get(key).acc, e);
  }
  const byGame = [...gameMap.values()]
    .map((g) => ({ game: g.game, price: g.price, ...seal(g.acc) }))
    .sort((a, b) => b.dollars - a.dollars || a.game.localeCompare(b.game));

  const ssMap = new Map();
  for (const e of rows) {
    const sid = e.byId || e.by || "?";
    const key = `${sid}|${shiftOf(e)}`;
    if (!ssMap.has(key)) ssMap.set(key, { byId: e.byId || "", by: e.by || "—", shift: shiftOf(e), acc: blank() });
    fold(ssMap.get(key).acc, e);
  }
  const byStaffShift = [...ssMap.values()]
    .map((s) => ({ byId: s.byId, by: s.by, shift: s.shift, ...seal(s.acc) }))
    .sort((a, b) => a.by.localeCompare(b.by) || a.shift.localeCompare(b.shift));

  // Theft gaps: pack continuity needs the whole location's counts, so strip only
  // the date/location bound (never the staff bound) before flowing the packs.
  const flowRows = opts.staffId
    ? filterScratch(entries, { from: opts.from, to: opts.to, locationId: opts.locationId })
    : rows;
  const packFlow = buildPackFlow(flowRows, { from: opts.from || "", to: opts.to || "", locationId: opts.locationId || "" });
  // The per-shift ticket log rides on the SAME un-staff-scoped set as packFlow:
  // a pack opened by one clerk and closed by another must still pair into one
  // row. (Only the owner report renders it — the staff History view passes a
  // shift-filtered array, which would make every row one-sided.)
  const shiftLog = buildShiftLog(flowRows, {
    from: opts.from || "", to: opts.to || "", locationId: opts.locationId || "",
    staffId: opts.staffId || "", policy: opts.shiftPolicy || "both",
  });

  return {
    totals: { ...totals, gapTickets: packFlow.totals.gapTickets, gapDollars: packFlow.totals.gapDollars },
    byStaff, byShift, byDay, byGame, byStaffShift, packFlow, shiftLog,
  };
}

// Local wall-clock HH:MM of a scan — the shift-boundary time an owner reads on
// the sheet. Null-safe (an un-echoed optimistic write has no ts yet).
const hhmm = (d) => (d instanceof Date && !Number.isNaN(d.getTime())
  ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "");

// ---- CSV exports (English headers, matching entriesToCSV / the journal CSV) ----
const row = (cells) => cells.map(csvCell).join(",");

// Staff history export: one row per staff × shift.
export function buildScratchStaffCSV(analytics, { rangeLabel = "", shiftLog = null } = {}) {
  const lines = [];
  if (rangeLabel) lines.push(row([`Scratch-off staff report — ${rangeLabel}`]));
  lines.push(row(["Staff", "Role", "Shift", "Counts", "Tickets sold", "Sales $", "Packs", "Sold out"]));
  for (const s of analytics.byStaffShift)
    lines.push(row([s.by, s.byRole || "", s.shift === "close" ? "Closing" : "Opening", s.counts, s.tickets, s.dollars.toFixed(2), s.packs, s.soldOut]));
  lines.push(row(["Total", "", "", analytics.totals.counts, analytics.totals.tickets, analytics.totals.dollars.toFixed(2), analytics.totals.packs, analytics.totals.soldOut]));
  // The same per-shift ticket log the owner report carries, scoped to whoever is
  // reading it (a clerk gets the shifts they signed; a manager gets everyone's).
  appendShiftLogCSV(lines, shiftLog);
  return lines.join("\n");
}

// The shift log as its own CSV section — one line per pack per day with both
// readings, the scan times and the signers. Shared by the owner and staff
// exports so the two files never drift.
function appendShiftLogCSV(lines, log) {
  if (!log || !log.rows.length) return;
  lines.push("");
  lines.push(row(["Shift log", "Location", "Game", "Game #", "Book #", "Pack id",
    "Opening #", "Opened at", "Opened by", "Closing #", "Closed at", "Closed by",
    "Carried in", "Sold this shift", "Price", "Sales $", "Sold out", "Status"]));
  for (const r of log.rows) {
    lines.push(row([r.date, r.locationName || "", r.game, r.gameNo || "", r.bookNo || "", r.pack,
      r.openTicket ?? "", hhmm(r.openTs), r.openBy || "",
      r.closeTicket ?? "", hhmm(r.closeTs), r.closeBy || "",
      r.carriedIn ?? "", r.sold ?? "", Number(r.price || 0).toFixed(2),
      r.dollars != null ? r.dollars.toFixed(2) : "", r.soldOut ? "yes" : "",
      r.incomplete ? `${r.status} (incomplete)` : r.status]));
  }
  lines.push(row(["Total", "", "", "", "", "", "", "", "", "", "", "", "",
    log.totals.sold, "", log.totals.dollars.toFixed(2), "", ""]));
}

// Owner combined export: a summary line, then by-day, by-game and by-staff
// sections separated by blank lines (mirrors the multi-section journal CSV).
export function buildScratchReportCSV(analytics, { rangeLabel = "" } = {}) {
  const t = analytics.totals;
  const lines = [];
  lines.push(row([`Scratch-off report${rangeLabel ? ` — ${rangeLabel}` : ""}`]));
  lines.push(row(["Tickets sold", "Sales $", "Packs", "Sold out", "Gap tickets", "Gap $"]));
  lines.push(row([t.tickets, t.dollars.toFixed(2), t.packs, t.soldOut, t.gapTickets, Number(t.gapDollars || 0).toFixed(2)]));
  lines.push("");
  lines.push(row(["By day", "Tickets", "Sales $", "Opening $", "Closing $"]));
  for (const d of analytics.byDay) lines.push(row([d.date, d.tickets, d.dollars.toFixed(2), d.openDollars.toFixed(2), d.closeDollars.toFixed(2)]));
  lines.push("");
  lines.push(row(["By game", "Price", "Counts", "Tickets", "Sales $"]));
  for (const g of analytics.byGame) lines.push(row([g.game, Number(g.price || 0).toFixed(2), g.counts, g.tickets, g.dollars.toFixed(2)]));
  lines.push("");
  lines.push(row(["By staff", "Role", "Counts", "Tickets", "Sales $", "Sold out"]));
  for (const s of analytics.byStaff) lines.push(row([s.by, s.byRole || "", s.counts, s.tickets, s.dollars.toFixed(2), s.soldOut]));

  // The shift log — one line per pack per day, the opening and closing ticket
  // numbers with the scan times and signers. The raw ledger the sections above
  // aggregate; a spreadsheet can re-derive every figure from it.
  appendShiftLogCSV(lines, analytics.shiftLog);
  return lines.join("\n");
}
