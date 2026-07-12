# DuoCount — Inventory Tracker Spec

**Status:** built — items catalog, Inventory tab, log/dashboard/CSV integration, and rules shipped. Tier one has shipped, and inventory entries inherit its verification, disputes, and comment threads automatically. **Two tier-one extras are specified below but not yet wired to inventory: variance flagging and blind mode** — see the Status note in §1.2.

**Goal.** Extend DuoCount's countersigned-count mechanics to physical stock — cigarette cartons, vape products, and other high-shrink items — so shift counts of merchandise get the same treatment as cash and scratch-offs: signed, timestamped, verified, append-only, disputable.

**Design principle: inventory is a third entry kind, not a new system.** Cash entries are `kind: 'cash'`, scratch entries are `kind: 'scratch'`; inventory counts become `kind: 'inventory'` in the same `entries` collection. Everything already built — the shared log, manager verification, per-location visibility, dispute threads, variance flags, cause codes, EOD report, email digest, CSV export — inherits inventory automatically with near-zero extra work. That reuse is the whole justification for this architecture.

---

## 1. Data model

### 1.1 New collection: `vendors/{v}/items/{id}`
The catalog of things worth counting (not a full product catalog — just tracked items).

| Field | Type | Notes |
|---|---|---|
| `name` | string | e.g. "Marlboro Red carton", "Elf Bar BC5000" |
| `category` | string \| null | Free text for grouping ("Cigarettes", "Vapes") |
| `unit` | string | "carton", "pack", "unit" — display only |
| `locationId` | string | Same per-location pattern as drawers |
| `active` | boolean | Soft disable; no deletes |
| `createdAt` | timestamp | |

Managed exactly like drawers: managers create/edit, rules mirror the drawers block.

### 1.2 Entries with `kind: 'inventory'`
Reuses the entry envelope (`by`, `byId`, `date`, `shift`, `locationId`, `locationName`, `verifiedBy`, `ts`, plus tier-one's `flagged`, `varianceStatus`, `causeCode`, `disputeStatus`, `commentCount`). Kind-specific fields:

| Field | Type | Notes |
|---|---|---|
| `itemId`, `itemName`, `unit` | string | Denormalized like `drawerName` |
| `startQty` | number | Prefilled from the same item's most recent counted qty at this location (editable) |
| `received` | number | Deliveries since last count |
| `removed` | number | Damaged / returns / transfers out |
| `soldQty` | number | Sold since last count (from register tape or POS report) |
| `counted` | number | The physical count — the only field that must be hand-counted |
| `expected` | number | `startQty + received − soldQty − removed` |
| `diff` | number | `counted − expected`; negative = missing stock |

The math mirrors the cash drawer formula on purpose — staff already understand it. Blind mode (tier one) applies identically: hide `expected`/`diff` until committed.

**Variance threshold:** cash thresholds are dollars; inventory needs units. Add `vendors.invVarianceThreshold` (number, default `1` — any missing unit flags). Same flag → cause code → resolve flow.

> **Status (not yet implemented).** These two sub-features remain specified but unbuilt for inventory. `InventoryForm` saves entries without `flagged`/`varianceStatus`, so they fall back to the safe defaults (`flagged: false`, `varianceStatus: 'none'`) — the cash form's `abs(diff) >= threshold` flagging has no inventory equivalent, and `invVarianceThreshold` is whitelisted for writes but read by nothing (no Admin UI sets it). The inventory form also renders the expected/over-short readout unconditionally and never checks `vendor.blindCounts`, so **blind mode does not apply to inventory**. Both would need code (not just docs) to ship.

---

## 2. Screens

1. **New "Inventory" tab** (form mirrors the cash form): location select, item select (active items at that location, searchable if >15), date/shift, the five quantity fields, readout block showing expected + over/short in units, Save & sign. Post-save behavior identical to cash, including blind mode.
2. **Admin → Items card** (clone of the Drawers card): add item (name, category, unit, location), disable/enable, edit name/category.
3. **Log**: inventory entries render with item name + unit chip; existing filters gain "Inventory only"; verification, disputes, and flags need no changes.
4. **Dashboard**: "By item" table (entries, net unit diff, short-counts count) parallel to "By drawer"; missing-units total added to the stat cards. (As built, the third column is **Short counts** — entries with `diff < 0` — since inventory entries are never variance-flagged.)
5. **EOD report**: gains an Inventory section (item, shift, start, received, sold, removed, expected, counted, diff, verified-by) between scratch-offs and the flagged section.

Tab bar reaches nine tabs (Cash, Scratch-offs, Inventory, Log, Notes, Incidents, Time, Dashboard, Admin — Incidents and Time were added in later tiers); it already horizontally scrolls on phones. If that feels crowded in practice, merge Cash/Scratch/Inventory into one "New count" tab with a kind switcher — a UI decision to make with real users, not in this spec.

## 3. Rule changes

- `items` collection: copy the `drawers` block verbatim (read: member; create/update: manager; delete: never).
- Entries create rule: extend `kind in ['cash','scratch']` to `['cash','scratch','inventory']`. Nothing else changes — the envelope validation and all tier-one branches (verify, investigate, dispute, comment bump) already apply.
- Vendor update whitelist: add `invVarianceThreshold`.

## 4. Rollout notes

- **Start small.** Recommend onboarding copy that says to track the 5–15 highest-shrink items, not the whole store. Per-shift counts of a short list is the loss-prevention pattern that works; counting everything daily fails within a week.
- **`soldQty` is the weak link** — it's self-reported until POS integration exists. Same honest posture as cash sales: the record is a trust log, and the countersign + append-only history is the control.
- **Barcode scanning** (the roadmap answer to LottoShield et al.) helps here twice: scan the item to select it, and later scan scratch packs. Spec scanning as its own feature after tier one; this data model doesn't change when it arrives.
- **Reporting:** unit shrink per item per week is the number owners will care about; it falls out of the existing dashboard aggregation pattern with `kind === 'inventory'`.

## 5. Acceptance criteria

1. An inventory count flows through the entire existing trust pipeline untouched: appears in the shared log, verifiable (not self-verifiable), disputable, flaggable, exportable, and included in the EOD PDF and digest.
2. `startQty` prefills from the latest prior count of the same item + location and remains editable.
3. Per-location employees can only count items and read inventory entries for their location (rules test).
4. Disabling an item hides it from the form but leaves its history intact everywhere.
