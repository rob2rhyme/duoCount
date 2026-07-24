// Pure classifier for the manager-countersign deterrence lever. It names the
// SPECIFIC unverified scratch counts worth a second signature — the reads an
// insider would want to log alone — so the existing verifiedBy countersign
// (a DIFFERENT manager stamps the entry) can target them. Nothing is persisted;
// like the gaps it consumes, it is derived from the signed count trail.
//
// TRIGGERS (a count is flagged only for one of these genuinely anomalous reads):
//   • gap-open      — the open count that sits ABOVE the previous close (tickets
//                     unaccounted between two counts); the NEXT/open read is the
//                     accountable one, not the honest prior close.
//   • sellout-short — a finaled book closed BELOW its pack size (the skim).
// ESCALATORS (sharpen an already-flagged read to high; never create a flag):
//   • mass-jump     — the open is one of a batch that jumped in one window.
//   • off-shift     — the count was signed while the store was unmanned.
// Off-shift is deliberately NOT a trigger: a scratch count is STRUCTURALLY a
// shift-boundary count (an owner opening before the first clerk punches in reads
// as off-shift), so a lone off-hours count that agrees with the trail is normal.

import { buildPackAudit, clusterPackJumps, offShiftCounts } from "./scratch-audit.js";

const RECENT_DAYS = 14;

/**
 * @param {Array} entries  count entries (carry .id, .verifiedBy)
 * @param {Array} punches  time-clock punches (for the off-shift escalator)
 * @param {Object} opts     { now, windowDays }
 * @returns {Map<entryId,{reasons:string[],severity:'high'|'medium'}>} — unverified
 *   scratch counts only. severity 'high' when an escalator applies, else 'medium'.
 */
export function classifyHighRiskScratch(entries = [], punches = [], { now = new Date(), windowDays = RECENT_DAYS } = {}) {
  const cut = new Date(now.getTime() - windowDays * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const recent = entries.filter((e) => e && e.kind === "scratch" && (e.date || "") >= cut);
  const byId = new Map();
  for (const e of entries) if (e && e.id != null) byId.set(e.id, e);

  const audit = buildPackAudit(recent, { days: windowDays, now });
  const clusterIds = new Set(clusterPackJumps(audit.gaps).flatMap((c) => c.ids || []));
  const offShiftIds = new Set(offShiftCounts(recent, punches).flatMap((o) => o.ids || []));

  const reasons = new Map(); // entryId -> Set(reason)
  const add = (id, r) => { if (id == null) return; if (!reasons.has(id)) reasons.set(id, new Set()); reasons.get(id).add(r); };

  for (const g of audit.gaps) {
    for (const ev of g.events || []) {
      if (!(ev.missing > 0)) continue;
      if (ev.selloutShort) add(ev.lastId, "sellout-short");
      else add(ev.nextId, "gap-open");
    }
  }
  for (const id of clusterIds) if (reasons.has(id)) reasons.get(id).add("mass-jump");
  for (const id of offShiftIds) if (reasons.has(id)) reasons.get(id).add("off-shift");

  const out = new Map();
  for (const [id, rs] of reasons) {
    const e = byId.get(id);
    if (!e || e.kind !== "scratch" || e.verifiedBy) continue; // only unsigned scratch reads
    const high = rs.has("off-shift") || rs.has("mass-jump");
    out.set(id, { reasons: [...rs].sort(), severity: high ? "high" : "medium" });
  }
  return out;
}

// Convenience for the UI: just the set of flagged entry ids.
export function highRiskScratchIds(entries, punches, opts) {
  return new Set(classifyHighRiskScratch(entries, punches, opts).keys());
}
