// Store-code (slug) helpers — shared by the signup route and the pre-signup
// availability check so both derive the SAME code from a business name, and both
// allocate collisions the same way (base, then base-2, base-3, …).

export function slugify(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "store";
}

// The next free code given the base and the set of already-taken slugs: the base
// itself when free, else base-2, base-3, … Mirrors the signup transaction's loop
// so the availability check and the real allocation agree.
export function nextAvailableSlug(base, taken) {
  const has = taken instanceof Set ? taken : new Set(taken || []);
  if (!has.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const c = `${base}-${i}`;
    if (!has.has(c)) return c;
  }
  return `${base}-x`; // pathological (99 variants taken) — signup still re-checks
}
