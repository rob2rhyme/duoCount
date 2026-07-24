# DuoCount `/dev` Console Roadmap

> Planning doc — **not a build order to execute blindly.** It grew out of a competitor
> sweep (Stripe/Chargebee billing dashboards, Baremetrics/ChartMogul metrics,
> Intercom/Zendesk support consoles, Shopify Partners/Retool operator patterns,
> Toast/Square POS operator consoles) grounded in what `/dev` already does, then
> passed through an adversarial review. Every item is **additive** and respects
> `CLAUDE.md`'s boundaries (no lottery settlement, no pack lifecycle, no building the
> inventory/rewards specs before asked; en/es in lockstep for anything user-facing).

## Context

Today `/dev` (`src/app/dev/page.js` + the action-dispatched `src/app/api/dev/route.js`)
is two tabs: a cross-tenant **support Inbox** and a **Stores** manager. An operator can
list every vendor, suspend/activate/rename, set a private dev note, reset an owner PIN,
keep manual billing records with a live MRR roll-up, and work support tickets.

Two facts shape everything below:

- **`/dev` is the entire trust boundary.** Every mutation runs through the Firebase
  Admin SDK, which *bypasses* Firestore's per-tenant isolation. So the operator plane is
  currently **less accountable than the clerk plane it polices** — there is no audit log.
- **There is one operator identity.** The dedicated dev login mints a `platformAdmin:true`
  token with **no uid and no name** (`src/lib/dev-auth.js`); the billing writer already
  falls back to the literal `"developer"` for `updatedBy`. So "who did this?" is
  unanswerable until identity exists.

The goal: grow `/dev` from a reactive record-keeper into an **accountable, revenue-aware,
churn-aware** operator console — without ever weakening the signed, append-only,
per-tenant guarantees the product itself sells.

---

## Theme 1 — Revenue & Billing

DuoCount runs no charges (PCI out of scope); billing is hand-maintained, so the entire
dunning / failed-payment category is **N/A** (`past_due` is a human flag, not a declined
card). Work here squeezes insight and revenue *action* out of the manual records.

| Feature | What | Why | Effort | Risk |
|---|---|---|---|---|
| **Snapshot billing metrics** | ARR, per-plan MRR split, ARPU/ARPA, annual-vs-monthly mix — derived in `buildBillingSummary`, cards in Stores | Pure functions over the store array already loaded; 5×'s today's roll-up with zero new infra | S | None |
| **Itemized at-risk list** | The actual `past_due` stores + $ at risk + note, not just a count | Turns a number into a save-the-account worklist | S | None |
| **MRR concentration / whale flag** | Top-N stores as % of MRR; flag if one exceeds a threshold | Losing one account could gut a solo operator's revenue | S | None |
| **Billing data-hygiene nag** | Flag active-but-$0, stale trials, status/price mismatches | Every metric inherits the honesty of hand-entered records | S | None — flag, never auto-"fix" |
| **Billing-history capture** *(prerequisite)* | On every billing edit **and** a scheduled monthly snapshot, append to a dev-only `billing_events/{vendorId}` (default-deny, Admin-SDK-only) | No history → no waterfall, no churn rate. **Edit-triggered alone undercounts churn** (a suspend, a lapsed trial, a silent owner produce no billing edit) — hence the monthly snapshot too | M | Low — append-only; every write is also an audit event |
| **MRR movement waterfall** | Decompose "$X→$Y" into new / expansion / contraction / churned / reactivation | The headline view the reference tools sell; diagnoses whether flat MRR hides churn | M *(after history)* | Low |
| **NRR + revenue/logo churn** | Expansion − churn − contraction; churned ÷ starting | Best single predictor of a durable SaaS | M *(after history)* | Low |
| **Plan-vs-usage fit badges** | Cross-reference billing × usage × locations × entitlements → "paying but idle," "heavy use on Starter," "trial lapsing with strong usage" | Turns record-keeping into revenue action (upsell/downsell/convert) | M *(needs usage doc)* | Low — aggregate usage only |

**Not building:** invoice-PDF rendering, tax computation/remittance, revenue recognition,
a real processor, cohort/LTV/forecasting (noisy on a small hand-maintained base), any
dunning/retry metric.

---

## Theme 2 — Metrics & Insight

The console sees tenants but almost nothing about tenant *health* or *adoption* — the
leading indicators of churn and expansion.

| Feature | What | Why | Effort | Risk |
|---|---|---|---|---|
| **Module entitlement chips** | Project `resolveFeatures(v)` (already read in `listStores`) onto each row + adoption counts | Highest ROI on the roadmap: free data in hand; answers "who turned on the just-shipped gaming module?" | S | None |
| **Silence signal** | **One** `lastActivityAt` per vendor → "active 2h ago / silent 6 days" | A paying tenant that logs nothing is the #1 churn risk; the cheapest signal. *(One field, one write path — see the consolidation note below.)* | S | Low — a timestamp, not content |
| **Per-vendor usage doc** *(pull FORWARD)* | `usage/{vendorId}` (`entriesThisWeek`, `activeLocations`, `lastActivityAt`) written on existing count paths | **Sequence this before the fan-out chips** — `listStores` already fans out a per-vendor `users` read at up to 500 vendors; a setup-chip + location-count each add *another* per-vendor read to that loop. One `usage` doc collapses them into a single read | M | Medium — keep **aggregate counts, not row-level content**, so metering never becomes a second un-audited cross-tenant data path |
| **Onboarding / setup chip + stalled cohort** | Run `setupProgress` from the usage doc; "Setup 2/3" + a filter for created > N days, essentials undone | A signed-but-not-live tenant is churn-in-waiting | S *(off usage doc)* | Low |
| **Location count per tenant** | Location count + names in the row (off the usage doc, not a fresh fan-out) | Closes the tenant-vs-location vocabulary gap (`/dev` sees vendors; a vendor owns many locations) | M | Low if counts/names only |
| **In-console system status** | Last digest-cron run, failed-login spikes (read from `login-throttle.js`, not a new pipeline), plan snapshot | Operator visibility without leaving for Vercel/Firebase dashboards | S–M | Low — render presence/last-4 only, **never secret values** |

**Not building (yet):** platform-wide DAU/WAU, cohort grids, LTV, forecasting, benchmark
engines, cross-tenant fleet attention-scoring. A "fleet-median outlier" stat is the
pragmatic first cut at scale.

---

## Theme 3 — Support & Success

The Inbox already has append-only per-store threads, lifecycle (open→pending→resolved),
6 categories, 4 priorities, two-way unread tracking, and a searchable `/docs` help center.
The reference tools are built for agent *teams*; a solo desk wants the lightweight versions
that reuse stored data.

| Feature | What | Why | Effort | Risk |
|---|---|---|---|---|
| **Saved replies / canned responses** | Dev-editable snippets with `{store}`/`{owner}` placeholders, an **en/es pair per snippet** | Biggest time-saver for a one-person bilingual desk | S | Honor i18n lockstep — never a half-translated snippet |
| **Per-store context rail** | On ticket-open: that vendor's other tickets, plan/billing, active/suspended, staff count, `devNote` | Every field exists but isn't cross-referenced; enables pattern-spotting | S–M | Low — same-tenant metadata |
| **Dev-set priority + curated tags** | Re-triage priority/category after creation; curated tags (`scratch-audit`, `pos-sync`, `known-issue`) + inbox filter | Priorities are frozen at owner input today; tags group one bug across many stores | S | Low — small fields, honor the 1 MB doc budget |
| **Waiting / stale timers** | Ticket age + "waiting on you" clock; stale-sort past a threshold | Zendesk's first-reply concept as a nudge, not an SLA — computed from stored timestamps | S | None |
| **KB-deflection hook** | On ticket creation, run subject/body through `text-match.js` docs search → "these might help…" | Deflects howto tickets using the corpus already built | S–M | None |
| **CSAT on resolve** | One-tap 👍/👎 + optional comment | Signal on whether a fix landed | S–M | Low |
| **Dev-only internal note** | Private findings ("caused by PR #131") not shown to the owner | The useful sliver of "assignment" at solo scale | S | Low |

**Not building:** round-robin routing, business-hours SLA engines, omnichannel journeys, a
second help center, ticket assignment (defer until team > 1).

---

## Theme 4 — Tenant Operations & Trust / Security

**The most important theme, and the one the product's spine demands.** Every cross-tenant
mutation runs through the rules-bypassing Admin SDK under one un-scoped identity with no
trail; `resetOwnerPin` is a latent, unlogged impersonation path.

> **Adversarial-review correction — audit and RBAC are ONE foundational unit.** An audit
> log's headline promise is *actor attribution*, but the single shared dev credential has
> no uid/name, so a "who did it" log in isolation records `"developer"` for every action.
> Ship the **`platformAdmins/{uid}` identity/RBAC** and the **audit log together**, or the
> audit log over-promises. Treat them as the same Now milestone.

> **✅ Shipped.** Both halves of the Now milestone are live: the append-only `adminAudit`
> log (every store action — actor, action, store, detail, server ts — with a `/dev` Audit
> tab), and operator identity/RBAC via the server-only `platformAdmins/{uid}` registry
> (superadmin / support / finance / readonly → per-action scopes, enforced on every
> `/api/dev` action and mirrored in the console; deactivation is authoritative over the
> env allowlist, removals tombstone, a transactional guard protects the last superadmin;
> the env dev login + `PLATFORM_ADMIN_UIDS` stay break-glass). Operators sign in as their
> normal store account — no per-operator token minting was needed.

| Feature | What | Why | Effort | Risk |
|---|---|---|---|---|
| **Operator identity + RBAC** ✅ | Move from the env allowlist to `platformAdmins/{uid}` with `role`/`scopes` (support / finance / superadmin); check scope per action; mint per-operator tokens carrying a real uid+name | Gives every action an attributable actor (unlocks the audit log), shrinks a compromised seat's blast radius, and fixes revocation (delete a doc vs. redeploy) | M–L | Medium — the point is least-privilege; break-glass elevation JIT + logged |
| **Admin-action audit log** ✅ | Append-only, tamper-evident `adminAudit` (default-deny, Admin-SDK-write-only); wrap **every** `storeAction`/`ticket*`/billing handler — actor, ts, tenant, action, before/after, reason; retrofit existing handlers | The one place the product fails its own standard; the safe foundation every cross-tenant feature depends on | M | Require a free-text reason on sensitive ops; no update/delete (match the count ledger) |
| **Harden operator *authentication*** | Confirm `/api/auth/dev` throttling, add MFA/second factor, and a credential-rotation story | A single shared static password = full cross-tenant compromise. **Hardening the door outranks hardening any single action** | S–M | High if omitted |
| **Operator-writable entitlements** | An `entitlements` map on the vendor doc, resolved *under* owner `features` toggles, optionally defaulted from `billing.plan` | Plan gates nothing today; enables staged rollout + emergency kill-switch | **M–L** *(not S — it's a trust-spine refactor: touches every `featureEnabled` gate and must never drop already-signed count data)* | A kill-switch must never silently disable a theft detector without an audit entry |
| **Harden (don't remove) `resetOwnerPin`** | Keep it (it's real lockout recovery), but **force a PIN change on next owner login, notify the owner, and audit loudly** | Removing it strands locked-out owners; the hole is that it's *unlogged/unconsented*, not that it exists | S | High if left as-is; the fix is the point |
| **Backup / DR for the operator plane** | Export/backup of `billing`, `billing_events`, `supportTickets`, `adminAudit` | These are top-level, default-deny, single-owner-critical, and covered by **no** tenant export | M | Low to build, high to omit |
| **Read-only, audited impersonation ("view as store")** | Short-lived (JIT), consent-gated where feasible; token stamped with the real `impersonator_id` + a **`readonly` claim**; persistent banner; every action audited under the operator's real id | Support can't see the owner's actual screens today | L | **Highest-risk.** *Correction:* "read-only" must be enforced in **Firestore rules** — a token stamped with `vendorId` to satisfy reads is, by those same rules, write-capable. Rules must **deny every write bearing the impersonator/readonly claim**. Never build write-impersonation — a writable session could forge a countersigned count |
| **Global search — metadata only** | Universal bar over store / owner / plan / ticket | The #1 daily support action | M | Keep to **metadata**; any drill-in to signed counts/PII routes through impersonation + audit, never a raw query |
| **GDPR export / erasure** | Full-tenant export; hard-delete customer PII (rewards) but **anonymize-don't-delete** the signed count ledger (tombstone the clerk id, keep the immutable count) | Legally required for rewards PII | M–L | Irreversible → reason-required, audited, ideally two-operator-approved |
| **Guarded bulk actions** | Op on a filtered cohort with typed-count confirmation + per-row audit | Cohort action at fleet scale | S–M | Cap batch size; **never** bulk destructive/irreversible ops |

**Not building:** write-impersonation, a device/heartbeat fleet registry (low value for a
web app), rendering secret values, un-audited hard-deletes.

---

## Theme 5 — Onboarding, Adoption & Growth

Turning signups into live, healthy tenants — and proactively reaching a finite, known set
of owners.

| Feature | What | Why | Effort | Risk |
|---|---|---|---|---|
| **Operator digest email** *(the delivery layer)* | Reuse the `api/cron/digest` schedule to email the operator the at-risk + silent + stalled cohorts | **Every new signal above is pull-only** — silence, past-due, stalled onboarding are useless if they never reach a solo operator who isn't staring at `/dev`. This is the push channel that makes Themes 1/2/5 actionable | S–M | Low |
| **Proactive announcements / broadcasts** | A `broadcasts` collection (title, body, severity, audience filter) → dismissible in-app banner on the owner dashboard; dismissal stored per-device | Owners are a known finite set — skip journey machinery, just post; deflects duplicate tickets | M | A broadcast is a cross-tenant *write* — scope who can send (RBAC) + audit; both locales required |
| **Incident banner** | One special high-priority broadcast, app-wide until cleared | "Known issue: POS sync delayed" deflects the identical-ticket flood | S | Low — every user is a logged-in owner; skip a public status page |
| **Stalled-onboarding CSV cohort export** | Export the filtered stalled cohort for outreach | The console already has CSV muscle (gaming export) | S–M | **Owner-email export is PII egress** — audit it to the same bar as GDPR export, not a "free read" |

**Not building:** anonymous-visitor journey engines, SMS outreach (TCPA — matches the
rewards spec's v1 exclusion), anything depending on the unbuilt inventory/rewards specs.

---

## Phased plan

### Now — foundational + high-value/low-risk
1. **Operator identity/RBAC + audit log — as one unit.** Nothing new should touch tenant
   data until an *attributable*, append-only trail exists. (Audit without RBAC records
   `"developer"` for everyone.)
2. **Harden the dev login** (throttle-confirm + MFA + rotation) — the door outranks any action.
3. **Module entitlement chips + snapshot billing metrics** — pure functions over data
   `listStores`/`buildBillingSummary` already load; no new infra.
4. **Consolidated silence signal + per-vendor `usage` doc** (usage doc first), then the
   **setup chip** and **location count** read off it — avoids piling per-vendor reads onto
   the existing fan-out.
5. **Saved replies + per-store context rail + dev-set priority/tags + waiting timers** —
   the support items that reuse stored data.
6. **Harden `resetOwnerPin`** (force-change + notify + audit) — plugs the unlogged
   impersonation hole in the trust spine.

### Next
- **Billing-history capture** (edit-triggered **+ monthly snapshot**) → **MRR waterfall +
  NRR + trial→paid**.
- **Operator-writable entitlements** (scoped as the M–L trust-spine refactor it is).
- **Usage doc → plan-vs-usage fit badges** (the revenue loop).
- **Operator digest email** + **broadcasts / incident banner** (the push + deflection layer).
- **Backup/DR export** of the operator-plane collections.
- **KB-deflection hook**, **CSAT**, **in-console system status**, **stalled-onboarding export** (audited).

### Later / needs design
- **Read-only, time-boxed, consent-gated, fully-audited impersonation** — with the
  **rules-enforced write-deny** as a hard acceptance criterion.
- **GDPR export + anonymize-don't-delete erasure** — needs a retention-basis design for the
  immutable ledger.
- **Global metadata search** and **guarded bulk actions** — only after audit + RBAC land.
- **Fleet-median outlier stats / benchmarks** — revisit at fleet scale.

### Explicitly out of scope / risky
- **Write-impersonation** — could forge countersigned counts; destroys the core guarantee.
- **Real charging / processor / tax / RevRec / invoice PDFs** — PCI + tax liability out of scope.
- **Dunning / failed-payment recovery** — no charges are run; `past_due` is a manual flag.
- **Cross-tenant search or metering that reaches row-level content** — impersonation + audit only.
- **Device/heartbeat fleet registry**; **rendering secret values**; **un-audited hard-deletes**.
- **Lottery settlement, pack lifecycle, building inventory/rewards specs before asked** — per `CLAUDE.md`.
- **Cohort/LTV/forecasting + peer benchmarking** — noisy and misleading at current scale.

---

## Top 3 to do first

1. **Operator identity/RBAC + the admin-action audit log, together.** DuoCount sells
   accountability, yet its operator plane mutates tenant data with no attributable trail —
   the one item where the product fails its own standard, and the safe foundation every
   other cross-tenant feature depends on. (They ship as one milestone because the audit log
   can't name an actor until identity exists.)
2. **Module entitlement chips + snapshot billing metrics.** Highest value-per-hour on the
   board: pure functions over data already loaded, answering "is the new gaming module
   landing?" and "which plan carries revenue?" with zero new infra.
3. **Saved replies + per-store context rail.** The two cheapest, highest-leverage upgrades
   for a solo bilingual support desk — cut repeat typing and turn cold tickets into
   informed ones from fields that already exist.

---

*Provenance: competitor research + adversarial review, July 2026. Nothing here is built yet —
this is a plan to prioritize against, not a spec.*
