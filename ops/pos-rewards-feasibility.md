# Feasibility: making the rewards module pluggable to Square, Clover and other POS

Date: 2026-10-01 · Against commit `9c381a7` · Status: **research only — no build authorized**

> This revisits a shelved decision. `docs/pos-inventory-sync-spec.md` records an owner
> decision (July 2026) that Phase 2+ live/OAuth POS integration is **not on the roadmap**, and
> `docs/rewards-program-spec.md` shelved POS auto-earn alongside it. Both documents say they
> are kept "as research if the direction is ever revisited" and that building needs a fresh
> owner decision. This is that research. Nothing here changes the roadmap on its own.

**Sourcing caveat.** The environment's network policy denied `developer.squareup.com` and
`docs.clover.com`, so every external fact below comes from search-result summaries, not from
reading the primary API documentation. Treat vendor specifics — payload fields, pricing,
revenue share — as **indicative and requiring confirmation** against vendor docs before any
build. The internal findings (what our code does) are read directly from source and are firm.

---

## 1. Verdict

**Technically feasible and architecturally cheap on our side. The hard parts are not ours.**

The rewards ledger is already shaped for this: writes are server-side only, points are computed
from `saleDollars` server-side, idempotency keys exist, and there is already a non-human actor
(`byRole: "system"`). A POS adapter is a new input into an existing pipe, not a redesign.

Three things make it a bigger decision than the code suggests:

1. **A POS webhook gives you the amount, not the customer.** Square's `customer_id` is null
   unless somebody explicitly attached a customer to the sale. On a walk-up c-store cash sale
   nobody does. So "auto-earn" does **not** remove the phone-capture step at the register — it
   only removes the clerk's ability to *invent the amount*.
2. **Square and Clover are the wrong POS for most of the target market.** Roughly 78% of
   ExxonMobil-branded sites run Verifone Commander or Gilbarco Passport; Square and Clover are
   positioned for smaller c-stores *without* fuel. Building Square+Clover first serves the
   minority of the addressable base.
3. **The fuel POS world already has a loyalty standard, and it is a different shape.** Gilbarco
   Passport exposes a generic loyalty API that became the PCATS/Conexxus standard: an **XML
   message set between the site POS and a "Loyalty Host"**, synchronous and in the transaction
   path. That makes DuoCount a real-time dependency of the register — an operational posture it
   does not currently have.

**Recommendation: build the seam, not the integrations.** See §6.

---

## 2. What the rewards module assumes today

Read from source, firm.

| Assumption | Where | Consequence for POS |
| --- | --- | --- |
| Every write is attributed to a verified human member | `api/rewards/route.js:74` `requireMember(req)`; `by`/`byId`/`byRole` stamped at :196, :209, :286, :325, :356 | A webhook has no human. Needs a non-human actor path. |
| A non-human actor already exists | `expireLine` — `by: "System", byId: "system", byRole: "system"` | **The seam already exists.** Precedent for a policy-written line. |
| Points are computed server-side from `saleDollars` | `pointsForSale(...)`, never taken from the client | A POS amount slots straight in. No trust change. |
| Idempotency is already implemented | `lib/idempotency.js` — `normalizeRequestId`, `ledgerDocId(scope, requestId)` | **Directly reusable** for webhook replay, which is the main delivery hazard. |
| Ledger is append-only by construction | client rules allow no writes; balance updated in the same transaction as the event | A POS line is just another append. No rules change. |
| Fraud detectors key on the clerk | `clerkAffinity` filters `e.byId`, builds a per-clerk binomial baseline | **This one breaks.** See below. |

### The detector interaction is the one real internal risk

`clerkAffinity` computes each clerk's share of all earns and flags customers whose lines are
lopsided toward one clerk. If POS-originated earns land with `byId: "system"`, "system" becomes
a pseudo-clerk holding a large share of the window. That deflates every real clerk's baseline
`p`, which makes the binomial tail smaller, which makes genuine clerk behaviour **more** likely
to trip the threshold. The failure mode is false positives, not missed fraud — but it is still a
silent corruption of a detector the product sells.

Note what protects the detectors *today*: `clerkAffinity` is only ever called with
`earnsList` and `stampsList`, built by filtering `kind === "earn"` / `"stamp"`
(`reward-audit.js:140,280,265,281`). The `system`-written `expire` lines carry `kind: "expire"`
and never reach it. So there is no bug today — and that is precisely the problem, because the
kind filter is exactly what a POS earn would slip past: a POS-sourced earn *is* a genuine
`earn`, not a different kind. The one mechanism currently keeping non-human actors out of the
clerk baseline is the one mechanism that cannot see this case.

Fix is small and should be non-negotiable if this is ever built: give ledger lines an explicit
`source` (`"register"` | `"pos"`) and have every clerk detector filter to `source === "register"`.
A field rather than a special-cased `byId === "system"`, so it still holds when a third actor
appears.

**There is an upside worth stating plainly:** the detectors exist mostly because *the clerk
types the sale total*, which is the fraud surface the spec names. A POS-sourced amount removes
that surface for those transactions. POS integration does not just need the detectors adjusted —
it makes some of them unnecessary for the lines it covers.

---

## 3. The three integration surfaces are not one problem

| | Square | Clover | Gilbarco Passport / Verifone Commander |
| --- | --- | --- | --- |
| Market fit for DuoCount | Small c-stores **without fuel** | Smaller non-fuel c-stores, retail-heavy | **~78% of ExxonMobil-branded sites**; the fuel-forecourt default |
| Integration shape | Cloud REST + OAuth + webhooks | Cloud REST + OAuth + webhooks; web-app type needs no APK | **Site-to-host XML** (Conexxus/PCATS loyalty), synchronous |
| Who initiates | POS → our webhook (async, after the sale) | POS → our webhook (async) | POS calls the **Loyalty Host** during the transaction |
| Distribution | App Marketplace; must be approved as a Square app partner; per-API requirement checklists | App Market; Clover approves all apps; reviews permissions, REST config, webhooks | Per-POS **certification** (Passport advertises ~70 certified interfaces, 6 certified loyalty partners) |
| Commercials | Revenue share both ways under the PIMA; Square takes a share of app subscription fees | Developers receive ~70% of net subscription revenue | Certification programs, not app stores |
| Our uptime obligation | None (async retry) | None (async retry) | **Real-time** — we would be in the register's critical path |

The last row is the one that should drive the decision. Square and Clover are *observers*: if our
endpoint is down, the webhook retries and points land late. A Conexxus Loyalty Host is a
*participant*: if we are slow or down, the lane is slow or the discount does not apply. That is a
different product with a different operational contract, and it is not compatible with a
hobby-tier deployment posture.

---

## 4. The identity problem is the crux

For inventory sync, a POS webhook is sufficient — the basket is the data. For **rewards** it is
not, because a reward needs to know *who*.

- Square identifies the customer at checkout by phone, name or card on file, and that only
  happens when staff attach one. Reportedly `customer_id` is null on `payment.created` and
  arrives on a later `payment.updated` **when a customer was attached at all**; with no customer
  passed, the payment is treated as external with nothing to infer from.
- Square's own Loyalty API does solve this — but that is Square's loyalty product, which the
  merchant pays for (third-party-reported ~$45/mo/location in our own spec's competitor table)
  and which locks the data into Square. Integrating with it means DuoCount's ledger is no longer
  the record.

So the honest framing: **a POS integration does not make rewards automatic. It makes the amount
trustworthy.** The clerk still captures the phone.

### The design that actually follows from this

Keep the register flow exactly as it is — clerk enters the phone — and let the POS supply the
amount by correlation:

1. Clerk taps Rewards, enters the phone. DuoCount creates a *pending* earn with no amount.
2. The POS webhook arrives with a total, a timestamp and a location.
3. The adapter matches it to the pending earn within a short window at the same location, and
   writes a normal signed earn line with `source: "pos"` and the POS total.
4. No match inside the window → the pending earn falls back to clerk-entered amount with
   `source: "register"`, exactly as today.

This is strictly better than today on fraud (the clerk cannot inflate a matched sale), degrades
to today's behaviour when the POS is silent, needs no change to the customer-facing flow, and —
importantly — does **not** require the POS to know anything about our customers. The existing
`requestId` idempotency covers the replay case.

Per-item category tagging (the "qualifying total" problem the spec defers) also becomes real here
for the first time, because the basket arrives with the webhook. That is the second feature the
same connection buys, and it is the one that makes the legal exclusions (tobacco, alcohol,
lottery, fuel) enforceable rather than advisory.

---

## 5. Cost and risk, honestly

**Our side is the cheap part.** A `source` field plus detector filters, an adapter module per
POS, a webhook route with signature verification, OAuth token storage per vendor, and a
correlation window. All of it sits behind the existing trusted-route posture. Nothing in the
Firestore rules changes, because clients still write nothing.

**The expensive parts are not engineering:**

- **Credentials per merchant.** Every integration needs the store's own POS credentials and an
  OAuth consent. That is an onboarding and support burden on a product whose current onboarding
  is "pick a store code and a PIN".
- **Marketplace approval.** Both Square and Clover gate publication behind partner approval and
  app review. That is calendar time and ongoing compliance, not a sprint.
- **Token custody.** Storing per-merchant OAuth tokens that can read sales data materially raises
  the blast radius of a DuoCount compromise. Today the worst case is count data; after this it
  includes a live read path into the merchant's payment system. That deserves its own security
  review before any build, not after.
- **Per-POS fan-out.** "And other POS systems" is where this gets expensive: each one is its own
  auth model, payload shape, certification and support surface. The adapter boundary contains the
  code cost but not the operational one.

---

## 6. Recommendation

**Do not build Square or Clover integrations now. Build the seam that makes them cheap later, and
only if a real store asks.**

Concretely, in priority order:

1. **Add `source` to reward ledger lines** (`"register"` default) and make every clerk detector
   filter on it. Small, and it stops the detector corruption described in §2 from ever shipping.
   Unlike the rest of this list it is *only* worth doing if POS earns are coming — today's
   `kind` filter already keeps `system` lines out of the baseline, so there is nothing to fix
   until a POS-sourced `earn` exists.
2. **Define the adapter contract** — one pure module per POS, normalizing to
   `{ saleTotal, lineItems[], locationId, occurredAt, posTxnId }`. Pure, testable, no network. It
   makes the cost of the first real integration visible without paying it.
3. **Then stop.** Do not write a Square adapter until a store that runs Square asks for it. The
   market data says most of the target base runs Passport or Commander, and building for the
   minority first optimizes the wrong segment.

If the direction is ever taken seriously, the sequencing that matches the market is
**Passport/Commander (Conexxus) first, Square and Clover second** — which is the opposite of what
API convenience suggests, and is exactly why this is an owner decision rather than an engineering
one. Note that Conexxus-first also means accepting a real-time uptime obligation, which is a
bigger change to what DuoCount *is* than any of the code above.

### What would change this recommendation

- A specific store asking, with its POS named. That collapses the fan-out problem to one case.
- Evidence that the target segment skews non-fuel after all — the 78% figure is for
  ExxonMobil-branded sites specifically, not for independent c-stores generally, and our own
  customer base is the better evidence. Worth checking before trusting the market report.
- A decision to pursue the Square/Clover App Marketplaces as a *distribution* channel rather than
  an integration. That is a go-to-market argument, and a legitimate one, but it should be made on
  its own terms rather than smuggled in as a technical feature.

---

## Sources

External facts are from search-result summaries; primary docs were unreachable (see caveat above).

- Square developer platform, Orders/Payments/Loyalty APIs and webhooks — https://developer.squareup.com/us/en , https://developer.squareup.com/docs/loyalty-api/overview , https://developer.squareup.com/reference/square/webhooks
- Square App Marketplace requirements and revenue share — https://developer.squareup.com/docs/app-marketplace/requirements , https://developer.squareup.com/docs/app-marketplace/rev-share
- Square `customer_id` behaviour on payment webhooks — https://developer.squareup.com/forums/t/payment-created-and-order-created-webhooks-dont-carry-customer-id-like-api-says-it-does/9342
- Clover app types (Android vs web vs semi-integrated) — https://docs.clover.com/dev/docs/clover-development-basics-web-app , https://docs.clover.com/dev/docs/gdp-create-new-app
- Clover webhooks and app approval — https://docs.clover.com/dev/docs/webhooks , https://docs.clover.com/dev/docs/developer-app-approval-archive
- Fuel/c-store POS market share and positioning — https://www.marketresearchfuture.com/reports/fuel-convenience-store-pos-market-10374 , https://pulserevops.com/revenue-architecture/ra0167
- Gilbarco Passport generic loyalty API and certified loyalty partners — https://www.cspdailynews.com/technologyservices/gilbarco-certifies-fuellinks-loyalty-program-passport , https://www.cspdailynews.com/technologyservices/outsite-receives-gilbarco-passport-pos-system-loyalty-certification
- Conexxus (formerly PCATS) loyalty standard — https://www.conexxus.org/ourwork/loyalty-standard , https://www.conexxus.org/groups/loyalty-working-group
