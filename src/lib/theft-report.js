// Theft & loss report — one pure pass that gathers EVERY theft signal the
// product already computes into a single ranged, printable answer to "what
// walked out of my store, and who signed for it?":
//
//   1. FLAGGED CASH COUNTS  — signed cash counts whose over/short crossed the
//      owner's threshold (keyed off the rules-enforced varianceStatus).
//   2. FLAGGED BACKROOM COUNTS — inventory counts past the owner's unit
//      threshold, same signal.
//   3. SCRATCH TICKET GAPS  — chain breaks and sold-out-shorts from the pack
//      flow (buildPackFlow), each named to its signers.
//   4. REWARDS ALERTS       — the rewards-abuse detectors (outpaced sales,
//      multi-earn, redemption bursts) over the same window.
//
// Pure and clock-injectable, like every audit lib here.

import { toDate } from "./utils.js";
import { buildPackFlow } from "./scratch-report.js";
import { buildRewardAudit } from "./reward-audit.js";

const dayOf = (e) => e.date || (toDate(e.ts)?.toISOString().slice(0, 10)) || null;

// A cash/inventory count "crossed the owner's threshold" iff the rules forced
// it into a flagged variance. firestore.rules pins `varianceStatus` — an
// at/over-threshold |diff| MUST be signed varianceStatus:'open' (flagOk) — but
// it does NOT constrain the client `flagged` boolean. Trusting `flagged` let a
// hand-crafted write set flagged:false on a genuine over-threshold short and
// vanish from this report and its shortage totals. Key off the enforced
// varianceStatus instead; OR the legacy `flagged` so pre-varianceStatus entries
// (and imports) still count. 'resolved' stays in — a short with a signed cause
// still walked out; it's explained, not erased.
const FLAGGED_VARIANCE = new Set(["open", "under-review", "resolved"]);
const wasFlagged = (e) => e.flagged === true || FLAGGED_VARIANCE.has(e.varianceStatus);

/**
 * @param {Array} entries       count entries (any kinds)
 * @param {Array} rewardEvents  rewards ledger lines for the same period
 * @param {Object} opts         { from, to (business dates, inclusive), rewardRules }
 * @returns {{ flaggedCash, cashShort, flaggedInventory, invShortUnits,
 *             packGaps, packGapTickets, packGapDollars, rewardAlerts, totals }}
 */
export function buildTheftReport(entries = [], rewardEvents = [], { from = "", to = "", rewardRules } = {}) {
  const inWin = (e) => { const d = dayOf(e); return d && (!from || d >= from) && (!to || d <= to); };
  const ranged = entries.filter((e) => e && inWin(e));

  const flaggedCash = ranged
    .filter((e) => e.kind === "cash" && wasFlagged(e))
    .map((e) => ({
      date: e.date || dayOf(e), locationName: e.locationName || "", drawerName: e.drawerName || "",
      by: e.by || "—", expected: Number(e.expected) || 0, counted: Number(e.counted) || 0,
      diff: Number(e.diff) || 0, verifiedBy: e.verifiedBy || null,
    }))
    .sort((a, b) => a.diff - b.diff); // worst shortage first
  const cashShort = Math.round(flaggedCash.reduce((s, e) => s + (e.diff < 0 ? -e.diff : 0), 0) * 100) / 100;

  const flaggedInventory = ranged
    .filter((e) => e.kind === "inventory" && wasFlagged(e))
    .map((e) => ({
      date: e.date || dayOf(e), locationName: e.locationName || "", itemName: e.itemName || "",
      unit: e.unit || "unit", by: e.by || "—",
      expected: Number(e.expected) || 0, counted: Number(e.counted) || 0, diff: Number(e.diff) || 0,
    }))
    .sort((a, b) => a.diff - b.diff);
  const invShortUnits = flaggedInventory.reduce((s, e) => s + (e.diff < 0 ? -e.diff : 0), 0);

  const flow = buildPackFlow(ranged, { from, to });
  const packGaps = flow.rows.filter((r) => r.gapTickets > 0);

  // The rewards detectors window backwards from `now` — anchor it to the end
  // of the requested range so a historical range audits ITS period.
  const days = from && to
    ? Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1)
    : 14;
  const anchor = to ? new Date(`${to}T23:59:59`) : new Date();
  const rewardAlerts = buildRewardAudit(rewardEvents, ranged, { rules: rewardRules, windowDays: days, now: anchor }).alerts;

  const totals = {
    flags: flaggedCash.length + flaggedInventory.length + packGaps.length + rewardAlerts.length,
    cashShort, invShortUnits,
    packGapTickets: flow.totals.gapTickets, packGapDollars: flow.totals.gapDollars,
    rewardAlerts: rewardAlerts.length,
  };
  return {
    flaggedCash, cashShort, flaggedInventory, invShortUnits,
    packGaps, packGapTickets: flow.totals.gapTickets, packGapDollars: flow.totals.gapDollars,
    rewardAlerts, totals, from, to,
  };
}
