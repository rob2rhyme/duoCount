// Pure, client-agnostic validation for the three count forms.
//
// Each function returns { ok, field, code, message }: when ok is false the Save
// button should be disabled and the first thing to fix is named two ways —
// `message` is the plain-English line (kept for tests and non-localized
// callers), and `code` is a stable identifier the forms feed through the i18n
// catalog (t(`err.${code}`)), so a Spanish clerk reads the reason in Spanish.
// `field` identifies which input it concerns. Kept pure so it unit-tests with
// `node --test` and is shared identically by the form components.

const OK = { ok: true, field: null, code: null, message: "" };
const fail = (field, code, message) => ({ ok: false, field, code, message });

// A numeric field counts as "entered" when the user typed *something* — even
// "0". An empty shelf or an empty drawer is a real, meaningful count; a blank
// box means "I didn't count," which is exactly what we want to stop.
const entered = (v) => String(v ?? "").trim() !== "";

export function validateCash(f = {}, opts = {}) {
  if (!f.locationId) return fail("locationId", "pick_location", "Pick a location first.");
  if (!f.drawerId) return fail("drawerId", "pick_drawer", "Pick a cash drawer first.");
  // With the denomination counter on, the tallied bills are the count, so the
  // single "counted" box is legitimately empty.
  if (!opts.useCounter && !entered(f.counted))
    return fail("counted", "enter_counted", "Enter the amount you counted.");
  return OK;
}

export function validateInventory(f = {}) {
  if (!f.locationId) return fail("locationId", "pick_location", "Pick a location first.");
  if (!f.itemId) return fail("itemId", "pick_item", "Pick an item to count.");
  if (!entered(f.counted)) return fail("counted", "enter_onhand", "Enter the amount on hand.");
  return OK;
}

export function validateScratch(f = {}) {
  if (!f.locationId) return fail("locationId", "pick_location", "Pick a location first.");
  if (!f.drawerId) return fail("drawerId", "pick_drawer", "Pick a drawer first.");
  if (!entered(f.startno) || !entered(f.endno))
    return fail("numbers", "enter_numbers", "Enter the start and end ticket numbers.");
  if (Number(f.endno) < Number(f.startno))
    return fail("numbers", "end_lt_start", "The end number can't be less than the start.");
  return OK;
}
