// Accounting-shaped exports — pure and isomorphic (no Firebase, no DOM), same
// posture as report-build.js / entriesToCSV. Reshapes the period DuoCount
// already reconciles into a balanced, double-entry GENERAL JOURNAL a bookkeeper
// imports into QuickBooks (or anything that reads a journal CSV) instead of
// re-keying the day by hand. See docs/accountant-export-spec.md.
//
// Design note (a deliberate delta from the spec's first sketch): the builder
// takes the RAW period entries + range — which ReportModal already holds in
// memory, so still no new fetch — rather than the buildPeriodReport aggregate,
// because a multi-day journal needs per-day×location splits of paid-outs and
// scratch dollars that the aggregate doesn't carry. The tests pin the journal's
// totals to buildPeriodReport, so the two can't drift.
//
// The journal is a DRAFT the bookkeeper reviews and posts — DuoCount stays the
// count-of-record and a lens, never the ledger of record.

import { csvCell } from "./utils.js";

const round2 = (n) => Math.round(n * 100) / 100;
const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const slug = (s) => String(s || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "x";

// v1 account map — baked-in defaults so the export works with zero setup (and
// no vendor write / no rules change). Override per call via opts.accounts.
export const DEFAULT_ACCOUNTS = {
  deposit: "Undeposited Funds",
  paidouts: "Paid-Outs Clearing",
  overShort: "Cash Over/Short",
  sales: "Sales Revenue",
  lottery: "Lottery Sales",
};

export const JOURNAL_HEADER = "JournalNo,JournalDate,AccountName,Debit,Credit,Description,Name,Location,Memo";

// Journal dates default to the US format QuickBooks expects; "iso" keeps
// YYYY-MM-DD for tools that prefer it.
function fmtDate(iso, dateFormat) {
  if (dateFormat === "iso") return iso;
  const [y, m, d] = String(iso).split("-");
  return `${m}/${d}/${y}`;
}

/**
 * Group the period's entries into one balanced journal entry per day×location.
 * Only cash and scratch drive the journal — inventory shrink is units, not
 * dollars, and never journals. Returns entry groups (used by both the CSV and
 * the bookkeeper PDF's journal preview, so paper and file show the same rows):
 *   { journalNo, date, locationName, lines: [{ account, debit, credit, description }] }
 * Every group balances to the cent BY CONSTRUCTION: the deposit line is the
 * computed plug between the other debits and credits (its side flips if the
 * day's paid-outs + shortage exceed its sales — rare, but still balanced).
 */
export function buildJournalEntries(entries = [], range = {}, opts = {}) {
  const { startISO, endISO } = range;
  if (!startISO || !endISO) throw new Error("buildJournalEntries needs { startISO, endISO }");
  if (startISO > endISO) throw new Error(`Range start ${startISO} is after end ${endISO}`);
  const acct = { ...DEFAULT_ACCOUNTS, ...(opts.accounts || {}) };

  // One bucket per day×location, accumulating the four dollar aggregates.
  const groups = new Map();
  for (const e of entries) {
    if (!e || e.date < startISO || e.date > endISO) continue;
    if (e.kind !== "cash" && e.kind !== "scratch") continue;
    const locKey = e.locationId || e.locationName || "—";
    const key = `${e.date}|${locKey}`;
    let g = groups.get(key);
    if (!g) {
      g = { date: e.date, locationName: e.locationName || "—", sales: 0, paidout: 0, netDiff: 0, scratch: 0 };
      groups.set(key, g);
    }
    if (e.kind === "cash") {
      g.sales += num(e.sales);
      g.paidout += num(e.paidout);
      g.netDiff += num(e.diff);
    } else {
      g.scratch += num(e.dollars);
    }
  }

  const out = [];
  for (const g of [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.locationName.localeCompare(b.locationName))) {
    const sales = round2(g.sales);
    const paidout = round2(g.paidout);
    const netDiff = round2(g.netDiff);
    const scratch = round2(g.scratch);
    if (!sales && !paidout && !netDiff && !scratch) continue; // nothing to journal

    const lines = [];
    const short = netDiff < 0 ? round2(-netDiff) : 0; // shortage → Debit
    const over = netDiff > 0 ? netDiff : 0;           // overage  → Credit
    // Plug: cash staged for the bank = credits − the other debits.
    const plug = round2(sales + scratch + over - paidout - short);

    if (plug > 0) lines.push({ account: acct.deposit, debit: plug, credit: null, description: "Cash to deposit" });
    if (paidout > 0) lines.push({ account: acct.paidouts, debit: paidout, credit: null, description: "Paid-outs" });
    if (short > 0) lines.push({ account: acct.overShort, debit: short, credit: null, description: "Cash short" });
    if (sales > 0) lines.push({ account: acct.sales, debit: null, credit: sales, description: "Cash sales" });
    if (scratch > 0) lines.push({ account: acct.lottery, debit: null, credit: scratch, description: "Lottery/scratch sales" });
    if (over > 0) lines.push({ account: acct.overShort, debit: null, credit: over, description: "Cash over" });
    if (plug < 0) lines.push({ account: acct.deposit, debit: null, credit: round2(-plug), description: "Cash shortfall funded" });
    if (!lines.length) continue;

    out.push({
      journalNo: `DC-${g.date}-${slug(g.locationName)}`,
      date: g.date,
      locationName: g.locationName,
      lines,
    });
  }
  return out;
}

/**
 * Balanced general-journal CSV for the period — one entry per day×location,
 * QuickBooks-friendly columns. Amounts are raw .toFixed(2) (never money(): a
 * `$` or thousands separator makes importers reject the file); every field
 * passes through csvCell, so a malicious location name can't smuggle a formula.
 * An empty period yields a header-only file — a valid record.
 */
export function buildJournalCSV(entries = [], range = {}, opts = {}) {
  const lines = [JOURNAL_HEADER];
  for (const entry of buildJournalEntries(entries, range, opts)) {
    const memo = `DuoCount close · ${entry.locationName} · ${entry.date}`;
    for (const l of entry.lines) {
      lines.push([
        entry.journalNo,
        fmtDate(entry.date, opts.dateFormat),
        l.account,
        l.debit != null ? l.debit.toFixed(2) : "",
        l.credit != null ? l.credit.toFixed(2) : "",
        l.description,
        "", // Name (customer/vendor/employee) — blank in v1
        entry.locationName,
        memo,
      ].map(csvCell).join(","));
    }
  }
  return lines.join("\n");
}

/* ---------------------------- franchise scaffold ---------------------------- */

// A franchise profile is an ordered column list + per-column mapper + a date
// format — the MECHANISM for franchisor daily-report layouts. Only a generic,
// brand-neutral profile ships: real 7-Eleven / Circle K schemas are
// proprietary and contract-specific, so per-brand profiles are added only when
// a pilot franchisee provides their actual template ("bring us the spec").
// Each mapper receives one day's aggregates:
//   { date, cashSales, lotterySales, paidout, overShort, kinds:Set, total, verified }
export const FRANCHISE_PROFILES = {
  generic: {
    id: "generic",
    label: "Generic daily report",
    dateFormat: "iso",
    columns: [
      { header: "StoreNo", value: (d, ctx) => ctx.storeNo || "" },
      { header: "BusinessDate", value: (d, ctx) => fmtDate(d.date, ctx.dateFormat) },
      { header: "GrossSales", value: (d) => (d.cashSales + d.lotterySales).toFixed(2) },
      { header: "CashSales", value: (d) => d.cashSales.toFixed(2) },
      { header: "LotterySales", value: (d) => d.lotterySales.toFixed(2) },
      { header: "PaidOuts", value: (d) => d.paidout.toFixed(2) },
      { header: "OverShort", value: (d) => d.overShort.toFixed(2) }, // signed: negative = short
      { header: "DeptCount", value: (d) => String(d.kinds.size) },
      { header: "VerifiedPct", value: (d) => String(d.total ? Math.round((d.verified / d.total) * 100) : 0) },
    ],
  },
};

// One day-bucket of franchise aggregates per business date, over ALL rows the
// caller passes (the Reports modal's location picker already scopes them — a
// franchisee exports with their store selected).
function franchiseDays(entries, range) {
  const { startISO, endISO } = range;
  if (!startISO || !endISO) throw new Error("buildFranchiseCSV needs { startISO, endISO }");
  if (startISO > endISO) throw new Error(`Range start ${startISO} is after end ${endISO}`);
  const days = new Map();
  for (const e of entries) {
    if (!e || e.date < startISO || e.date > endISO) continue;
    let d = days.get(e.date);
    if (!d) {
      d = { date: e.date, cashSales: 0, lotterySales: 0, paidout: 0, overShort: 0, kinds: new Set(), total: 0, verified: 0 };
      days.set(e.date, d);
    }
    d.kinds.add(e.kind);
    d.total += 1;
    if (e.verifiedBy) d.verified += 1;
    if (e.kind === "cash") {
      d.cashSales += num(e.sales);
      d.paidout += num(e.paidout);
      d.overShort += num(e.diff);
    } else if (e.kind === "scratch") {
      d.lotterySales += num(e.dollars);
    }
  }
  return [...days.values()]
    .map((d) => ({ ...d, cashSales: round2(d.cashSales), lotterySales: round2(d.lotterySales), paidout: round2(d.paidout), overShort: round2(d.overShort) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fixed-column franchise daily report — one row per business date, in the
 * profile's exact column order and date format. A SCAFFOLD, not a certified
 * submission (see the spec's honesty flag). Same money/escaping rules as the
 * journal: raw .toFixed(2), every cell through csvCell. Empty period →
 * header-only file.
 * @param {Array} entries  the period rows (already location-scoped by caller).
 * @param {{startISO, endISO}} range
 * @param {object|string} profile  a FRANCHISE_PROFILES entry or its id.
 * @param {{storeNo?: string}} [opts]  profile context (store number).
 */
export function buildFranchiseCSV(entries = [], range = {}, profile = "generic", opts = {}) {
  const p = typeof profile === "string" ? FRANCHISE_PROFILES[profile] : profile;
  if (!p || !Array.isArray(p.columns)) throw new Error(`Unknown franchise profile: ${profile}`);
  const ctx = { storeNo: opts.storeNo || "", dateFormat: p.dateFormat };
  const lines = [p.columns.map((c) => c.header).join(",")];
  for (const day of franchiseDays(entries, range)) {
    lines.push(p.columns.map((c) => csvCell(c.value(day, ctx))).join(","));
  }
  return lines.join("\n");
}
