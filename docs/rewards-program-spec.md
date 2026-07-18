# Customer rewards — competitive research & program spec

> **Status: Phases 1–3 shipped (July 2026).** Phase 1: `customers` + the
> append-only signed `rewardEvents` ledger (all writes via the trusted
> `/api/rewards` route — client rules allow **no** writes), the owner-only
> Reward settings in Admin (with the live effective-%-back readout and >2%
> caution), and the register earn/redeem flow as a **Rewards** tab (en/es).
> Phase 2: the **fraud detectors** (`reward-audit.js` — points-vs-counted-
> sales reconciliation, per-customer multi-earn, per-clerk redemption bursts)
> merged into the Dashboard Patterns card and the digest, the **outstanding-
> liability readout** on the Dashboard and in the digest, and the
> `privacy-and-data.md` disclosure (done in Phase 1). The rules changes are
> **emulator-verified** (73 rules tests pass, incl. members-read/nobody-writes
> on both collections). Phase 3: the public rate-limited **`/rewards` balance
> page** (en/es) and the **printable bilingual counter sign**; category
> tagging moved to the POS-integration phase. No SMS, no tiers.

## Owner decision — July 2026

- DuoCount gets a **customer rewards system**. Default economics:
  **$1 spent = 1 point** and **100 points = $5 off**.
- Both knobs are **adjustable in a Reward settings section, by the owner
  only** (same posture as the variance thresholds / alert sensitivity).
- Program off by default; enabling it is an owner action.

### The math the settings page must show

At the defaults, a point is worth 5¢ and the program returns **5.0% of spend**
(`redeemValue ÷ redeemPoints × earnPerDollar`). The big-chain norm is ~1% or
less (see table below) — the default is deliberately **~5× more generous** than
a 7-Eleven, which is a real customer-acquisition weapon for an independent, but
it must be a *seen* decision: on thin c-store margins a 5% giveback can exceed
the entire gross profit of low-margin lines (cigarettes are the canonical
example, and are usually excluded from programs anyway — see Compliance).
**Recommendation:** the Reward settings card computes and displays the live
"effective % back" as the owner edits the knobs, with a caution note when it
exceeds ~2%.

## Competitive research

### Big-chain benchmark programs (what customers already know)

| Program | Earn | Redemption | Effective return | Notable exclusions |
| --- | --- | --- | --- | --- |
| 7‑Eleven **7Rewards** | 10 pts / $1 | from 1,000 pts ≈ $1 | ≈ 1% | age-restricted items, fuel, services don't earn [1] |
| Speedway **Speedy Rewards** | 10 pts / $1 (merch) | ~0.09–0.1¢/pt (5,500 pts ≈ $5 card) | ≈ 0.9–1% | value varies by reward [2] |
| Casey's **Rewards** | 10 pts / $1 + 5 pts/gal fuel | Casey's Cash / fuel discounts / donation | ≈ 1% | — [3] |
| Circle K **Inner Circle** | fuel-discount model | 3¢/gal, 5¢/gal after $500 spend (tiered) | n/a (not points) | tiering, not points [4] |
| Sheetz **My Sheetz Rewardz** | 5 pts / $1 | menu-item redemptions | ~1% order of magnitude | **no earn on fuel, alcohol, cigarettes/tobacco, milk, lottery, car wash, gift cards** [5] |

Two structural lessons: **(a)** every major program excludes age-restricted
categories (and usually fuel/lottery/gift cards) from earning; **(b)** points
are cheap per unit — customers respond to the *feeling* of 10 pts/$ even at
~1% value. DuoCount's 1 pt/$ at 5% value inverts that: fewer, bigger points.
Both work; the display copy just has to make $-value obvious ("100 pts = $5").

### SMB loyalty platforms (what an independent can buy today)

| Platform | Pricing (as researched) | Model | C-store fit / friction |
| --- | --- | --- | --- |
| **Fivestars / SumUp Connect** | custom-quoted, annual contracts common; bundled with SumUp hardware | phone-number check-in at a counter tablet; min. 1 pt/$; AutoPilot win-back/birthday campaigns; **70M-consumer cross-merchant network** | The de-facto standard in independent retail. Friction: hardware, contracts, and the shared consumer network (your customer list markets the network) [6] |
| **Square Loyalty** | ~$45/mo **per location** (third-party-reported; moves fast) | points at checkout, tied to Square POS | Only works if the store runs Square; data locked to Square [7] |
| **Clover** (loyalty apps) | app-market add-ons | varies | Only on Clover hardware [8] |
| **Kangaroo Rewards** | ~$79–$349/mo (third-party-reported) | white-label app, tiers, marketing automation | Full-featured, priced above a single-store bodega [9] |
| **Loyalzoo** | ~$0.15/member/mo (third-party-reported) | digital punch card by phone number | Cheap and simple; per-member pricing scales oddly with a big list [9] |
| **TapMango** | custom-quoted | branded app + tablet | Same hardware/contract posture as Fivestars [9] |
| **Modisoft (Cartzie)** | bundled with Modisoft POS | c-store-native loyalty + SMS outreach | Only inside the Modisoft ecosystem [10] |

### Industry context

NACS-reported benchmarks: top-quartile c-store operators see **30% of
transactions from loyalty members** (37%+ at the 90th percentile), while the
average c-store signs only **~36 new members per store per month** (QSRs: 110)
— i.e. enrollment friction, not concept, is where programs die. Phone-number
enrollment at the register is the lowest-friction pattern in class. [11]

## Compliance constraints (these shape the defaults)

1. **Tobacco / vape — exclude from redemption by default, and from earning.**
   ~25 states have cigarette **minimum-price laws**; New York has banned all
   tobacco discounts/coupons since July 2020, with New Jersey / Rhode Island /
   NYC / Providence imposing similar restrictions — redeeming a $5 reward
   against cigarettes is a price discount and is illegal in those places.
   Every major chain also excludes tobacco from *earning* (see Sheetz,
   7-Eleven). [12][13]
2. **Lottery — exclude entirely (earn and redeem).** Lottery tickets must sell
   at face value; discounting violates state lottery rules or license terms
   (in Indiana it is a Class A misdemeanor). This also matches DuoCount's
   product line: the scratch-off feature is shift-boundary theft protection
   only — rewards must never touch lottery. [14]
3. **Alcohol — exclude by default** (state-by-state discount restrictions;
   the chains exclude it from earning too). [5]
4. **SNAP/EBT equal treatment.** A loyalty program must be offered to SNAP
   customers **on the same terms as everyone else** — that's fine (and
   required); what's prohibited is SNAP-*only* incentives without an FNS
   waiver. Design impact: none, as long as enrollment and rewards are
   universal. [15]
5. **TCPA — no SMS marketing in v1.** Collecting a phone number for points
   does **not** authorize marketing texts; that needs separate, unbundled
   express written consent, never as a condition of joining, at $500–$1,500
   statutory damages per violating text. Cleanest v1: the phone number is an
   identifier only, no outbound messaging at all. [16]
6. **Privacy.** Customer phone numbers are a new PII class for DuoCount —
   `privacy-and-data.md` must be extended before launch (what's stored, why,
   retention, no resale/no shared network — a direct contrast with Fivestars'
   cross-merchant model).
7. **Points liability & breakage.** Outstanding points are a real liability
   (`outstanding ÷ 100 × $5` at defaults). Retail programs typically see
   ~31–33% breakage (points never redeemed); the standard mitigation is
   expiry after **12–18 months of inactivity**, disclosed at signup. The
   owner should see the outstanding-liability dollar figure, and the
   accountant-export docs should mention it. [17]

## Gap analysis — what competitors miss that DuoCount can fill

1. **Clerk points-fraud controls (the trust-spine gap).** Points skimming —
   a clerk scanning *their own* account on customers' purchases, or granting
   unearned points — is an abuse pattern none of the SMB platforms audit
   seriously. DuoCount is uniquely positioned: **(a)** the points ledger is
   **append-only and signed** like every count (no silent edits);
   **(b)** the pattern engine can watch for one account earning across many
   shifts, earn events clustered on one clerk, and redemption bursts;
   **(c)** uniquely, DuoCount already holds **countersigned cash-sales
   totals per shift** — a denominator nobody else has. A
   points-issued-vs-counted-sales ratio per shift makes skimming visible as
   a variance, in the product's own "a question, not a verdict" voice.
2. **Age-restricted exclusions as first-class settings.** The generic SMB
   tools have no concept of tobacco/lottery exclusions; DuoCount ships the
   correct legal defaults out of the box (see Compliance).
3. **No hardware, no contract, no per-member fees.** The PWA is the tablet;
   enrollment is a phone number typed at the register.
4. **Bilingual out of the box.** The entire count path is already en/es; the
   rewards screens inherit `i18n.js` from day one. Fivestars & co. are
   English-first.
5. **Owner-tunable economics with the math shown.** Live "effective % back"
   readout + margin caution — no other SMB tool surfaces the giveback rate.
6. **Multi-store points sharing** on the existing multi-location model
   (Square charges per location; DuoCount's vendor already spans locations).
7. **Privacy as a feature.** No cross-merchant network, no data resale, no
   marketing by default — a clean one-paragraph promise in
   `privacy-and-data.md`.
8. **Liability visibility.** The outstanding-points dollar figure on the
   owner's screen and a note in the bookkeeper export — competitors keep the
   liability invisible.

## Proposed design (not built)

### Settings — `vendor.rewards` (owner-only, clamp-and-resolve like `patternRules`)

| Key | Default | Clamp | Meaning |
| --- | --- | --- | --- |
| `enabled` | `false` | — | master switch; off = zero UI |
| `earnPerDollar` | **1** | 0.1–100 | points per $1 of qualifying sale |
| `redeemPoints` | **100** | 10–100,000 | points needed for a reward |
| `redeemValue` | **5** | 0.5–1,000 | dollars off per redemption |
| `excludedCategories` | tobacco, vape, alcohol, lottery, gift cards, fuel | — | never earn/redeem against these |
| `expiryMonths` | 12 (inactivity) | 0 (never)–60 | breakage/liability control, disclosed at signup |

The settings card computes `effective % = redeemValue / redeemPoints ×
earnPerDollar × 100` live, with a caution above ~2%.

### Data model

- `customers/{id}` — normalized phone (the lookup key; displayed masked),
  optional name, `createdAt`, `lastEarnAt`, `pointsBalance` (transactionally
  maintained; always re-derivable from the ledger).
- `rewardEvents/{id}` — **append-only, signed like entries**: `customerId`,
  `kind` (`earn` | `redeem` | `adjust`), `points` (±), `saleDollars` (earn),
  `by`/`byId`/`byRole`, `locationId`, `ts`, `note` (required for `adjust`).
  Rules: create-only (no update/delete); `adjust` is owner-only.
- No schema change to entries/counts — rewards data never touches the count
  log.

### Register flow (v1 — DuoCount is not the POS)

- **Earn:** clerk taps Rewards → enters customer phone + the qualifying sale
  total (excluded categories left out) → signed earn event; balance shown.
- **Redeem:** lookup by phone → if balance ≥ `redeemPoints`, one tap records a
  signed redeem event and shows "give $5 off at the register" — the discount
  itself is applied on the POS; DuoCount records the voucher.
- Manual entry is the fraud surface — which the detectors (below) and the
  points-vs-counted-sales reconciliation exist to watch. Automatic earn via
  Square/Clover transaction webhooks rides the same OAuth integration as
  `pos-inventory-sync-spec.md` Phase 2 — one connection, two features.

### Phasing

| Phase | Scope |
| --- | --- |
| **1 — Core — ✅ shipped** | customers + append-only ledger + owner Reward settings + register earn/redeem flow (en/es). No SMS, no app, no tiers. Implementation note: all writes go through the trusted `/api/rewards` route (Admin SDK) — client rules allow no writes at all, so append-only holds by construction; points are computed server-side from the owner's settings, and the balance moves in the same transaction as the ledger line. |
| **2 — Trust & visibility — ✅ shipped** | fraud detectors in the pattern engine; digest section; outstanding-liability readout; `privacy-and-data.md` update. Implementation note: `reward-audit.js` (pure, unit-tested) reconciles points issued against the countersigned cash-sales totals (10% slack + 20-pt floor), flags one customer earning 3+/5+ times in a day (masked phone), and one clerk recording 3+/5+ redemptions in a day; alerts are pattern-shaped, ride the same Patterns card / digest / AI-narrative path, and the clerk-named kind joins the PII redactor's person list. |
| **3 — Customer-facing — ✅ shipped** | The public **`/rewards` balance page** (store code + phone → points + progress; en/es with a language toggle; returns only the balance, never a name; the endpoint borrows the login route's per-IP + per-store throttles and — stricter than login — counts **every** request, so enumeration hits the wall almost immediately) and the **printable bilingual counter sign** (one sheet, English + Spanish, store name + program economics + the balance URL; printed from Admin → Customer rewards). *Per-item category tagging to auto-compute qualifying totals moved to the POS-integration phase* — it's only honest with real basket data (Square/Clover webhooks); until then the clerk-entered qualifying total plus the exclusions guidance is the mechanism. |
| **Deferred** | SMS marketing (TCPA consent flow), tiers, punch-card mode, POS auto-earn webhooks + category tagging for auto-computed qualifying totals. |

## Open questions (owner)

1. Are the generous defaults (5% back) intentional as a launch promotion, or
   should the shipped default be ~1–2% with 5% shown as an example? (Spec
   keeps **your stated defaults**; the settings card shows the math.)
2. Which categories beyond the legal set should be excluded (e.g. money
   orders, Boss Revolution top-ups)?
3. Should points be shared across all locations of a vendor (recommended
   default: yes)?

## Sources & claim notes (checked 2026-07)

1. 7Rewards earn/redeem and exclusions — 7-eleven.com/7rewards (vendor-published); redemption tiering per third-party guides (rewardsthatmatter.com).
2. Speedy Rewards point value ≈ 0.09–0.1¢ — thepointcalculator.com (third-party estimate); speedway.com/speedy-rewards/redeem.
3. Casey's Rewards 10 pts/$1 + 5 pts/gal — caseys.com/faq/caseys-rewards (vendor-published).
4. Circle K Inner Circle 3¢→5¢/gal tiers — circlek.com/inner-circle (vendor-published); tier trend context: cstoredive.com on tiered c-store loyalty.
5. Sheetz 5 pts/$1 and the exclusion list (fuel, alcohol, cigarettes/tobacco, milk, lottery, car wash, gift cards) — sheetz.com/loyalty-program (vendor-published).
6. Fivestars/SumUp: phone-number join, ≥1 pt/$ minimum, AutoPilot campaigns, 70M-consumer / 12k-merchant network, custom-quoted annual pricing — sumup.com/en-us/loyalty-om-marketing/ (vendor-published; pricing custom).
7. Square Loyalty ≈ $45/mo per location, no volume discount, 30-day trial — third-party reviews (loop.fans, favecard.co, capterra.com), checked 2026-07; **pricing moves — re-verify before quoting**.
8. Clover loyalty via app market on Clover REST/OAuth — docs.clover.com (vendor docs).
9. Kangaroo ≈ $79–$349/mo; Loyalzoo ≈ $0.15/member/mo; TapMango custom-quoted — third-party roundups/reviews (favecard.co, getapp.com, chckn.app), checked 2026-07.
10. Modisoft Cartzie loyalty + SMS outreach — modisoft.com (vendor-published).
11. Loyalty share of transactions (30% top-quartile / 37% at 90th percentile) and ~36 new members/store/month vs QSR 110 — convenience.org (NACS) loyalty reporting, 2024–2025.
12. ~25 states with cigarette minimum-price laws — CDC MMWR "State Cigarette Minimum Price Laws"; discount/coupon bans in NY (July 2020), NJ, RI — publichealthlawcenter.org policy guides; healthnews.ongov.net (NY).
13. NYC Sensible Tobacco Enforcement & Providence ordinances (coupon/multi-pack bans) — publichealthlawcenter.org; countertobacco.org non-tax pricing approaches.
14. Lottery face-value requirement; Indiana off-price sale = Class A misdemeanor; contractual prohibitions elsewhere — legalclarity.org (retailer commissions/rules); paulstam.info on ticket discounting; calottery.com retailer policies (PDF).
15. SNAP equal-treatment rule; incentives require an FNS waiver — fns.usda.gov/snap/retailer/training/notice/equal-treatment-rule and fns.usda.gov/snap/fr-022124.
16. TCPA: separate unbundled express written consent for marketing texts; loyalty signup ≠ SMS consent; $500–$1,500/violation — termsfeed.com SMS-consent guide; possiblenow.com; activeprospect.com (checked 2026-07).
17. Retail breakage ~31–33%; liability = outstanding × value × expected redemption; 12–18-month inactivity expiry norm — marsello.com loyalty accounting; brandmovers.com CFO liability guide; kyros.com financial-reporting checklist.
