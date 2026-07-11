// Pattern-detection alerts (tier-two spec §2). Pure and isomorphic: the
// Dashboard runs it in the browser on the already-subscribed entries, the
// digest route runs the same code server-side — no Firebase imports here.
//
// An alert is a signal to start a conversation, not a verdict: a short streak
// can be a sticky drawer as easily as a hand in the till, which is why the
// drawer hot-spot detector exists alongside the person detector.

export const PATTERN_RULES = {
  windowDays: 14,        // trailing window for streak detectors
  minShorts: 3,          // shorts needed to call it a streak
  highShortDollars: 20,  // person streak totaling this much short => high
  staleHours: 48,        // unverified older than this counts as backlog
  minBacklog: 5,         // backlog size that triggers the alert
};

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
export function detectPatterns(entries, { now = new Date() } = {}) {
  const R = PATTERN_RULES;
  const cutoff = isoDaysAgo(R.windowDays, now);
  const dateOf = (e) => e.date || coerceDate(e.ts)?.toISOString().slice(0, 10) || "";
  const recent = entries.filter((e) => dateOf(e) >= cutoff);
  const alerts = [];

  // 1. Repeat shorts by one person (cash only).
  const byPerson = {};
  for (const e of recent) {
    if (e.kind !== "cash" || !((e.diff || 0) < -0.005)) continue;
    const k = e.byId || e.by;
    byPerson[k] = byPerson[k] || { name: e.by, count: 0, total: 0 };
    byPerson[k].count++;
    byPerson[k].total += e.diff || 0;
  }
  for (const p of Object.values(byPerson)) {
    if (p.count < R.minShorts) continue;
    const high = -p.total >= R.highShortDollars;
    alerts.push({
      id: `person-shorts:${p.name}`, kind: "person-shorts",
      severity: high ? "high" : "medium",
      title: `${p.name}: ${p.count} short counts in ${R.windowDays} days`,
      detail: `Totaling ${money(p.total)} short. Worth a conversation — check the drawer and the till procedure before anything else.`,
    });
  }

  // 2. Drawer hot-spot: same drawer short under different hands points at
  //    process or equipment, not a person.
  const byDrawer = {};
  for (const e of recent) {
    if (e.kind !== "cash" || !((e.diff || 0) < -0.005)) continue;
    const k = e.drawerName || "(no drawer)";
    byDrawer[k] = byDrawer[k] || { count: 0, total: 0, people: new Set() };
    byDrawer[k].count++;
    byDrawer[k].total += e.diff || 0;
    byDrawer[k].people.add(e.byId || e.by);
  }
  for (const [name, d] of Object.entries(byDrawer)) {
    if (d.count < R.minShorts || d.people.size < 2) continue;
    alerts.push({
      id: `drawer-shorts:${name}`, kind: "drawer-shorts", severity: "medium",
      title: `${name}: short ${d.count} times across ${d.people.size} people`,
      detail: `Totaling ${money(d.total)} short in ${R.windowDays} days. Multiple hands, same drawer — suspect the register, the float, or the procedure.`,
    });
  }

  // 3. Verification backlog: counts nobody is countersigning.
  const staleBefore = now.getTime() - R.staleHours * 3600 * 1000;
  const backlog = entries.filter((e) => {
    if (e.verifiedBy) return false;
    const t = coerceDate(e.ts);
    return t && t.getTime() < staleBefore;
  }).length;
  if (backlog >= R.minBacklog) {
    alerts.push({
      id: "verify-backlog", kind: "verify-backlog", severity: "medium",
      title: `${backlog} entries unverified for over ${R.staleHours}h`,
      detail: "Countersigning is the control that makes the log trustworthy — the backlog erodes it.",
    });
  }

  // 4. Inventory shrink streak: the same item keeps counting short.
  const byItem = {};
  for (const e of recent) {
    if (e.kind !== "inventory" || !((e.diff || 0) < 0)) continue;
    const k = e.itemName || "(item)";
    byItem[k] = byItem[k] || { count: 0, units: 0, unit: e.unit || "unit" };
    byItem[k].count++;
    byItem[k].units += -(e.diff || 0);
  }
  for (const [name, it] of Object.entries(byItem)) {
    if (it.count < R.minShorts) continue;
    alerts.push({
      id: `item-shrink:${name}`, kind: "item-shrink", severity: "medium",
      title: `${name}: short on ${it.count} counts in ${R.windowDays} days`,
      detail: `${it.units} ${it.unit}${it.units === 1 ? "" : "s"} missing in total.`,
    });
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
