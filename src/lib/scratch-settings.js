// How many times a day the store counts its scratch-off packs. Some stores scan
// every pack at the start AND the end of a shift (the tightest theft control —
// it bounds every shift on both sides); others only have the staffing for one
// walk a day. The owner picks, and the choice shapes three things:
//
//   • the count form only offers the shifts the store actually logs;
//   • the shift log stops nagging for a reading the store never intended to
//     take (a "closing only" store's rows are COMPLETE, not half-missing);
//   • a single-sided row still reports real movement — the count's own
//     start→end span, which chains from that pack's previous count.
//
// Pure + clock-free so both the form and the report can share one rule.

export const SCRATCH_SHIFT_MODES = ["both", "open", "close"];
export const DEFAULT_SCRATCH = { shifts: "both" };

/** The store's mode, from the vendor doc. Anything unknown → "both". */
export function resolveScratchShifts(vendorOrSettings) {
  const raw = vendorOrSettings?.scratch?.shifts ?? vendorOrSettings?.shifts ?? vendorOrSettings;
  return SCRATCH_SHIFT_MODES.includes(raw) ? raw : "both";
}

/** Normalize the whole settings object for the vendor-doc write. */
export function resolveScratchSettings(raw = {}) {
  return { shifts: resolveScratchShifts(raw) };
}

/** Which shift values the count form should offer, in display order. */
export function allowedShifts(mode) {
  const m = resolveScratchShifts(mode);
  if (m === "open") return ["open"];
  if (m === "close") return ["close"];
  return ["open", "close"];
}

/** Does this mode expect a reading on that side of the day? */
export function shiftRequired(mode, side) {
  return allowedShifts(mode).includes(side);
}

/**
 * Coerce a shift to one the store logs — so a remembered/guessed "open" can't
 * strand a closing-only store on a shift it never records.
 */
export function coerceShift(mode, shift) {
  const allowed = allowedShifts(mode);
  return allowed.includes(shift) ? shift : allowed[0];
}
