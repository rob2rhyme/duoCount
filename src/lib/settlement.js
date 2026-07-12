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

// Parse a currency-ish cell. A blank cell is 0, but a non-empty cell we can't
// read returns null (not 0) so the caller can surface it instead of silently
// reconciling a real figure to zero (a mis-mapped column, an odd export format).
// Accounting negatives "(123.45)" and a trailing-minus "123.45-" — both common
// in state-lottery / accounting exports for credits — normalize to a leading minus.
const cleanNum = (v) => {
  let s = String(v ?? "").trim();
  if (s === "") return 0;
  s = s.replace(/[$,\s]/g, "");
  if (/^\(.+\)$/.test(s)) s = "-" + s.slice(1, -1);      // (123.45) -> -123.45
  else if (/^.+-$/.test(s)) s = "-" + s.slice(0, -1);     // 123.45-  -> -123.45
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const key = (v) => String(v ?? "").trim();
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Reconcile mapped file rows [{ packNumber, amount }] against recorded packs.
 * `basis`: "dollars" (sold × price) or "tickets" (sold count). Returns matched /
 * discrepancies / unknown / missing / unparsed / onFileNotYetSettled lists and totals.
 */
export function reconcileSettlement(packs = [], rows = [], { basis = "dollars", tolerance = 0.005 } = {}) {
  const recordedOf = (p) =>
    basis === "tickets" ? (Number(p.soldAtSettle) || 0) : round2((Number(p.soldAtSettle) || 0) * (Number(p.price) || 0));

  const byNum = new Map();
  for (const p of packs) if (key(p.packNumber)) byNum.set(key(p.packNumber), p);

  const matched = [], discrepancies = [], unknown = [], unparsed = [], onFileNotYetSettled = [];
  const duplicates = [], onFileButReturned = [];
  const seen = new Set();
  let fileTotal = 0;
  for (const r of rows) {
    const k = key(r.packNumber);
    const isDup = !!k && seen.has(k); // this pack number already appeared earlier in the file
    if (k) seen.add(k); // a pack that appears in the file isn't "missing", even if its amount is unreadable
    const amt = cleanNum(r.amount);
    if (amt === null) {
      if (k) unparsed.push({ packNumber: r.packNumber, raw: String(r.amount ?? "").trim() });
      continue;
    }
    fileTotal += amt;
    if (!k) continue; // amount-only row: counted in the file total, nothing to reconcile
    const fileAmount = round2(amt);
    // A pack number listed twice in the file would be reconciled twice, double-
    // counting the recorded side. Flag the repeat and don't re-reconcile it (its
    // amount still counts in the file total — that's what the file literally sums to).
    if (isDup) { duplicates.push({ packNumber: r.packNumber, fileAmount }); continue; }
    const p = byNum.get(k);
    if (!p) { unknown.push({ packNumber: r.packNumber, fileAmount }); continue; }
    // The store returned this pack — the lottery shouldn't be billing it at all.
    // Flag it distinctly from a pack that simply hasn't been settled yet.
    if (p.status === "returned") {
      onFileButReturned.push({ packNumber: r.packNumber, game: p.game || "", fileAmount });
      continue;
    }
    // A received/active pack the store hasn't settled yet has no recorded figure
    // (soldAtSettle is null); comparing it against 0 would report a phantom
    // full-amount discrepancy, so bucket it separately (mirrors `missing`).
    if (p.soldAtSettle == null) {
      onFileNotYetSettled.push({ packNumber: r.packNumber, game: p.game || "", fileAmount });
      continue;
    }
    const recorded = round2(recordedOf(p));
    const delta = round2(fileAmount - recorded);
    const item = { packNumber: r.packNumber, game: p.game || "", fileAmount, recorded, delta };
    (Math.abs(delta) > tolerance ? discrepancies : matched).push(item);
  }

  // settled packs (have a settle count) the file never billed
  const missing = packs
    .filter((p) => key(p.packNumber) && !seen.has(key(p.packNumber)) && p.soldAtSettle != null && p.status !== "returned")
    .map((p) => ({ packNumber: p.packNumber, game: p.game || "", recorded: round2(recordedOf(p)) }));

  const compared = [...matched, ...discrepancies];
  return {
    matched, discrepancies, unknown, missing, unparsed, onFileNotYetSettled,
    duplicates, onFileButReturned,
    totals: {
      file: round2(fileTotal),
      recorded: round2(compared.reduce((s, m) => s + m.recorded, 0)),
      delta: round2(discrepancies.reduce((s, m) => s + m.delta, 0)),
    },
  };
}
