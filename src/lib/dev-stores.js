// Per-vendor staff rollup for the developer console's Stores tab. Pure: the
// route does the Firestore reads and hands the rows here.
//
// Split out because the read strategy has two shapes — one collection-group
// query, or a per-vendor fan-out fallback — and both must fold into exactly the
// same result. Keeping the fold in one tested place is what makes the fallback
// trustworthy rather than a second implementation that quietly drifts.

/**
 * Index active-staff rows by vendor, counting them and picking out the owner.
 *
 * `rows` are plain objects: { vendorId, role, name, email }. Rows without a
 * vendorId are dropped — a collection-group read can hand back a document whose
 * parent chain isn't what we expect, and a staff count attributed to the wrong
 * store (or to `undefined`) is worse than one that is missing.
 *
 * The FIRST row with role "owner" wins, matching the `.find()` this replaced.
 * Stores have one owner, so the two orderings can't disagree in practice; if a
 * store ever had two, both strategies would pick by arrival order anyway.
 */
export function indexStaffByVendor(rows) {
  const byVendor = new Map();
  for (const r of rows || []) {
    const id = r?.vendorId;
    if (!id) continue;
    let e = byVendor.get(id);
    if (!e) { e = { staffCount: 0, owner: null }; byVendor.set(id, e); }
    e.staffCount += 1;
    if (!e.owner && r.role === "owner") {
      // emailVerifiedAt is carried, not dropped: the Stores list uses it to
      // show whether support can reach this owner by email at all.
      e.owner = { name: r.name || "", email: r.email || null, emailVerifiedAt: r.emailVerifiedAt ?? null };
    }
  }
  return byVendor;
}

/** What a vendor with no staff rows reads as — same shape, zeroed. */
export const NO_STAFF = Object.freeze({ staffCount: 0, owner: null });
