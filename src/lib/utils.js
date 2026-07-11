export function money(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export function exportCSV(entries) {
  const head = ["Type","Date","Shift","By","Role","Detail1","Detail2","Expected/Price","Counted/Sold","OverShort/Dollars","VerifiedBy","Timestamp"];
  const lines = [head.join(",")];
  entries.slice().reverse().forEach((e) => {
    const t = toDate(e.ts);
    let r;
    if (e.kind === "cash")
      r = ["Cash", e.date, e.shift, e.by, e.byRole, e.reg, "", (e.expected||0).toFixed(2), (e.counted||0).toFixed(2), (e.diff||0).toFixed(2), e.verifiedBy||"", t?t.toISOString():""];
    else if (e.kind === "inventory")
      r = ["Inventory", e.date, e.shift, e.by, e.byRole, e.itemName, e.unit||"unit", e.expected||0, e.counted||0, e.diff||0, e.verifiedBy||"", t?t.toISOString():""];
    else
      r = ["Scratch", e.date, e.shift, e.by, e.byRole, e.game, "pack "+(e.pack||""), (e.price||0).toFixed(2), e.sold, (e.dollars||0).toFixed(2), e.verifiedBy||"", t?t.toISOString():""];
    lines.push(r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "duocount-log.csv";
  a.click();
}
