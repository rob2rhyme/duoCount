import { isUnresolved } from "./utils.js";
import { swapStatusOf } from "./swaps.js";

// Manager "needs attention" counts, derived from data the app already holds in
// real time — no new query shapes, just a tally over the live arrays. Pure so
// it's unit-tested and the shell can feed it whatever it's watching.
//
//  • log       — counts with an unresolved variance OR dispute (open / under-review)
//  • incidents — write-ups still open (not acknowledged or closed)
//  • time      — shifts a coworker has claimed, waiting on a manager's approve/reject
//
// Employees don't resolve any of these, so the shell only asks for a manager.
export function attentionCounts({ entries = [], incidents = [], swaps = [] } = {}) {
  let log = 0;
  for (const e of entries) {
    if (isUnresolved(e?.varianceStatus) || isUnresolved(e?.disputeStatus)) log += 1;
  }
  const incidentsOpen = incidents.filter((i) => i?.status === "open").length;
  const time = swaps.filter((s) => swapStatusOf(s) === "claimed").length;
  return { log, incidents: incidentsOpen, time };
}
