// Pattern-detection alerts (tier-two spec §2). Pure and isomorphic: the
// Dashboard runs it in the browser on the already-subscribed entries, the
// digest route runs the same code server-side — no Firebase imports here.
//
// An alert is a signal to start a conversation, not a verdict: a short streak
// can be a sticky drawer as easily as a hand in the till, which is why the
// drawer hot-spot detector exists alongside the person detector.

import { buildPackAudit } from "./scratch-audit.js";
import { renderPattern } from "./pattern-format.js";

// Every alert carries a stable `code` (== kind) + a `params` bag; the prose
// lives in the i18n catalog (pattern.<code>.*). We pre-render the English
// title/detail here so the fixed-English digest and the PII redactor keep
// seeing byte-identical strings, while the Dashboard re-renders from
// code+params in the reader's locale.
function alert(a) {
  const code = a.code || a.kind;
  const { title, detail } = renderPattern({ code, params: a.params }, "en");
  return { ...a, code, title, detail };
}

export const PATTERN_RULES = {
  windowDays: 14,        // trailing window for streak detectors
  minShorts: 3,          // shorts needed to call it a streak
  highShortDollars: 20,  // person streak totaling this much short => high
  staleHours: 48,        // unverified older than this counts as backlog
  minBacklog: 5,         // backlog size that triggers the alert
};

// Escalation detector constants. Kept as module constants rather than per-vendor
// knobs so the Admin "Alert sensitivity" surface stays at the documented five;
// the trend detector reuses the tunable windowDays / highShortDollars for the
// rest of its behavior.
const TREND_FACTOR = 2;      // recent-half shorts must be >= this x the earlier half
const TREND_MIN_RECENT = 2;  // and at least this many recent shorts (not one blip)

// Per-vendor overrides live on the vendor doc as `patternRules`. Owners can tune
// them in Admin; this coerces the stored/entered values into safe bounds so a
// bad number can never disable a detector or explode a query window. Anything
// missing or non-numeric falls back to the default; anything out of range is
// clamped (so "500 days" becomes 90, not the default).
const BOUNDS = {
  windowDays: [1, 90], minShorts: [2, 25], highShortDollars: [1, 100000],
  staleHours: [1, 720], minBacklog: [1, 200],
};
export function resolvePatternRules(raw = {}) {
  const out = {};
  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    const v = raw?.[key];
    // Empty / missing / non-numeric all fall back to the default (so clearing a
    // form field restores the default rather than snapping to the minimum —
    // Number("") and Number(null) are 0, which we don't want here).
    const n = v === "" || v === null || v === undefined ? NaN : Number(v);
    if (!Number.isFinite(n)) { out[key] = PATTERN_RULES[key]; continue; }
    const clamped = Math.min(hi, Math.max(lo, n));
    // dollar field keeps cents; the rest are whole units.
    out[key] = key === "highShortDollars" ? Math.round(clamped * 100) / 100 : Math.round(clamped);
  }
  return out;
}

const money = (n) => {
  const v = Math.round(Math.abs(Number(n) || 0) * 100) / 100;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const coerceDate = (ts) => {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
};
const isoDaysAgo = (days, now) =>
  new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * Scan entries for recurring signals. Returns [{ id, kind, severity, title,
 * detail }] with severity 'high' | 'medium', worst first. Windows use the
 * entry's business `date` (YYYY-MM-DD); entries without one fall back to ts.
 */
export function detectPatterns(entries, { now = new Date(), rules } = {}) {
  const R = resolvePatternRules(rules);
  const cutoff = isoDaysAgo(R.windowDays, now);
  const dateOf = (e) => e.date || coerceDate(e.ts)?.toISOString().slice(0, 10) || "";
  const recent = entries.filter((e) => dateOf(e) >= cutoff);
  const alerts = [];

  // 1. Repeat shorts by one person (cash only).
  const byPerson = {};
  for (const e of recent) {
    if (e.kind !== "cash" || !((e.diff || 0) < -0.005)) continue;
    const k = e.byId || e.by;
    byPerson[k] = byPerson[k] || { key: k, name: e.by, count: 0, total: 0 };
    byPerson[k].count++;
    byPerson[k].total += e.diff || 0;
  }
  for (const p of Object.values(byPerson)) {
    if (p.count < R.minShorts) continue;
    const high = -p.total >= R.highShortDollars;
    alerts.push(alert({
      // id keys off the stable user id (the bucket key), not the display name,
      // so two people who share a name produce two distinct alerts (M6).
      id: `person-shorts:${p.key}`, kind: "person-shorts",
      severity: high ? "high" : "medium",
      params: { name: p.name, count: p.count, windowDays: R.windowDays, total: money(p.total) },
    }));
  }

  // 2. Repeat OVERS by one person (cash). Money that keeps turning up is an
  //    anomaly too — under-ringing, a returned borrow, or just a counting habit
  //    — and it's the same conversation-starter as a short streak.
  const byPersonOver = {};
  for (const e of recent) {
    if (e.kind !== "cash" || !((e.diff || 0) > 0.005)) continue;
    const k = e.byId || e.by;
    byPersonOver[k] = byPersonOver[k] || { key: k, name: e.by, count: 0, total: 0 };
    byPersonOver[k].count++;
    byPersonOver[k].total += e.diff || 0;
  }
  for (const p of Object.values(byPersonOver)) {
    if (p.count < R.minShorts) continue;
    const high = p.total >= R.highShortDollars;
    alerts.push(alert({
      id: `person-overs:${p.key}`, kind: "person-overs",
      severity: high ? "high" : "medium",
      params: { name: p.name, count: p.count, windowDays: R.windowDays, total: money(p.total) },
    }));
  }

  // 3. Drawer hot-spot: same drawer short under different hands points at
  //    process or equipment, not a person.
  const byDrawer = {};
  for (const e of recent) {
    if (e.kind !== "cash" || !((e.diff || 0) < -0.005)) continue;
    const k = e.drawerId || e.drawerName || "(no drawer)";
    byDrawer[k] = byDrawer[k] || { key: k, name: e.drawerName || "(no drawer)", count: 0, total: 0, people: new Set() };
    byDrawer[k].count++;
    byDrawer[k].total += e.diff || 0;
    byDrawer[k].people.add(e.byId || e.by);
  }
  for (const d of Object.values(byDrawer)) {
    if (d.count < R.minShorts || d.people.size < 2) continue;
    alerts.push(alert({
      // Keyed by drawerId, so two drawers named alike don't collide (M6).
      id: `drawer-shorts:${d.key}`, kind: "drawer-shorts", severity: "medium",
      params: { name: d.name, count: d.count, people: d.people.size, total: money(d.total), windowDays: R.windowDays },
    }));
  }

  // 4. Verification backlog: counts nobody is countersigning.
  const staleBefore = now.getTime() - R.staleHours * 3600 * 1000;
  const backlog = entries.filter((e) => {
    if (e.verifiedBy) return false;
    const t = coerceDate(e.ts);
    return t && t.getTime() < staleBefore;
  }).length;
  if (backlog >= R.minBacklog) {
    alerts.push(alert({
      id: "verify-backlog", kind: "verify-backlog", severity: "medium",
      params: { count: backlog, hours: R.staleHours },
    }));
  }

  // 5. Unresolved-variance backlog: counts that were flagged but nobody is
  //    closing out. Distinct from the verify backlog — these are already flagged
  //    for review; leaving them open lets the trail go cold.
  const openVariances = entries.filter((e) => {
    if (e.varianceStatus !== "open") return false;
    const t = coerceDate(e.ts);
    return t && t.getTime() < staleBefore;
  }).length;
  if (openVariances >= R.minBacklog) {
    alerts.push(alert({
      id: "variance-backlog", kind: "variance-backlog", severity: "medium",
      params: { count: openVariances, hours: R.staleHours },
    }));
  }

  // 6. Inventory shrink streak: the same item keeps counting short.
  const byItem = {};
  for (const e of recent) {
    if (e.kind !== "inventory" || !((e.diff || 0) < 0)) continue;
    const k = e.itemId || e.itemName || "(item)";
    byItem[k] = byItem[k] || { key: k, name: e.itemName || "(item)", count: 0, units: 0, unit: e.unit || "unit" };
    byItem[k].count++;
    byItem[k].units += -(e.diff || 0);
  }
  for (const it of Object.values(byItem)) {
    if (it.count < R.minShorts) continue;
    alerts.push(alert({
      // Keyed by itemId, so two items named alike don't collide (M6).
      id: `item-shrink:${it.key}`, kind: "item-shrink", severity: "medium",
      params: { name: it.name, count: it.count, windowDays: R.windowDays, units: it.units, unit: `${it.unit}${it.units === 1 ? "" : "s"}` },
    }));
  }

  // 7. Escalating short trend (person): shorts present in BOTH halves of the
  //    window AND materially larger in the recent half — a problem getting worse,
  //    not just present. Distinct from #1, which flags a fresh streak; this only
  //    fires when there were shorts earlier too and the gap is widening, so a new
  //    streak (nothing earlier) stays a #1 signal and doesn't double-report here.
  const midCut = isoDaysAgo(Math.ceil(R.windowDays / 2), now);
  const byTrend = {};
  for (const e of recent) {
    if (e.kind !== "cash" || !((e.diff || 0) < -0.005)) continue;
    const k = e.byId || e.by;
    byTrend[k] = byTrend[k] || { key: k, name: e.by, earlier: 0, recentTotal: 0, recentCount: 0 };
    if (dateOf(e) >= midCut) { byTrend[k].recentTotal += e.diff || 0; byTrend[k].recentCount++; }
    else byTrend[k].earlier += e.diff || 0;
  }
  for (const p of Object.values(byTrend)) {
    const earlierMag = -p.earlier, recentMag = -p.recentTotal;
    if (earlierMag < 0.005 || recentMag < 0.005) continue;   // need shorts in both halves
    if (p.recentCount < TREND_MIN_RECENT) continue;           // not a single recent blip
    if (recentMag < TREND_FACTOR * earlierMag) continue;      // must be materially worse
    alerts.push(alert({
      id: `person-trend:${p.key}`, kind: "person-trend",
      severity: recentMag >= R.highShortDollars ? "high" : "medium",
      params: { name: p.name, recent: money(p.recentTotal), earlier: money(p.earlier) },
    }));
  }

  // 8. Pack continuity gaps: between two consecutive counts of the same scratch
  //    pack, ticket numbers went unaccounted — the next count opened above the
  //    number the previous count closed at. This replaced the settlement-based
  //    detector when the pack lifecycle was retired (settlement is the
  //    lottery's job; the shift boundary is ours). Every gapped pack alerts —
  //    a gap is a conversation between the two signers — and dollars decide
  //    severity. The full who/when detail lives in the Dashboard pack audit.
  for (const g of buildPackAudit(entries, { days: R.windowDays, now }).gaps) {
    if (g.totalMissing <= 0) continue; // pure rollbacks show in the audit card, not as alerts
    alerts.push(alert({
      id: `pack-gap:${g.key}`, kind: "pack-gap",
      severity: g.missingDollars >= R.highShortDollars ? "high" : "medium",
      params: { game: g.game, pack: g.pack, tickets: g.totalMissing, dollars: money(g.missingDollars), boundaries: g.events.length, windowDays: R.windowDays },
    }));
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
