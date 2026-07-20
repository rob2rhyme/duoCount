// Developer/subscriber billing — pure normalize + roll-up. The platform admin
// tracks each store's plan MANUALLY in the /dev console: which plan, the billing
// status, monthly vs annual, and the price. This is a records layer only — NO
// card data, no charge is ever run here (PCI stays out of scope; a card
// processor, if it ever comes, is a separate integration). Enabling/disabling a
// store's actual service is the existing suspend/activate switch, kept separate
// from the billing status so a dev can mark "past due" without cutting access.
//
// Stored dev-only at billing/{vendorId} (a top-level collection with no rules
// match → default-deny for every client; only the Admin SDK reaches it).

export const BILLING_PLANS = ["free", "starter", "pro", "enterprise"];
export const BILLING_STATUSES = ["trial", "active", "past_due", "canceled"];
export const BILLING_CYCLES = ["monthly", "annual"];
export const DEFAULT_BILLING = { plan: "free", status: "trial", cycle: "monthly", price: 0, note: null };

const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

// Coerce a dev-entered billing record into the stored shape. Unknown enum values
// fall back to a safe default; price is a non-negative number (a leading $ is ok).
export function normalizeBilling(input = {}) {
  const plan = BILLING_PLANS.includes(input.plan) ? input.plan : "free";
  const status = BILLING_STATUSES.includes(input.status) ? input.status : "trial";
  const cycle = BILLING_CYCLES.includes(input.cycle) ? input.cycle : "monthly";
  const raw = String(input.price ?? "").trim().replace(/^\$/, "");
  const n = Number(raw);
  const price = Number.isFinite(n) && n >= 0 ? round2(n) : 0;
  const note = String(input.note ?? "").trim().slice(0, 300) || null;
  return { plan, status, cycle, price, note };
}

// A subscription's monthly-normalized value — annual price spread over 12. Only
// an ACTIVE subscription contributes to MRR (a trial isn't paying yet; past_due
// and canceled aren't collecting), so those return 0.
export function monthlyValue(billing) {
  if (!billing || billing.status !== "active") return 0;
  const price = Number(billing.price) || 0;
  if (price <= 0) return 0;
  return round2(billing.cycle === "annual" ? price / 12 : price);
}

// Roll a list of stores (each optionally carrying `billing`) up into the dev
// overview: how many stores in each billing status, and the total MRR.
export function buildBillingSummary(stores = []) {
  const byStatus = { trial: 0, active: 0, past_due: 0, canceled: 0, none: 0 };
  let mrr = 0;
  for (const s of stores) {
    const b = s?.billing;
    if (!b || !BILLING_STATUSES.includes(b.status)) { byStatus.none += 1; continue; }
    byStatus[b.status] += 1;
    mrr += monthlyValue(b);
  }
  return { total: stores.length, byStatus, mrr: round2(mrr) };
}
