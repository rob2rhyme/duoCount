# DuoCount — Lottery Pack Lifecycle Spec

**Status: RETIRED (July 2026, owner decision).** The pack registry
(activate/settle/return), the settlement CSV reconciliation, and the
active-pack picker were removed from the app: settlement paperwork is the
lottery's job, and the registry duplicated what the counts already prove. The
theft control that replaced it is the **shift boundary**: each scratch count
records the pack's start and end ticket #s, the form chains a pack's start #
from its previous count's end #, and the **pack audit**
(`src/lib/scratch-audit.js`, surfaced on the Dashboard with a `pack-gap`
pattern alert) flags every discontinuity — tickets unaccounted between two
signed counts, naming both signers — plus packs that stopped being counted.
Legacy `packs` documents are left in place (rules unchanged); the demo-data
Clear still sweeps seeded ones. The spec below is kept for history.

**Goal.** Track each scratch-off pack from the safe to the last ticket. Counts (tier zero) prove what sold *per shift*; the lifecycle proves what happened to the *whole pack* — the unit the state lottery bills you for, and the unit that walks away in the classic theft pattern (a pack activated off-book, tickets pocketed). This is the last column of the LottoShield comparison in the positioning one-pager.

**Design principle: transitions are forward-only and nothing is deleted.** A pack moves `received → active → settled | returned` and never backward — the same append-only trust posture as entries, enforced in rules, not just UI. Managers run the lifecycle (like drawers and items); everyone can see it.

---

## 1. Data model

### 1.1 New collection: `vendors/{v}/packs/{id}`

| Field | Type | Notes |
|---|---|---|
| `game` | string | e.g. "Lucky 7s" |
| `packNumber` | string | The book number; matches the scratch entry `pack` field |
| `price` | number | Per ticket |
| `ticketCount` | number | Tickets in a full pack (pack value = price × ticketCount) |
| `barcode` | string \| null | Scan-fillable, like items |
| `locationId`, `locationName` | string | Same denormalization as entries |
| `bin` | string \| null | Display slot, set at activation |
| `status` | string | `received → active → settled \| returned`, forward-only |
| `receivedBy`, `activatedAt/By`, `settledAt/By`, `returnedAt/By` | mixed | Who moved it, when |
| `soldAtSettle`, `shortAtSettle` | number \| null | Reconciliation snapshot frozen at settle time |
| `returnNote` | string \| null | Why it went back (game ended, damaged, …) |
| `createdAt` | timestamp | |

### 1.2 Reconciliation

"Sold so far" for a pack = the sum of `sold` across scratch entries with the same `pack` at the same location — the counts stay the source of truth. **Settling snapshots that number**: `soldAtSettle` and `shortAtSettle = ticketCount − soldAtSettle`, frozen on the pack forever. A positive short at settle is per-pack shrink, attributable to the exact shifts between activation and settlement in the log.

---

## 2. Rules

```
match /packs/{packId} {
  allow read: if member();
  allow create: if mgr() && request.resource.data.status in ['received', 'active'];
  allow update: if mgr()
    && request.resource.data.status in ['received', 'active', 'settled', 'returned']
    && (
      // forward-only transitions
      (resource.data.status == 'received'
          && request.resource.data.status == 'active')                // activate
      || (resource.data.status == 'active'
          && request.resource.data.status in ['settled', 'returned']) // close out
      // metadata edit (status unchanged) — but a settled/returned pack is
      // terminal: its settle snapshot is frozen HERE, in rules, so NO field
      // may change once it's closed out.
      || (resource.data.status == request.resource.data.status
          && (!(resource.data.status in ['settled', 'returned'])
              || request.resource.data.diff(resource.data).affectedKeys().size() == 0))
    );
  allow delete: if false;
}
```

Forward-only is the rule, not a convention: a settled or returned pack can never be reopened, and nothing skips from `received` straight to `settled`. **A closed-out pack is frozen whole** — the trust-model pass tightened the metadata-edit branch so that once a pack is `settled` or `returned`, rules reject *any* field change (not just a status change). Before, the `resource.data.status == request.resource.data.status` branch let a manager rewrite `soldAtSettle`/`shortAtSettle` on a settled pack after the fact — erasing a recorded short. Now the settle snapshot is immutable at the rules layer, matching the append-only posture of entries and punches.

---

## 3. Screens

| Screen | Change |
|---|---|
| Admin → Scratch-off packs (new card) | Add form (game, pack #, price, tickets/pack, location, barcode + 📷); list with status pill, bin, pack value, sold-so-far; per-status actions: Activate (asks bin), Settle (confirm shows sold vs size + unaccounted), Return (asks reason); status filter |
| Scratch form | "Active pack" picker above the game/pack fields — selecting one fills pack #, game, and price in one tap (the existing last-count prefill then chains start # from the previous end #). Free text and 📷 scan still work for stores that skip the registry |

Counting flow once packs are registered: pick pack → everything prefills → type today's end # → Save & sign. One tap, one number.

## 4. Explicitly not in v1

- Employee-run transitions (managers only, matching drawers/items; owners can promote).
- ~~State-lottery settlement-file import or API reconciliation (tier 3).~~ —
  **built**, see §6 below (CSV import; a live-API integration remains out of scope).
- Automatic pack detection from a scanned entry barcode (the scan fills `pack`; linking a *count* to a pack stays by pack-number match, which tolerates unregistered packs).

## 6. Settlement reconciliation (tier 3 — built)

State lottery settlement/invoice files have **no common format**, so instead of
guessing one, the reconciler accepts **any CSV** and lets the manager **map the
columns** — which one is the pack/book number, which is the amount.

- **Where:** Admin → *Lottery settlement reconciliation* (a card under the packs
  registry). Upload a CSV; the header row is parsed and the pack-number / amount
  columns are auto-guessed from common names (editable). Choose whether the
  amount is **gross dollars** (compared to `soldAtSettle × price`) or **tickets
  sold** (compared to `soldAtSettle`).
- **Result:** each file row is matched to a recorded pack by pack number and
  split into **matched** vs **discrepancies** (delta beyond a small tolerance),
  plus **unknown in file** (no matching pack), **settled but not billed** (a
  settled pack the file omits), **on the file but not settled yet**, **listed
  more than once in the file** (a duplicate is reconciled once — not double-
  counted — and flagged), and **billed but returned** (the file bills a pack the
  store sent back, distinct from a not-yet-settled one). Totals show the file sum
  and net delta.
- **Pure + tested:** `src/lib/settlement.js` (`parseCSV`, `guessColumns`,
  `reconcileSettlement`) is a pure module — no Firebase, no network. The file is
  parsed and reconciled entirely **client-side** (nothing is uploaded anywhere),
  and it reads the existing `packs`; there are no new writes or rules. A file that
  can't be read surfaces a toast (`FileReader.onerror`). Unit tests in
  `tests/settlement.test.mjs` (`npm run test:settlement`): CSV quoting/escapes,
  column guessing, dollar/ticket bases, unknown/missing detection, duplicate-row
  and returned-pack flagging, `$`/comma amount cleaning, and exact (leading-zero-
  preserving) pack matching.
- **Out of scope:** a live state-lottery **API** integration, and per-state
  commission math (the tool compares gross figures you map, not net-of-commission).

## 5. Acceptance criteria

1. Rules reject backward or skipping transitions (emulator-tested), pack deletion, and employee writes; everyone signed-in can read.
2. Settling freezes `soldAtSettle`/`shortAtSettle`; later counts never rewrite a settled pack's snapshot — a settled/returned pack rejects *any* field edit at the rules layer (emulator-tested), not just a status change.
3. The scratch form's picker lists only `active` packs at the selected location, and selecting one fills pack/game/price without touching start/end numbers except via the existing last-count prefill.
4. A pack registry is optional: stores that never open the card lose nothing — free-text pack counting behaves exactly as before.
