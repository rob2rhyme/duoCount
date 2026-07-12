// State-lottery settlement reconciliation — pure and isomorphic (no Firebase, no
// DOM), so the component runs it on an uploaded file and the tests run it under
// plain node.
//
// State lottery settlement/invoice files have no common format, so rather than
// guess one we parse any CSV and let the manager MAP columns (pack number +
// amount). Reconciliation then matches each file row to a recorded scratch-off
// pack by pack number and compares the file's figure to what the store recorded
// (tickets sold, or gross dollars = sold × price), flagging discrepancies,
// unknown packs (in the file, not in records) and un-billed settled packs.

/** Minimal RFC-4180-ish CSV parser: quoted fields, "" escapes, CRLF/LF. */
export function parseCSV(text) {
  const s = String(text ?? "").replace(/\r\n?/g, "\n");
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== "")); // drop blank lines
}

/** Best-guess column indices for pack number + amount from a header row. */
export function guessColumns(headers = []) {
  const norm = headers.map((h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, ""));
  const find = (cands) => norm.findIndex((h) => h && cands.some((c) => h.includes(c)));
  return {
    packNumber: find(["packnumber", "packno", "booknumber", "book", "pack", "ticketnumber"]),
    amount: find(["netdue", "amountdue", "amount", "settled", "owed", "total", "netsales", "sales", "due"]),
  };
}

const cleanNum = (v) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const key = (v) => String(v ?? "").trim();
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Reconcile mapped file rows [{ packNumber, amount }] against recorded packs.
 * `basis`: "dollars" (sold × price) or "tickets" (sold count). Returns matched /
 * discrepancies / unknown / missing lists and totals.
 */
export function reconcileSettlement(packs = [], rows = [], { basis = "dollars", tolerance = 0.005 } = {}) {
  const recordedOf = (p) =>
    basis === "tickets" ? (Number(p.soldAtSettle) || 0) : round2((Number(p.soldAtSettle) || 0) * (Number(p.price) || 0));

  const byNum = new Map();
  for (const p of packs) if (key(p.packNumber)) byNum.set(key(p.packNumber), p);

  const matched = [], discrepancies = [], unknown = [];
  const seen = new Set();
  for (const r of rows) {
    const k = key(r.packNumber);
    if (!k) continue;
    seen.add(k);
    const fileAmount = round2(cleanNum(r.amount));
    const p = byNum.get(k);
    if (!p) { unknown.push({ packNumber: r.packNumber, fileAmount }); continue; }
    const recorded = round2(recordedOf(p));
    const delta = round2(fileAmount - recorded);
    const item = { packNumber: r.packNumber, game: p.game || "", fileAmount, recorded, delta };
    (Math.abs(delta) > tolerance ? discrepancies : matched).push(item);
  }

  // settled packs (have a settle count) the file never billed
  const missing = packs
    .filter((p) => key(p.packNumber) && !seen.has(key(p.packNumber)) && p.soldAtSettle != null)
    .map((p) => ({ packNumber: p.packNumber, game: p.game || "", recorded: round2(recordedOf(p)) }));

  const compared = [...matched, ...discrepancies];
  return {
    matched, discrepancies, unknown, missing,
    totals: {
      file: round2(rows.reduce((s, r) => s + cleanNum(r.amount), 0)),
      recorded: round2(compared.reduce((s, m) => s + m.recorded, 0)),
      delta: round2(discrepancies.reduce((s, m) => s + m.delta, 0)),
    },
  };
}
