/**
 * Who a clerk is allowed to see in the app's shared views.
 *
 * The counting data itself is deliberately readable store-wide (Firestore rules
 * gate on *location*, not on author) because the math depends on it: a scratch
 * pack's opening count chains off whoever took the previous reading, and a
 * drawer's expected cash comes from the last shift's close. So this is a
 * **presentation** policy, applied where names and totals are rendered — never
 * a filter on the data a calculation reads. Filtering at the source would break
 * pack chaining and drawer baselines.
 *
 * Two modes, owner-selectable:
 *   "own"   — a clerk sees only counts they signed. Coworkers' entries still
 *             feed the math, but their names and numbers aren't shown.
 *   "store" — the older shared-ledger behaviour: every clerk sees the whole
 *             team's counts (some stores run the log as a peer-visible board).
 *
 * Managers and owners are accountable for the store, so they always see
 * everyone regardless of the mode.
 */

export const STAFF_SCOPES = ["own", "store"];

/** Privacy-first: a store that never touches the setting keeps clerks to their own work. */
export const DEFAULT_STAFF_SCOPE = "own";

/** Read the mode off a vendor doc (or a settings draft); unknown values fall back. */
export function resolveStaffScope(vendorOrSettings) {
  const raw = vendorOrSettings?.staffScope;
  return STAFF_SCOPES.includes(raw) ? raw : DEFAULT_STAFF_SCOPE;
}

/**
 * Does this viewer see the whole team's work?
 * True for any manager/owner, and for a clerk when the store runs in "store" mode.
 */
export function seesEveryone(vendorOrSettings, isManager) {
  return isManager === true || resolveStaffScope(vendorOrSettings) === "store";
}

/**
 * Narrow a list of entries to what the viewer may see.
 * Returns the SAME array reference when nothing is filtered out, so callers can
 * keep it in a `useMemo` without churning downstream deps.
 */
export function scopeEntries(entries, { vendor, isManager, viewerId } = {}) {
  const list = entries || [];
  if (seesEveryone(vendor, isManager)) return list;
  // Fail closed. A blank viewer id would otherwise match every legacy/imported
  // entry that carries no `byId`, handing a clerk exactly the rows this hides.
  const me = viewerId || "";
  if (!me) return [];
  return list.filter((e) => (e?.byId || "") === me);
}

/**
 * The name to print next to a count. Managers (and "store" mode) get the real
 * signer; a clerk gets their own name and a neutral label for anyone else, so
 * the timeline still reads as a two-person chain without naming a coworker.
 */
export function displaySigner(name, byId, { vendor, isManager, viewerId, otherLabel = "" } = {}) {
  if (seesEveryone(vendor, isManager)) return name || "—";
  // Same fail-closed rule as scopeEntries: no viewer id claims nothing.
  if (viewerId && (byId || "") === viewerId) return name || "—";
  return otherLabel;
}
