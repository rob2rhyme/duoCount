// Smart defaults for the count forms: a time-based shift guess and a memory of
// the location / drawer a person last used, so a returning clerk isn't re-picking
// the same register (and the wrong shift) at the start of every shift.
//
// The two *decision* helpers are pure and unit-tested. The load/save helpers
// touch localStorage and are guarded so a private-mode / SSR context can't throw
// (they just no-op). localStorage is referenced only inside the function bodies,
// so importing this module under plain Node (for the tests) is safe.

// Opening counts happen at the top of a shift (morning); closing counts at the
// end (evening). 3pm is the changeover — good enough that most counts start on
// the right shift without a tap.
export function defaultShift(hour) {
  return Number(hour) < 15 ? "open" : "close";
}

// Prefer the remembered id when it's still a valid, available option; otherwise
// fall back to the first option (or "" when there are none). `options` is any
// array of objects with an `id`.
export function pickRemembered(rememberedId, options = []) {
  if (rememberedId && options.some((o) => o && o.id === rememberedId)) return rememberedId;
  return options[0]?.id || "";
}

const key = (vendorId, userId) => `duocount:ctx:${vendorId}:${userId}`;

export function loadContext(vendorId, userId) {
  try {
    return JSON.parse(localStorage.getItem(key(vendorId, userId))) || {};
  } catch {
    return {};
  }
}

export function saveContext(vendorId, userId, patch) {
  try {
    const next = { ...loadContext(vendorId, userId), ...patch };
    localStorage.setItem(key(vendorId, userId), JSON.stringify(next));
  } catch {
    /* ignore — memory of the last drawer is a nicety, never load-bearing */
  }
}
