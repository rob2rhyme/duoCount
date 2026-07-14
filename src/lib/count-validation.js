// Pure, client-agnostic validation for the three count forms.
//
// Each function returns { ok, field, message }: when ok is false the Save button
// should be disabled and `message` names the first thing to fix (shown inline),
// with `field` identifying which input it concerns. Kept pure so it can be
// unit-tested with `node --test` and shared identically by the form components —
// no more click-time-only guards that let a blank count save as zeros.

const OK = { ok: true, field: null, message: "" };
const fail = (field, message) => ({ ok: false, field, message });

// A numeric field counts as "entered" when the user typed *something* — even
// "0". An empty shelf or an empty drawer is a real, meaningful count; a blank
// box means "I didn't count," which is exactly what we want to stop.
const entered = (v) => String(v ?? "").trim() !== "";

export function validateCash(f = {}, opts = {}) {
  if (!f.locationId) return fail("locationId", "Pick a location first.");
  if (!f.drawerId) return fail("drawerId", "Pick a cash drawer first.");
  // With the denomination counter on, the tallied bills are the count, so the
  // single "counted" box is legitimately empty.
  if (!opts.useCounter && !entered(f.counted))
    return fail("counted", "Enter the amount you counted.");
  return OK;
}

export function validateInventory(f = {}) {
  if (!f.locationId) return fail("locationId", "Pick a location first.");
  if (!f.itemId) return fail("itemId", "Pick an item to count.");
  if (!entered(f.counted)) return fail("counted", "Enter the amount on hand.");
  return OK;
}

export function validateScratch(f = {}) {
  if (!f.locationId) return fail("locationId", "Pick a location first.");
  if (!f.drawerId) return fail("drawerId", "Pick a drawer first.");
  if (!entered(f.startno) || !entered(f.endno))
    return fail("numbers", "Enter the start and end ticket numbers.");
  if (Number(f.endno) < Number(f.startno))
    return fail("numbers", "The end number can't be less than the start.");
  return OK;
}
