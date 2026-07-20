export function money(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The one definition of an "unresolved" variance or dispute — a flag raised but
// not yet closed out. The dashboard tiles/attention list, the owner digest, and
// the period report all use this, so all three agree (M3). 'open' = freshly
// raised; 'under-review' = a manager picked it up but hasn't resolved it — both
// still count as unresolved. 'resolved'/'none' do not.
export const UNRESOLVED = ["open", "under-review"];
export const isUnresolved = (status) => UNRESOLVED.includes(status);

// Open-item BACKLOG counts over a set of entries: unresolved variances/disputes
// and unverified counts. This is the M3 agreement in one place — the Dashboard
// tiles, the owner digest, and the period report must all report the same
// backlog, so whoever counts "still open" counts it this way, over the whole
// set they hold (never a one-day slice, or a stale open item silently reads 0).
export function openItemCounts(entries = []) {
  return {
    openVariances: entries.filter((e) => isUnresolved(e?.varianceStatus)).length,
    openDisputes: entries.filter((e) => isUnresolved(e?.disputeStatus)).length,
    unverified: entries.filter((e) => e && !e.verifiedBy).length,
  };
}

export function expectedCash({ shift, start, sales, paidout }) {
  const s = Number(start) || 0, sa = Number(sales) || 0, p = Number(paidout) || 0;
  return shift === "open" ? s : s + sa - p;
}

export function ticketsSold(startno, endno) {
  return Math.max(0, (Number(endno) || 0) - (Number(startno) || 0));
}

// Inventory mirror of the cash formula: what should be on the shelf.
export function expectedStock({ startQty, received, soldQty, removed }) {
  return (Number(startQty) || 0) + (Number(received) || 0)
    - (Number(soldQty) || 0) - (Number(removed) || 0);
}

export function toDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

// Build the CSV text for a set of entries — pure (no DOM), so it is unit-tested
// and shared by the log export and the period-report export. Rows are emitted in
// the order given; callers order them (the log reverses its newest-first stream,
// a report passes its already-chronological rows).
// One CSV cell: quotes it, doubles internal quotes, and guards against formula
// injection — a value a spreadsheet might execute (leading =, +, -, @, tab, or
// CR) is prefixed with an apostrophe so it's read as text. A plain number is
// exempt, so a legitimate negative amount (−1.00) stays a number, not text.
export function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function entriesToCSV(entries = []) {
  const head = ["Type","Date","Shift","By","Role","Detail1","Detail2","Expected/Price","Counted/Sold","OverShort/Dollars","VerifiedBy","Timestamp"];
  const lines = [head.join(",")];
  entries.forEach((e) => {
    const t = toDate(e.ts);
    let r;
    if (e.kind === "cash")
      r = ["Cash", e.date, e.shift, e.by, e.byRole, e.drawerName || e.reg, "", (e.expected||0).toFixed(2), (e.counted||0).toFixed(2), (e.diff||0).toFixed(2), e.verifiedBy||"", t?t.toISOString():""];
    else if (e.kind === "inventory")
      r = ["Inventory", e.date, e.shift, e.by, e.byRole, e.itemName, e.unit||"unit", e.expected||0, e.counted||0, e.diff||0, e.verifiedBy||"", t?t.toISOString():""];
    else
      r = ["Scratch", e.date, e.shift, e.by, e.byRole, e.game, "pack "+(e.pack||""), (e.price||0).toFixed(2), e.sold, (e.dollars||0).toFixed(2), e.verifiedBy||"", t?t.toISOString():""];
    lines.push(r.map(csvCell).join(","));
  });
  return lines.join("\n");
}

// Trigger a browser download of text as a file (DOM side of the CSV export).
export function downloadCSV(text, filename) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// The Log tab's "Export CSV": its entries stream newest-first, so reverse to
// chronological before writing. Reports pass their own rows + filename directly.
export function exportCSV(entries, filename = "duocount-log.csv") {
  downloadCSV(entriesToCSV(entries.slice().reverse()), filename);
}
