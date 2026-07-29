---
title: Monetization paths (2026)
---

# DuoCount: Go/No-Go on Two Monetization Paths

**Prepared 2026-07-29. Read the evidence-quality warning in §0 before acting on any external number in this document.**

---

## BOTTOM LINE

**PATH 1 — POS app marketplace listing: NO-GO.** Square's marketplace requires five active Square sellers *before* you can apply, so it cannot supply your first customer. Clover's terms appear to mandate its own billing rails, killing the $39 direct relationship, and a web-only listing never reaches the countertop. Neither reaches the c-store install base anyway — that's NRS and the fuel verticals. Do not list.

**PATH 2 — route-operator pivot: NO-GO, and this is good news.** Incumbents already sell meter-vs-cash driver accountability at $1–$6/machine/month, the operator base is shrinking ~3.8%/yr, and DuoCount's machine module has no meter field, no location field, no countersign, and sits entirely outside the trust spine. This is a new product, not a pivot. Killing it saves months.

**CONDITIONAL — the baseline.** Hosted SaaS at ~$39/location stays the plan, but it is blocked by something neither path addresses: **DuoCount cannot take money.** Fix that first.

---

## §0. Evidence-quality warning — read this first

Every research leg feeding this document ran under a blocked egress policy. Specifics:

- All three market-research legs report **HTTP 403 on CONNECT for every external host attempted** — including docs.clover.com, developer.squareup.com, nrsplus.com, convenience.org, ftc.gov, and even example.com and wikipedia.org. Every external claim below was obtained via **search-engine page extraction, not by loading the page**.
- Two legs **exhausted the 200-call WebSearch budget** mid-research. One leg (route-operator theft pain) produced **zero external evidence at all** and is honest about it.
- The adversarial verification pass **also had no external access**, and additionally reports that of 96 claims it was asked to check, **only 62 were transmitted; claims 63–96 were never delivered.** It verified exactly one thing independently: the on-disk facts.

**What this means practically:** the on-disk findings in this document are solid — I re-confirmed the load-bearing ones myself today (see §3, §4). The external market facts are *plausible and internally consistent but not confirmed*. Several are sourced to undated vendor pages, 2014–2020 forum threads, or archived documentation. I have marked the weak ones. Do not commit money against an undated figure.

That said: **the recommendations below do not flip on any single unverified fact.** Both NO-GOs are over-determined — they hold even if the most favorable unverified claim in each set turns out true.

---

## §1. PATH 1 — POS App Marketplace

### 1.1 The question that decides it: do US c-stores and gas stations actually run Clover or Square?

**Mostly no, and the ones that do are the least differentiated part of your market.**

What the research established:

| Platform | Install base | Source | Date |
|---|---|---|---|
| US convenience stores (total) | 151,975 stores; 95,672 (63%) owned by companies with ≤10 stores | [NACS/NIQ TDLinx via convenience.org](https://www.convenience.org/Research/Convenience-Store-Fast-Facts-and-Stats/FactSheets/IndustryStoreCount) | Feb 2026 |
| NRS (National Retail Solutions) | ~38,000 terminals at ~32,900 independent retailers | [GlobeNewswire](https://www.globenewswire.com/news-release/2025/12/09/3202794/0/en/NRSInsights-November-2025-Retail-Same-Store-Sales-Report.html) | 2025-12-09 |
| Gilbarco Passport | "more than 120 certified partners"; claims 19 of top 20 US c-store operators | [CSP Daily News](https://www.cspdailynews.com/fuels/more-partners-more-possibilities-more-ways-use-pos) | 2026-03-27 |
| Verifone Commander / Horizon Program | "hundreds of companies" using Commander APIs | [GlobeNewswire](https://www.globenewswire.com/en/news-release/2023/03/28/2635547/0/en/Verifone-Announces-Horizon-Program-for-its-Petroleum-and-Convenience-Store-Partners.html) | 2023-03-28 |
| Clover | ~910,000 merchants total, **c-store share unknown** | [analyst notes on Fiserv Investor Day](https://bobhammel.substack.com/p/fiserv-investor-day-notes) | Investor Day 2026-05-14 |
| Square | 4M+ sellers (2024 figure), **c-store share unknown** | [Block Q1 2026 call transcript](https://www.fool.com/earnings/call-transcripts/2026/05/08/block-xyz-q1-2026-earnings-transcript/) | 2026-05-08 |

**The honest read:** neither Fiserv nor Block publishes an MCC/vertical breakdown, so nobody in this research could size the c-store slice of Clover or Square. That is itself the answer — if the vertical were material, it would be marketed. Meanwhile the two platforms that demonstrably *are* the independent c-store are NRS (32,900 retailers) and the fuel verticals (Gilbarco/Verifone), and neither is a marketplace.

Two corrections the adversarial pass forced, which I accept:
- NRS's ~32,900 is **mixed independent retail** — bodegas, liquor stores, grocers, tobacco/sundries — not 32,900 convenience stores. The claim that it is "better-targeted than Clover or Square" has no comparative datum behind it and is struck.
- Square's Payment Terms prohibiting lottery and automated fuel dispensers ([squareup.com legal/general/payment](https://squareup.com/us/en/legal/general/payment), undated) restrict **what Square can process**, not who can be a Square seller. A c-store can run merchandise on Square with lottery on a state terminal and fuel on a separate controller — that is the normal architecture. The correct statement: *lottery and fuel data sit outside Square, so integration depth on your two sharpest features is zero.*

### 1.2 What kills the marketplace path regardless

**Square.** Publication requires prior approval as an app partner, and app-partner approval requires **five active Square sellers already using your app** ([developer.squareup.com/docs/app-marketplace/faq](https://developer.squareup.com/docs/app-marketplace/faq), undated — flagged UNVERIFIABLE by the adversarial pass and the single most load-bearing fact in the Square branch). If true, the marketplace is a badge you earn after succeeding, not a channel. Compounding it: a developer reports an application submitted 2026-01-24 with no response by 2026-05-14 ([forum thread](https://developer.squareup.com/forums/t/submitted-app-partner-application-01-24-2026-and-no-reponse/26101), 2026-05-14), and another reports being **declined "due to capacity"** on 2026-02-18 ([forum thread](https://developer.squareup.com/forums/t/clarification-on-oauth-limits-for-unlisted-private-production-applications/25389)). Both are n=1 complaint posts and cannot establish a base rate — but they establish that both failure modes occur.

Square's App Subscriptions (Square bills the merchant for you) is the one genuinely attractive term found anywhere in this research. It is **Beta, US-only, requires fully self-service onboarding, and requires you to already be live in the marketplace** ([developer.squareup.com/docs/app-marketplace/app-subscriptions](https://developer.squareup.com/docs/app-marketplace/app-subscriptions), undated). It sits behind the five-seller gate. It is a year-two convenience at best.

**Clover.** The documented rule is *"All app fees, merchant app usage payments, and merchant-customer payment processing must be implemented within the Fiserv or Clover platforms"* ([docs.clover.com/dev/docs/monetizing-your-apps](https://docs.clover.com/dev/docs/monetizing-your-apps), undated). With a 30% take that makes $39 into $27.30, hands Clover your merchant billing relationship, dunning, and churn, and forecloses annual prepay and multi-location bundles — the two things a solo operator needs for cash flow.

The adversarial pass caught a real contradiction I must flag rather than paper over: this rule is in direct logical tension with the private-apps documentation, which says private apps are **not** billable through App Market billing and that "pricing is discussed as part of the initial app review process" ([docs.clover.com/dev/docs/private-apps](https://docs.clover.com/dev/docs/private-apps), undated). Both cannot be true in absolute form. **The inference that private apps therefore permit direct $39 billing is struck — it is an assumption, not a finding.** Unresolved.

Three more Clover facts, at their corrected strength:
- **Web-only apps appear only in the browser Merchant Dashboard, never on Station/Mini/Flex; device presence requires an Android APK.** Sourced to an undated community thread with question ID 79 — almost certainly years stale. *Unresolved, but if true it is fatal:* DuoCount's counting workflow is a countertop workflow, and you have no Android surface anywhere in the repo.
- **Clover ships free native Cash Log and Cash Track apps that replicate the open-count / close-count / manager-reconcile pattern.** Downgraded: the Cash Track evidence is a **2014 one-sheet**. Cash Log's current existence is plausible-but-undated. Treat "Clover already ships your cash spine free" as *possible, unproven*.
- **The lottery precedent (CSI Works Redeem Lottery App) is weak.** It is sourced to the *vendor's own site* with a 2018 demo video, not to a live clover.com App Market listing. Clover's published prohibitions include gambling ([developer-app-approval-**archive**](https://docs.clover.com/dev/docs/developer-app-approval-archive) — note that URL says "archive," which should not be used to establish current policy). If no live listing exists, your scratch-off wedge is the *riskiest* thing to lead a Clover submission with, not the safest.

And the number that, if current, ends the discussion: Clover's own developer marketing claims *"close to $8 million in earnings disbursed to developers to date"* ([clover.com/ca/developers](https://www.clover.com/ca/developers), **undated**). That is roughly 17,000 DuoCount-months across the entire marketplace's lifetime, across ~181 vendors. Even discounted as stale, no marketplace producing meaningful passive distribution advertises that figure.

**Vertical POS partner programs (Gilbarco, Verifone) reach the right merchants but are worse channels:** contact-sales B2B certification tracks with **no published fees, tiers, or revenue share anywhere**, 120+ existing certified partners on Passport, and zero demand generation. Being partner #121 on a certification list is not distribution. (I accept the adversarial correction that "generates no inbound demand" is my hypothesis, not a sourced fact — but the burden of proof is on the channel, and it has published nothing.)

### 1.3 The trust problem — taking a position

**Position: importing POS figures does not weaken DuoCount's claim, provided a machine number is never allowed to carry a human signature. Doing it wrong would weaken it fatally, and the repo already contains the hole that shows how.**

`/home/user/duoCount/src/app/api/import/route.js` (commitBaselines, ~lines 165–190) writes rows straight into the append-only `entries` log with `by: f.by, byId: f.byId, byRole: f.byRole, ts: new Date(), source: "import"` via the Admin SDK — bypassing the two rules every client is held to: `ts == request.time` and `by == request.auth.token.name`. Today that is defensible: owner-only, opt-in, all-or-nothing, and labelled. **Scaled to a nightly POS feed it becomes a machine's numbers wearing a human's signature — precisely the thing the product sells against.**

The correct architecture is already written down in your own `docs/pos-inventory-sync-spec.md` §Trust-spine synergy: a POS feed is an **independent, tamper-resistant expected baseline**, stored as a separate attested-source record with its own provenance, and *compared* against the signed human count. "Shift count says 41, POS says 44" is stronger evidence than either number alone, because the two sources cannot collude. That framing makes POS integration a *strengthening* of the thesis.

The catch: making `expected` POS-sourced ripples through the rules (`cashExpectedOK`, `invExpectedOK`, `varianceConsistent`, `flagConsistent`), the 90 emulator tests that encode them, and every downstream consumer (`patterns.js`, `digest.js`, `report-accounting.js`, `portfolio-rollup.js`). That is weeks, and it is only worth spending once you have customers whose POS you actually need to read.

### 1.4 Codebase work required

Verified on disk today: **77 lib modules, 21 API routes, 54 components. Zero matches for `stripe|paddle|lemonsqueezy|oauth` anywhere in `src/`.** Auth is PIN-only (`/api/auth/login` takes `{storeCode, pin}`, mints a custom token with `{vendorId,userId,role,locationId,name}`).

| Gap | Effort | Blocking? |
|---|---|---|
| **No payment collection of any kind.** `src/lib/billing.js` (54 lines) is explicit: *"tracks each store's plan MANUALLY in the /dev console… NO card data, no charge is ever run here."* No processor, no webhook sink, no subscription object, no entitlement gate. | weeks | **YES — and for the baseline path too** |
| No OAuth anywhere: needs callback route, encrypted token store with refresh, merchantId→vendorId mapping, session bootstrap for a non-PIN origin | weeks | YES |
| OAuth *supplements* the PIN model, never replaces it — the trust spine is per-clerk (`byId != token.userId` for countersign). A marketplace-launched merchant still enrolls every clerk with a PIN. Onboarding becomes OAuth-**then**-PIN. | days | no (but universally underestimated) |
| POS feed as separate attested record + new comparison surface + rules/test amendments | weeks | YES |
| No outbound-API machinery: no HTTP client for third parties (only Resend in `digest.js`), no webhook receiver, no token vault, no retry, no sync worker. `vercel.json` runs one cron/day. | weeks | YES |
| Per-POS work is not reusable: Square and Clover are OAuth; NRS and Modisoft have no public API; Verifone/Gilbarco is nightly NAXML file drops | months | YES |
| Listing hygiene: no data-deletion endpoint, no scope-revocation handler, no uninstall webhook, no status page | days | no |
| Android APK for Clover device presence | months (new build target) | if device presence matters |

**Realistic revenue: near zero for 12+ months, and negative in the first year after engineering time.** Clover's channel economics are $27.30/location if the mandatory-rails rule holds. Square's rev-share percentage is **not public at all** — it lives in the PIMA, signed at publication ([developer.squareup.com/docs/app-marketplace/rev-share](https://developer.squareup.com/docs/app-marketplace/rev-share), undated), meaning **the Square path cannot be financially modelled until you're already in it.**

**Decisive risk:** you spend 4–6 months of solo-developer calendar time building integration and clearing review for a channel that, on its own published numbers, has distributed ~$8M lifetime across ~181 vendors — while not selling a single store. The opportunity cost is the entire business.

---

## §2. PATH 2 — Route-Operator Pivot

### 2.1 The question that decides it: does the meter already solve this?

**Yes, for the segments that can pay — and where it doesn't, DuoCount is currently worse than a meter, not better.**

The honest quantification, with its limits stated:

- **Global connected vending penetration was 58.1% at end-2025** — 8.1M connected machines, forecast 11.7M by 2030; North America has ~2.6M connected units ([Berg Insight](https://www.berginsight.com/the-global-installed-base-of-connected-vending-machines-reached-81-million-in-2025/), 2026-03-26). So ~42% of machines globally are still "cash and clipboard."
- **But that is the global figure, and North America's rate is unknown.** Secondary sources put the total US machine base under 3 million, which — against 2.6M connected NA units — would imply US penetration *far above* the global average and a cash-and-clipboard tail much smaller than 42% domestically. Berg publishes no NA penetration rate. **This is the single biggest unresolved number in this path, and it cuts against the path.**
- **The unconnected tail is the wrong customer anyway.** It skews old, low-revenue machines whose owners are least willing to buy software — and Nayax, PayRange and Cantaloupe are actively converting it at $6–$20/month *with hardware included*.
- **Cash is 29% of vending sales and falling fast:** cashless was 71% of US vending sales in 2024, up 17% YoY ([Cantaloupe 2025 Micropayment Trends](https://cantaloupeinc.gcs-web.com/news-releases/news-release-details/self-service-goes-cash-free-cantaloupes-2025-micropayment-trends/)). Canteen, the largest NA operator, committed in Feb 2026 to 100% micro-markets on new installs — natively cashless — with full conversion by 2029.

**And the "unserved gap" hypothesis does not survive contact with vendor pages:**

- Parlevel's VMS already markets remote cash-meter reads, barcode-scanned money-bag tracking, and cash consolidation, explicitly to *"ensure drivers return from routes with correct dollar amounts, down to the cent"* ([parlevelsystems.com/vms](https://www.parlevelsystems.com/vms/), undated, search-extracted).
- Crane's VendMAX lists **"cash accountability"** as a named API capability and pitches "money room to warehouse to truck" ([VendingMarketWatch](https://www.vendingmarketwatch.com/home/news/10920427/crane-announces-integration-of-vendmax-with-micro-markets)).

Both are search-extracted from undated vendor pages, so treat feature *depth* as unproven. But the category is clearly claimed, and you would be arguing a subtle differentiation — "ours is append-only, signed and countersigned, theirs is merely reconciled" — that nobody has verified is even false about the incumbents.

**The price floor is the coup de grâce.** VendSoft: $1/machine/month, $19 minimum ([vendsoft.com/pricing](https://www.vendsoft.com/pricing/)). PayRange/Vagabond: from $6/month per BluKey ([payrange.com](https://payrange.com/payrange-pricing-plans-vms/)). Cantaloupe One Seed Live/Cashless+: $18.95–$19.95/device ([cantaloupe.com/pricing](https://www.cantaloupe.com/pricing/cantaloupe-one/)). All search-extracted, all undated. A 30-machine operator pays ~$30–$60/month today for a *full* VMS. **$39/location has no umbrella to sit under.**

**Market structure got worse, not better.** 365 Retail Markets acquired Parlevel (2022-06-30) and then Cantaloupe for ~$848M ([SEC 8-K exhibit](https://www.sec.gov/Archives/edgar/data/896429/000110465925059703/tm2518071d1_ex99-1.htm), 2025-06), closing only after an FTC consent order forcing divestiture of Three Square Market ([FTC](https://www.ftc.gov/news-events/news/press-releases/2026/06/ftc-approves-final-consent-order-micromarket-kiosks-deal), 2026-06-17). The two obvious acquirers of a vending-adjacent product are now one company. Meanwhile the operator base is shrinking: **14,801 US vending operator firms in 2026, declining 3.8% CAGR** ([IBISWorld](https://www.ibisworld.com/united-states/industry/vending-machine-operators/1113/), 2026) — ~570 firms lost per year.

**TAM ceiling:** 14,801 operators × $468/yr = **$6.9M at 100% capture.** At a realistic 1% penetration, ~$69k ARR — and only if operators would accept per-location pricing, which they won't; they price per machine.

### 2.2 The other segments, briefly

- **Regulated route gaming (IL, PA, LA, MT, WV, NV):** avoid. Illinois has ~9,000 licensed video gaming locations and licenses terminal operators ([IGB](https://igb.illinois.gov/video-gaming/video-reports.html)); state central monitoring makes the meter authoritative — *this specific claim is an unverified prior, no source was retrieved*, but the direction is clear. Pennsylvania's Supreme Court ruled skill games are illegal slot machines with an October 2026 enforcement deadline and the legislature declined to fix it in the 2026-27 budget ([fishduck.com](https://fishduck.com/2026/07/pennsylvania-skill-games-in-limbo-after-lawmakers-skip-budget-fix/), 2026-07); Western PA operators have already folded and surrendered $5M. A solo developer does not want AML-adjacent gray-market cash gaming.
- **ATM/IAD:** cash *is* the inventory, but reconciliation is already automated end-to-end (electronic journal vs. processor settlement). The only public operator figure (>100 IADs, ~330,000 ATMs, [Datos Insights](https://datos-insights.com/press-release/independent-atm-deployers-remain-resilient-thanks-to-new-deals-with-banks/)) is ~2020 vintage and excludes exactly the small operators the thesis needs. **This vertical was never actually researched** — flagged as the top remaining unknown in two legs. It is the only place the path could still be rescued, and rescuing it would require a fresh research pass.
- **Car wash:** exclude on structure. Operators own and staff their own sites; nobody collects from a machine in someone else's building. $19.2B in 2026, converting to subscription memberships ([mmcginvest.com](https://www.mmcginvest.com/post/the-us-car-wash-industry-in-2026-the-gold-rush-meets-its-ceiling)). A car wash is a DuoCount *location* customer, not a route customer.
- **Multi-housing laundry route:** best business-model fit found (quarters collected from machines in someone else's building, revenue shared with the property owner) but fails "numerous enough" — CLA's entire membership is ~1,500 owners plus ~300 suppliers ([laundryassociation.org](https://laundryassociation.org/for-investors/industry-overview/)), and no route-operator population is published at all.
- **Street coin-op amusement** is the one segment where machines plausibly *don't* self-report reliably — and it is a ~$2.9B US market ([Global Industry Analysts](https://www.marketresearch.com/Global-Industry-Analysts-v1039/Coin-operated-Amusement-Devices-41395360/), 2024) with **no published operator count anywhere**. Smallest, least capitalized, least measurable. Bad combination for a $39+ SaaS.

### 2.3 Codebase work required — this is a rebuild, not a pivot

I re-verified the key facts on disk today: `src/lib/gaming.js` is **118 lines**, `GamingTab.js` 247, `scratch-audit.js` 269. **Zero occurrences of `meter` or `locationId` in `gaming.js` or `api/gaming/route.js`.**

| Gap | Effort | Blocking? |
|---|---|---|
| **Machines are not location-aware at all.** `normalizeMachine` returns `{name, company, type, storePct, cadence}`. Collections are written without a `locationId`. Even one multi-site operator cannot attribute a machine to a site. | days | **YES** |
| **No meter readings — the operator's actual reconciliation primitive is entirely absent.** The model is dollars only. The word "meter" appears exactly once in all of `src/`: as *placeholder hint text* in `i18n.js:1425` (`game.ph_note: "e.g. meter reading, who from the company collected"`). It is an untyped, unvalidated free-text note. | weeks | **YES** |
| Machine is not a real asset: no serial, no install/removal date, no location history, no effective-dated contract. Editing `storePct` silently rewrites terms for all future lines with no record. | weeks | **YES** |
| Nothing accrues or settles what is owed. No payable ledger, no statement, no period close, no paid/unpaid state, no adjustments. **That is the operator's core job.** The only output today is a client-side CSV (`GamingTab.js:92–100`). | weeks | **YES** |
| **The gaming ledger sits outside the trust spine.** Grep `gaming|machine` across `report-build.js`, `digest.js`, `patterns.js`, `report-accounting.js`, `portfolio-rollup.js`: **zero hits.** No countersign, no `verifiedBy`, no dispute, no variance flag, no detector. And `firestore.rules:121–129` makes collections `allow read: if owner()` — **a second person literally cannot see a line in order to countersign it.** The trust story you'd be *selling* is the one thing the module doesn't do. | weeks | no, but it's the whole pitch |
| Tenancy inversion: operator as tenant, locations as children, location's share as residual, collector identity distinct from store staff, cross-location fleet view | weeks | YES |
| Every string rewritten in en **and** es — `i18n.js` is 4,445 lines, `tests/i18n.test.mjs` enforces key-set equality and no blank values, so a half-renamed product fails CI | days | no |
| No cross-tenant visibility (356 `vendorId` references across 50 files) if location owners should ever log in | weeks | no |

**Decisive risk:** you would rebuild ~80% of a product to enter a category with four-plus funded incumbents, a $1–$6/machine price ceiling, a consolidating buyer base shrinking 3.8%/yr, and a cash wedge being deliberately engineered to zero by the largest operator in the market. And the one thing the existing module *has* — a two-sided split with server-side recompute-from-contract — is the smallest part of the work.

### 2.4 Why this is good news

You just avoided a 4–6 month rebuild that would have ended in a market with a $69k realistic ceiling. Kill it cleanly, in writing, the way you killed settlement reconciliation in PR #125.

**One optional keeper, and only under a condition.** `buildPackAudit` in `src/lib/scratch-audit.js:43–49` already does exactly the shape an operator meter needs: pure per-unit sequence-continuity-gap detection between consecutive counts. Porting that to typed meter fields on the existing machine collection (prior reading carried forward, delta reconciled against counted cash, rollback flagged) is **~2–4 days** and would fix a real embarrassment: today the app *tells staff to type the meter into a note field where nothing checks it.*

**But do not build it speculatively.** `src/lib/features.js` ships `gaming: false` — it is the one module that defaults OFF. Build the meter fields only when a paying store customer who hosts machines asks for them. Not before.

---

## §3. Comparison against the baseline

| | **Baseline: hosted SaaS, ~$39/location** | **Path 1: POS marketplace** | **Path 2: route-operator** |
|---|---|---|---|
| **Time to first dollar** | Weeks — blocked only by a payment rail (days–2 weeks) | 4–6 months minimum (Clover review is unpublished, 3–4 month anecdotes, plus an annual code-freeze risk); Square is gated behind 5 paying sellers you don't have | 4–6 months of rebuild before a demo exists |
| **Ceiling** | 151,975 US c-stores, 63% at ≤10 stores. Even 200 locations = $93.6k ARR, direct, at full price | $27.30/location if Clover rails hold; Square rev-share unknowable pre-PIMA. Lifetime marketplace payouts across all Clover devs: "close to $8M" (undated) | $6.9M TAM at 100% capture of 14,801 shrinking firms; ~$69k ARR at 1% — and per-location pricing doesn't fit the buyer |
| **Effort** | Payment rail + entitlement gate. Nothing else is blocking. | Payment rail **plus** OAuth **plus** token vault **plus** webhook infra **plus** attested-baseline model **plus** rules/test amendments **plus** possibly an Android build target. Repeated per POS. | Payment rail **plus** location dimension **plus** meter module **plus** asset/contract entity **plus** payables & statements **plus** tenancy inversion **plus** countersign for collections **plus** full bilingual re-voicing |
| **Risk** | Sales risk — will store owners buy? Genuinely unknown, and cheap to test | Channel is unproven, terms are undated, approval is unpredictable, the platform may already ship your cash spine free, and you may lose the direct billing relationship permanently | Market is shrinking, price floor is $1–$6/machine, incumbents claim the feature, buyer pool just consolidated to one PE owner, and the meter may make your core control redundant |
| **Verdict** | **Do this** | **NO-GO** | **NO-GO** |

---

## §4. What to do next week, in order

1. **Ship a payment rail. Monday.** This is the actual blocker on the only viable path. `src/lib/billing.js` is a 54-line manual records layer and billing status **gates nothing** — only `vendor.status` suspend/activate cuts access (`api/auth/login/route.js:52–61`). Stripe Checkout + a webhook route + an entitlement gate wired to the existing suspend/activate switch is days, not weeks, because you already have the switch. **Nothing else on this list matters until you can accept $39.**
2. **Walk into five stores you can drive to.** Not email. Not a landing page. Bring the iPad, do a live shift count, quote $39/location. This simultaneously tests the business *and* — per §4.1 — answers the Clover/Square question for the only territory that matters.
3. **While you're there, ask each store what POS they run** and whether they've ever caught a clerk on a scratch-off gap. Five answers from your actual territory are worth more than every MCC estimate in this document.
4. **Send one email** to `developer-relations@devrel.clover.com` (30 minutes, free, non-committal). Two questions only: (a) can a Clover-listed app be free on the App Market while the merchant pays the developer a separate off-platform subscription? (b) are private apps permitted to bill merchants directly? Their answer resolves the §1.2 contradiction. File it; do not wait on it.
5. **Write the no-go down** in `CLAUDE.md`, in the same voice as the settlement and pack-lifecycle retirements. "Route-operator pivot: rejected July 2026 — meter/telemetry incumbents, $1–$6/machine price floor, shrinking operator base. Do not reintroduce." Future-you will otherwise re-litigate this.

Everything below the line — Android APKs, meter modules, OAuth handlers, Square applications — is **not next week's work.**

---

## §5. Open questions and the cheapest way to close each

| Question | Cheapest close | Cost |
|---|---|---|
| What POS do the c-stores *in your driving radius* actually run? | Ask them, during step 2 | $0, already doing it |
| Can a Clover-listed app bill off-platform? (§1.2 contradiction) | One email to developer relations | 30 min |
| Is the "close to $8M lifetime developer payouts" figure current or stale marketing? | Same email, third question | 0 extra |
| Is the Square five-seller gate real, and are unlisted production apps capped on connected sellers? | One post in the Square developer forums; the thread title cited in the research literally concerns "OAuth limits for unlisted/private production applications," implying limits exist | 20 min |
| Does Clover still ship Cash Track / Cash Log free? (evidence is a **2014** one-sheet) | Open the Clover App Market in a browser from an unblocked network and search | 5 min |
| Is CSI Works' lottery app actually *listed* on Clover today, or only on the vendor's site? | Same browser session; if there's no live clover.com listing, the lottery-precedent argument collapses and gambling-prohibition risk rises materially | 5 min |
| North America connected-vending penetration (Berg gives 58.1% globally, no NA rate) | **Don't.** Only matters if you reopen Path 2 | — |
| Do ATM route operators have an unserved accountability gap? | **Genuinely unresearched** — two legs flagged it as the top remaining unknown. Only worth a fresh pass if Paths 1 and 2 both die *and* the baseline fails | half a day, later |
| Are incumbent VMS cash records tamper-evident (append-only, signed, countersigned)? | The make-or-break axis for Path 2's differentiation — **unresolved**. Irrelevant unless reopening | — |

Re-running any of this requires a session with working egress. Every external fact above came through search-result extraction under a 403 policy denial; the verification pass had no external access at all and could confirm only the on-disk findings.

---

## §6. What NOT to do

- **Do not list on Clover or Square.** Neither is a channel for you. Square structurally can't be (five-seller gate); Clover's terms likely cost you the direct billing relationship for a marketplace whose lifetime payouts to all developers are advertised as ~$8M.
- **Do not build a Clover Android APK.** It's a new build target for a product that has no customers on Clover.
- **Do not import POS numbers into the `entries` log.** `commitBaselines` in `api/import/route.js` already shows the shape of that mistake — Admin-SDK writes with a human's `by`/`byId`/`byRole` and a server `new Date()`, bypassing `ts == request.time` and the signer check. A machine number wearing a human signature destroys the one claim the product is built on. If POS data ever lands, it lands as a separate attested-source baseline.
- **Do not build the route-operator product.** Not vending, not gaming, not laundry, not car wash. Car wash isn't even a route business.
- **Do not build meter fields speculatively.** `features.js` ships `gaming: false`. Build it when a paying customer asks.
- **Do not rename the i18n catalog for an operator voice.** 4,445 lines, CI enforces key-set parity across en/es, and it's in service of a product you're not building.
- **Do not pay for IBISWorld, NAMA census data, or a market report** to firm up Path 2 numbers. The path is dead on structure — better data won't revive a $6.9M TAM against a $1/machine price floor.
- **Do not wait on anyone's approval queue.** Not Clover's, not Square's, not Gilbarco's. Every one of them is a multi-month unknown, and none of them is between you and your first $39.