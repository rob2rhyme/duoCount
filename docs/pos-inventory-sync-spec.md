# POS-synced live inventory — expiry & low-stock alerts

> **Status: research only (July 2026).** Nothing in this document is built. It
> records the owner's direction, the research behind it, and a proposed design
> so the build can be picked up cleanly. No code has changed.

## Owner decision — July 2026

Counting the **whole store's inventory per shift is not practical** and is not
the product's job. The direction instead:

1. **Sync the live inventory from the store's existing POS** — the POS already
   knows every item, its price, and its on-hand quantity.
2. On top of the synced catalog, track **count, price, and expiry date**, with
   two notifications:
   - **“Expiring soon”** — an item's expiry date is within **30 days**;
   - **“Need order”** — an item's stock has fallen **below 5 units**.
3. Both thresholds (the expiry-warning days and the low-stock units) are
   **adjustable in settings, by the owner only**.

### What this does *not* change

The per-shift **signed inventory count stays — but only for the high-shrink
watch list** (cigarettes, vapes, the 5–15 items in `inventory-tracker-spec.md`).
That count is the theft-protection spine (countersigned, append-only) and is
untouched. The POS sync is an *operational* layer: full catalog, freshness, and
reordering. The two layers reinforce each other — see §Trust-spine synergy.

## Research: how independent c-stores can sync a POS

The sync path depends entirely on which POS the store runs. The landscape for
independent convenience stores, best-first for integration:

| POS | Typical store | Sync path | Notes |
| --- | --- | --- | --- |
| **Square** | small retail, some c-stores | **Official REST APIs + webhooks** | Catalog API (items, prices) + Inventory API (per-location quantities); `inventory.count.updated` and `catalog.version.updated` webhooks push changes in near real time; documented external-platform sync guide. OAuth per merchant, free developer account. [1][2] |
| **Clover** | small retail, gas/c-stores | **Official REST API** | Inventory endpoints with an `itemStock` expansion for quantities; OAuth 2.0 merchant tokens; real-world third-party inventory sync is an established pattern. [3] |
| **KORONA POS** | c-stores, liquor | API + strong native expiry | Cloud POS with an API; notable because its **Advanced Shelf Life Report** tracks expiry *per stock receipt* (batch-level) — the most complete expiry model seen in this class. [4] |
| **NRS (National Retail Solutions)** | bodegas, independent c-stores (very common) | **Portal exports / no public API found** | Real-time inventory + low-stock alerts live in its own “My NRS Store” portal; reports are exportable, but no public developer API surfaced in research. Practical path: scheduled CSV export → DuoCount import. [5] |
| **Modisoft** | c-stores, gas | Own back office (Cartzie ecosystem) | Central price book synced across locations inside Modisoft; no public API surfaced. Practical path: report export → CSV import. [6] |
| **Verifone Commander / Gilbarco Passport** | fuel + c-store sites | **NAXML / file-based back-office interface** | The petro-industry standard: a “Third Party Data Interface” exports the price book (PLU/UPC list) nightly; NAXML 3.2+ sample formats are published; back-office vendors (Petrosoft, CStorePro, AGKSoft) all consume these files. No live API — file drops. [7][8] |

**Takeaways.**

- There is no universal connector. **CSV is the only path that works for every
  POS on day one**; Square and Clover are the only ones with clean, free,
  officially-supported live APIs.
- DuoCount already shipped the hard part of the CSV path: the owner-only
  **Import / migrate** card (`bulk-import-spec.md`) parses a CSV in the
  browser, fuzzy-maps columns, dry-runs, and commits idempotently, matching
  items by **name or barcode + location**. A “stock sync” is that same
  mechanism with three more columns (quantity, price, expiry) and upsert
  semantics — re-running refreshes quantities instead of skipping.
- The petro POSes (Verifone/Gilbarco) already emit a **nightly** price-book
  file by design — which matches the roadmap's existing Tier-3 note that a
  “POS e-journal / nightly-CSV import” is the data spine. Nightly freshness is
  the industry norm; live-to-the-minute sync is only realistic on Square/Clover
  webhooks.

## Research: expiry tracking practice

- Purpose-built grocery/c-store POSes (KORONA, IT Retail) treat expiry as a
  first-class field with alerts when items approach their dates; KORONA's
  per-receipt (batch) model is the gold standard — the same SKU can carry
  different dates per delivery. [4][9]
- General-market practice is simpler: one (earliest) expiry date per item, an
  automated alert at a configurable time before the date, surfaced on a
  dashboard/email. [10]
- **MVP recommendation:** one optional `expiresAt` (earliest known date) per
  item, editable in Admin and importable via CSV. Batch-level dates (multiple
  deliveries of one SKU) are a later phase; they need receiving workflows
  DuoCount doesn't have.

## Research: low-stock thresholds

- The textbook reorder point is `(avg daily sales × lead time) + safety stock`,
  per SKU — but that needs sales-velocity data and per-vendor lead times, and
  every SMB system (Lightspeed, Revel, AMS) starts simpler: a **fixed per-item
  or global minimum threshold that triggers a low-stock alert**. [11][12]
- **MVP recommendation:** one store-wide threshold (default **< 5 units** per
  the owner decision) with per-item overrides later. Once POS sales data flows
  (Phase 2+), a computed reorder-point suggestion can decorate the fixed
  threshold — suggestion, never surprise.

## Proposed design (not built)

### Data model

- `items/{id}` gains optional fields, written only by sync/import or Admin:
  `price` (number), `quantity` (number), `quantitySyncedAt` (ts),
  `expiresAt` ("YYYY-MM-DD"), `syncSource` ("csv" | "square" | "clover" | …).
- `vendor.stockAlerts` (owner-only, same clamp-and-resolve pattern as
  `patternRules`):

  | Key | Default | Clamp | Meaning |
  | --- | --- | --- | --- |
  | `expiryDays` | **30** | 1–365 | “Expiring soon” when `expiresAt − today ≤ expiryDays` |
  | `lowStockUnits` | **5** | 0–999 | “Need order” when `quantity < lowStockUnits` |

  Both editable in Admin → Business settings, `disabled={!isOwner}` exactly
  like the variance thresholds. Localized en/es per the i18n rules.

### Surfacing (reuse, don't invent)

- A **Stock attention** card on the Dashboard: two lists — “Expiring soon
  (≤ N days)” with days-left, and “Need order (< M left)” with quantities.
  Manager-visible, same visual language as the Pack-audit card.
- A section in the **daily digest email** (the cron already aggregates per
  vendor) and, when it lands, the Tier-2 **in-app notification center** — these
  alerts are its first two concrete feed types.
- Optionally a pattern-alert (`stock-expiry`, `stock-low`) so the alert rides
  the existing detector → digest → AI-narrative plumbing. New pattern codes get
  i18n catalog entries per `pattern-format.js`.

### Phasing

| Phase | Scope | Effort |
| --- | --- | --- |
| **1 — CSV stock sync** | New “Stock levels” import type on the shipped Import card: columns item/barcode, quantity, price, expiry; **upsert** (refresh quantities on re-run); `vendor.stockAlerts` settings; Dashboard card + digest section. Works with *every* POS via its export. | S–M |
| **2 — Square + Clover live sync** | OAuth connect per location; initial catalog copy then webhook-driven deltas (`inventory.count.updated`); server route + stored tokens. | M |
| **3 — Petro back-office file drop** | Accept the Verifone/Gilbarco nightly NAXML/price-book file (upload or fetch); documentation-first (per-POS how-to guides). | M |

### Trust-spine synergy (why this belongs in DuoCount)

Today the signed shift count's `expected = start + received − sold − removed`
is built from **counter-entered** components — the honest residual documented
in the roadmap. A POS-synced quantity gives the count an **independent,
tamper-resistant expected baseline**: shift count says 41, POS says 44 —
3 units of shrink nobody typed. That turns the operational layer into a
strengthening of the theft-protection spine, not a detour from it.

## Open questions (owner)

1. **Which POS does the pilot store run?** Everything above phases on this
   answer; if it's NRS or Modisoft, Phase 1 (CSV) is the whole story for now.
2. Is the barcode printed on shelf tags/products reliable enough to be the
   join key (the importer already matches barcode-first)?
3. Multi-location: one POS account per location, or one account with
   per-location inventory (Square models both)?

## Sources & claim notes (checked 2026-07)

1. Square Inventory API + `inventory.count.updated` webhook — developer.squareup.com/docs/inventory-api/what-it-does, …/docs/inventory-api/webhooks (vendor docs).
2. Square external-catalog sync guide + `catalog.version.updated` — developer.squareup.com/docs/catalog-api/sync-with-external-system (vendor docs).
3. Clover inventory REST + `itemStock` expansion, OAuth 2.0 — docs.clover.com/dev/docs/working-with-inventory, …/making-rest-api-calls (vendor docs).
4. KORONA Advanced Shelf Life Report (per-receipt expiry) — manual.koronapos.com/advanced-shelf-life-report/ (vendor-published).
5. NRS real-time inventory, low-stock alerts, portal exports — nrsplus.com/small-business/pos-system-for-convenience-stores/ (vendor-published; no public API found in research).
6. Modisoft central price book across locations — modisoft.com/convenience/ (vendor-published).
7. Gilbarco Passport PLU/price-book extraction — help.cstorepro.com “How to Extract Price Book / PLU List from Gilbarco Passport”; NAXML 3.2+ sample import/export files — docs.gilbarco.com interfacing FAQ.
8. Petrosoft “Third Party Data Interface” nightly price-book export for Commander/Passport — help.petrosoftinc.com (back-office vendor docs).
9. IT Retail grocery POS expiry tracking — itretail.com/grocery-store-pos-system (vendor-published).
10. Configurable expiry alerts as standard practice — item.com/bookkeeper expiration-date tracking; bimpos.com expiry-tracking overview.
11. Reorder-point formula and threshold alerts — Lightspeed Retail support (reorder points / restock levels); amsretail.com low-stock alerts guide.
12. Par level vs reorder point — fishbowlinventory.com/blog/par-level.
