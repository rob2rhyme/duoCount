# DuoCount — Barcode Scanning Spec

**Status:** built alongside this spec (camera scanner, item scan-to-select, scratch pack scan with last-count prefill).

**Goal.** Cut the two slowest, most error-prone moments in a count — finding the right item in a list and re-keying pack numbers — by scanning with the phone camera the app already runs on. No hardware, no new accounts. This is the roadmap answer to LottoShield-style dedicated scanners: same speed benefit, zero extra kit.

**Design principle: scanning is an input accelerator, not a data source of record.** A scan only fills or selects fields the user could type by hand; every save still goes through the exact same signed, append-only entry path. Nothing in the trust pipeline changes.

---

## 1. Data model

### 1.1 `vendors/{v}/items/{id}` — one new field

| Field | Type | Notes |
|---|---|---|
| `barcode` | string \| null | Optional UPC/EAN/Code-128/QR text. Free text — no format validation, because state lottery and wholesale barcodes vary. Unique-per-location is a convention, not enforced. |

No changes to entries, drawers, users, or notes. Scratch entries already carry `pack`; the scanner just fills it.

### 1.2 Rules

**None.** The `items` block already allows managers to create/update items with any fields, and scanning never writes anywhere new. This feature is rules-neutral by design.

---

## 2. The scanner component

One shared `BarcodeScanner` modal (ported from the legacy inventory app, where its camera lifecycle survived an adversarial review):

- `@zxing/browser` is **dynamically imported inside the open effect** — it never loads on the server or in the initial bundle (~same pattern as the PDF library).
- Decodes the common 1D/2D formats (UPC-A/E, EAN-13/8, Code-39/128, Interleaved 2-of-5 — the lottery-pack format — and QR).
- Camera lifecycle: the MediaStream stops on close, on unmount, and on the detect callback; the `onDetected` handler lives in a ref so parent re-renders never restart the camera.
- Requires HTTPS (or localhost) and camera permission — browser rules, surfaced as friendly in-modal errors, never a crash.

---

## 3. Feature behavior

### 3.1 Inventory: scan to select the item

A 📷 button beside the item select. Scan → match against the **active items at the selected location** by `barcode` → select that item (which also triggers the existing start-qty prefill). No match → toast "No item with this barcode here — add it in Admin", and the form is left untouched.

Admin → Inventory items gains a barcode field on the add form and in item edit, plus a 📷 scan-to-fill button, so building the tracked list is itself scan-driven.

### 3.2 Scratch-offs: scan the pack, prefill the count

A 📷 button beside the Pack/book field. Scan → the raw barcode text fills `pack` (v1 stores it verbatim; state-specific game/pack parsing is a tier-2 refinement).

**The compounding win — last-count prefill:** whenever the pack field matches an earlier scratch entry at the same location (scanned *or* typed), the form prefills from the most recent one: same game name, same ticket price, and **start # = that entry's end #** — because yesterday's closing ticket number is today's opening number. The counter scans the pack and types exactly one number (today's end #). All prefilled values stay editable.

### 3.3 Explicitly not in v1

- Parsing state-lottery barcode structure into separate game/pack/ticket digits (varies by state; tier 2).
- Scanning to *create* inventory items in one step from a product database (no reliable free UPC source; tier 2/3).
- Enforcing barcode uniqueness (convention only; the pick list shows names, so duplicates degrade gracefully).

---

## 4. Screens

| Screen | Change |
|---|---|
| Inventory form | 📷 button beside the item select; toast on no-match |
| Scratch form | 📷 button beside Pack; game/price/start# prefill when the pack is recognized |
| Admin → Inventory items | Barcode input + 📷 on the add form; barcode shown on item rows; editable via item Edit |
| Scanner modal (new) | Camera viewport with reticle, starting/error states, cancel |

---

## 5. Acceptance criteria

1. Scanning never writes to Firestore by itself — only form state changes until "Save & sign entry".
2. Closing the scanner (button, backdrop, or navigating away) always releases the camera (no lingering camera-in-use light).
3. Inventory scan matches only active items at the currently selected location.
4. Scratch prefill fires on pack match at the same location whether the pack was scanned or typed, uses the most recent matching entry, and never overwrites a user's subsequent edits mid-entry.
5. On an insecure context or denied permission, the modal shows the reason and the form remains fully usable by hand.
6. The zxing library is absent from the initial JS bundle (dynamic import only).
