// Gaming / amusement-machine revenue ledger — pure math + aggregation.
//
// A store hosts machines owned by outside companies (a slot, a countertop
// "tall" cabinet, an ATM, …). On each collection day the attending staff records
// that machine's TOTAL COLLECTION and TOTAL PAYOUT for the period; the store and
// the machine's company then split the REMAINDER (collection − payout) per that
// machine's contract (50/50, 60/40, …). The store's share FLOORS AT $0 — if a
// machine paid out more than it took in, the store gains nothing (that loss is
// the company's), never a negative.
//
// Trust: the split is computed HERE and recomputed server-side in /api/gaming —
// never trusted from the client. Staff enter raw collection + payout only; the
// computed split, the totals, and the reports are owner-only (firestore.rules).

export const MACHINE_TYPES = ["slot", "amusement", "atm", "other"];
export const CADENCES = ["weekly", "biweekly", "monthly"];
export const DEFAULT_STORE_PCT = 50;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const clampPct = (v) => {
  const n = num(v);
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
};

// One machine's split of a single collection. All money in dollars.
//   net = collection − payout
//   storeShare = net > 0 ? net × store% : 0   (never negative — store floors at $0)
//   companyShare = net − storeShare           (net > 0: the remainder; net ≤ 0: the loss)
export function computeSplit(collection, payout, storePct = DEFAULT_STORE_PCT) {
  const c = round2(collection);
  const p = round2(payout);
  const net = round2(c - p);
  const pct = clampPct(storePct);
  const storeShare = net > 0 ? round2((net * pct) / 100) : 0;
  const companyShare = round2(net - storeShare);
  return { collection: c, payout: p, net, storePct: pct, storeShare, companyShare };
}

// Normalize an owner-entered machine registry row (the Admin form + a server
// re-check share this). Returns { ok, value } or { ok:false, code }.
//   value: { name, company, type, storePct, cadence }
export function normalizeMachine(input = {}) {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, code: "name_missing" };
  const company = String(input.company ?? "").trim();
  if (!company) return { ok: false, code: "company_missing" };

  const type = MACHINE_TYPES.includes(input.type) ? input.type : "other";
  const cadence = CADENCES.includes(input.cadence) ? input.cadence : "weekly";

  const pctRaw = String(input.storePct ?? "").trim();
  if (pctRaw === "") return { ok: false, code: "pct_missing" };
  const pct = Number(pctRaw);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { ok: false, code: "pct_invalid" };

  return { ok: true, value: { name: name.slice(0, 80), company: company.slice(0, 80), type, storePct: pct, cadence } };
}

// A collection's business day is inside [from, to] (inclusive). YYYY-MM-DD string
// compare — an unset bound doesn't constrain that side.
function within(dateStr, from, to) {
  const d = String(dateStr ?? "");
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

const zero = () => ({ collection: 0, payout: 0, net: 0, storeShare: 0, companyShare: 0, count: 0 });
function accumulate(acc, c) {
  acc.collection = round2(acc.collection + num(c.collection));
  acc.payout = round2(acc.payout + num(c.payout));
  acc.net = round2(acc.net + num(c.net));
  acc.storeShare = round2(acc.storeShare + num(c.storeShare));
  acc.companyShare = round2(acc.companyShare + num(c.companyShare));
  acc.count += 1;
}

// Owner oversight: roll a set of collection lines up into grand totals, a
// per-machine breakdown, a per-company breakdown, and a per-date series (for a
// store-take-over-time chart). `from`/`to` scope by collectionDate (inclusive).
export function buildGamingSummary(collections = [], { from, to } = {}) {
  const inRange = (collections || []).filter((c) => within(c.collectionDate, from, to));

  const totals = zero();
  const byMachine = new Map();
  const byCompany = new Map();
  const byDate = new Map();

  for (const c of inRange) {
    accumulate(totals, c);

    const mKey = c.machineId || `${c.machineName || "?"}`;
    if (!byMachine.has(mKey))
      byMachine.set(mKey, { machineId: c.machineId || null, machineName: c.machineName || "", company: c.company || "", ...zero() });
    accumulate(byMachine.get(mKey), c);

    const coKey = c.company || "—";
    if (!byCompany.has(coKey)) byCompany.set(coKey, { company: coKey, ...zero() });
    accumulate(byCompany.get(coKey), c);

    const dKey = String(c.collectionDate || "");
    if (!byDate.has(dKey)) byDate.set(dKey, { date: dKey, ...zero() });
    accumulate(byDate.get(dKey), c);
  }

  const byTake = (a, b) => b.storeShare - a.storeShare;
  return {
    totals,
    machines: [...byMachine.values()].sort(byTake),
    companies: [...byCompany.values()].sort(byTake),
    series: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    count: inRange.length,
  };
}
