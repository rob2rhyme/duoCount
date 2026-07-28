---
title: Distribution decision (2026)
---

# DuoCount — Distribution Decision Document
**Prepared 2026-07-28.** All external claims carry a source URL and a source date. Where the research could not verify something, it says so and says how to resolve it.

---

## 1. Bottom line

**Run DuoCount yourself as a hosted SaaS. Do not build a CodeCanyon submission package.**

CodeCanyon is closed at the gate, not at the quality bar: Envato is not accepting new author applications and states it does **not plan to reopen inbound applications for the Code category** ([help.author.envato.com, art. 53981083605913](https://help.author.envato.com/hc/en-us/articles/53981083605913-Author-applications-are-temporarily-closed), live 2026-07-28). Unless you already hold a pre-spring-2026, ID-verified author account with CodeCanyon upload enabled, option (a) is unexecutable at any item quality, with no compliant workaround.

Even with that account, authors now keep **50% of item price** (down from up to 87.5%), and a Next.js + Firebase app gets shelved in the thin JavaScript category, not PHP Scripts where the buyers are.

Good news: **exclusivity was abolished 1 July 2026**, so nothing you choose forecloses anything else.

### The decision in one table

| Path | Open today? | Realistic 12-month revenue | Work required before first dollar | Verdict |
|---|---|---|---|---|
| **(a) CodeCanyon / Envato** | **No** for new authors — Code intake closed, no reopening planned | $0 (blocked) → if you already have an account: **$1–6k/yr gross**, halved by the 50% author fee | 3–4 weeks (docs build, demo, previews, license swap, packaging) | ❌ **Do not pursue.** Hold as a cheap option if intake reopens |
| **(b) Own SaaS to local stores** | Yes | **$3.5k–18k ARR** at 10–50 locations × $29–49/mo | ~2 weeks (demo instance, signup toggle, install/ops docs, billing) — most of it dual-purpose | ✅ **RECOMMENDED — primary** |
| **(c) Direct source/template sale** | Yes (own site + Lemon Squeezy/Paddle) | **$0–4k/yr** unless you already have an audience; ~0 organic traffic | Same package as (a) minus Envato-specific presentation | ⚠️ **Secondary, opportunistic only.** Answer inbound; don't build a funnel |
| **(d) White-label / per-chain licence** | Yes | **$2–10k setup + $200–800/mo** per chain or distributor, 1–3 deals plausible | Sales work, not build work; needs (b)'s demo anyway | ✅ **Best upside per hour — pursue in parallel with (b)** |

The single most valuable artifact for **(b)**, **(c)** and **(d)** is the same thing: **one seeded, public, credentialed demo instance.** Build that first regardless of which path wins.

---

## 2. Is CodeCanyon even open, and is it appropriate?

### 2.1 Open? No.

| Fact | Source | Date | Confidence |
|---|---|---|---|
| "Applications to become an Envato Author are currently closed while we improve our intake process. There is no confirmed reopening date yet." | [help.author.envato.com art. 53981083605913](https://help.author.envato.com/hc/en-us/articles/53981083605913-Author-applications-are-temporarily-closed) | live 2026-07-28 | verified |
| Envato "doesn't plan to reopen inbound applications for Theme, **Code**, Photo, Audio, or Graphics categories (with the exception of Animated Graphics and Fonts, which will open later in 2026)" — qualified as "subject to change based on subscriber demand and content priorities" | same | live 2026-07-28 | verified |
| Reopening intake, when it happens, is a "selective intake model" covering Video, 3D, Animated Graphics, later Fonts. Code is not on that list. | [How to Join and Sell on Envato](https://help.author.envato.com/hc/en-us/articles/360000424443-How-to-Join-and-Sell-on-Envato) | live 2026-07-28 | verified |
| While paused, **existing** authors also cannot apply to add new content types/categories — so a Graphics author cannot add a Code item | same art. 53981083605913 | live 2026-07-28 | likely |
| Closure is **not** a phase-out: existing authors in closed categories keep selling and keep uploading | same | live 2026-07-28 | likely |
| Closure date reported inconsistently: March 2026 (CodeCanyon/ThemeForest specifically) vs mid-April 2026 (all categories) | [therepository.email](https://www.therepository.email/envato-ends-exclusive-author-model-moves-all-marketplace-sellers-to-flat-50-revenue-share) | May 2026 | likely |

**Research limitation, stated plainly:** every Envato help page above returned **HTTP 403** to direct fetch from this environment (Zendesk blocks the proxy). The quotes are verbatim strings surfaced through the search index of those primary pages, reproduced across two independent queries. Nobody rendered the page. Help articles are undated, so I cannot rule out that some rules quoted later in this document are stale text Envato no longer enforces.

**Your one-minute action:** log in at envato.com with any account you may already hold and check whether the CodeCanyon upload form is enabled. Do **not** "try to apply" — applications are closed and the attempt returns nothing. If you do not already hold a pre-closure Code-category account, option (a) is over. Buying or renting an account breaches the Author Terms and risks termination plus forfeiture of earnings.

The only stated path in for a new author is a **targeted outbound invitation** Envato says it may extend to specific categories ([Becoming an Envato Author: How to apply](https://help.author.envato.com/hc/en-us/articles/57391878017817-Becoming-an-Envato-Author-How-to-apply), live 2026-07). There is no published way to request one and no evidence Code has received any. One email to author support costs nothing; do not plan around it.

### 2.2 Appropriate? Marginally, at best.

- **Category mismatch.** Every successful multi-tenant retail SaaS comparable is Laravel/PHP and lives in PHP Scripts: Acculance SaaS ([item 40577294](https://codecanyon.net/item/acculance-saas-multitenancy-based-pos-accounting-management-system/40577294), v4.0.2 published 2025-08-31), Stockifly SAAS (item 40754384), LeadHub (item 63311759, Laravel 13), Slotara ([item 63704666](https://codecanyon.net/item/slotara-appointment-booking-scheduling-saas-platform-multitenant-laravel-12-filament-5/63704666), v1.5.0 shipped 2026-06-29). CodeCanyon has **~3,600+ PHP scripts** but only **~65 Next.js items marketplace-wide, ~29 Next.js JavaScript templates, ~48 "react saas" items** ([codecanyon.net/search](https://codecanyon.net/search/next%20js), live 2026-07). DuoCount would be structurally mis-shelved away from its buyers.
- **No category exists for what this is.** The Next.js requirements page sits under **Jamstack**, framed around static site generation and "pages … must be independent of any external server" ([Jamstack Requirements: Next.js](https://help.author.envato.com/hc/en-us/articles/7583521740569-Jamstack-Requirements-Next-js)). A stateful multi-tenant app with 21 API routes and a live database does not fit that framing. **Unresolved:** the page body could not be retrieved, so I cannot tell you which category a server-rendered Next.js app is supposed to be filed under. There is no Node.js-app category.
- **Marketplace direction.** Envato itself wrote, in justifying the July 2026 restructure: *"Envato Market has faced challenging market conditions for some time as industry dynamics, technology shifts, and customer preferences have evolved… The current tiered exclusive model is no longer the right fit"* ([author.envato.com hub](https://author.envato.com/hub/changes-to-envato-market-revenue-share-and-exclusivity-what-you-need-to-know/), May 2026). Add: forums shut 15 Aug 2025; the Elements WordPress plugin killed without warning 21 Aug 2025; Envato Studio shut; Elements restructured into AI-generation tiers Feb 2026. Shutterstock acquired Envato for ~$245M in 2024 and its investor narrative is subscription creative assets ([PR Newswire, 2024-05](https://www.prnewswire.com/news-releases/shutterstock-enters-into-definitive-agreement-to-acquire-envato-featuring-envato-elements-the-unlimited-creative-content-subscription-302134019.html)); code authors do not appear in it. The Getty–Shutterstock merger **terminated** — Getty's board declined the CMA-supervised sale on 2026-06-30 and the agreement lapsed 2026-07-06 ([SEC 8-K/10-Q](https://www.sec.gov/Archives/edgar/data/0001898496/000162828026033481/gety-20260331.htm)), so ownership has not changed again.
- **No shutdown is announced.** Third-party "Stage 1 of Envato Market's shutdown" commentary is a competing marketplace's forum speculation ([forum.wpbay.com](https://forum.wpbay.com/t/stage-1-of-envato-markets-shutdown-has-begun/209)), not an Envato statement. Treat it as sentiment, not fact.

### 2.3 Your own repo needs correcting

`/home/user/duoCount/docs/distribution-analysis.md` §4 currently recommends "Self-host template (Envato/CodeCanyon)" as "likely the strongest distribution channel for this codebase" and ranks it **#1**. That was written against a marketplace state that no longer exists — both the intake closure and the flat 50% fee post-date it. **Revise or delete that section**, or you will re-derive the wrong plan in six months.

---

## 3. Licensing mechanics: can you sell source *and* run the SaaS?

**Yes — and as of 1 July 2026 this is unambiguous.**

> "…on a **non-exclusive basis**, which means you retain the ability to sell your items on other websites, platforms or services."
> — [Proposed amendments to Market Author Terms, May 2026](https://help.author.envato.com/hc/en-us/articles/57607655372185-Proposed-amendments-to-Market-Author-Terms-May-2026), effective 2026-07-01

The exclusive/non-exclusive distinction is abolished entirely. Listing on CodeCanyon no longer blocks selling on your own site, on a competing marketplace, or running the identical code as your own paid SaaS. Any advice assuming an exclusivity penalty is obsolete.

### 3.1 The real licensing decision is Extended, not exclusivity

Envato's line is drawn at **payment, not multi-tenancy**:

> "If your SaaS is free to access, a Regular License is fine, but if users can/must pay to access in any way (e.g. a Pro/Premium version), an **Extended License** would be required."
> — [Can I use Envato Market items in a SaaS product?](https://help.market.envato.com/hc/en-us/articles/42955865046297-Can-I-use-Envato-Market-items-in-a-SaaS-product), live 2026-07

Regular License: the end product "must be distributed free of charge to end users… **You can't Sell the End Product except to one client**" ([codecanyon.net/licenses/terms/regular](https://codecanyon.net/licenses/terms/regular)).

Extended License: "You are licensed to use the Item to create **one single End Product** for yourself or for one client (a 'single application'), and the End Product **may be Sold**" ([codecanyon.net/licenses/terms/extended](https://codecanyon.net/licenses/terms/extended)).

### 3.2 The cannibalisation risk, stated honestly

DuoCount is **single-deployment multi-tenant**. One installation serves unlimited stores. Therefore:

**One Extended License sale legally entitles that buyer to run the identical application, as a paid competing SaaS, for unlimited stores, forever, with no ongoing payment to you.**

That is not a loophole — it is exactly what "one single End Product… may be Sold" means when the End Product is itself a multi-tenant platform. Your $50–200 Extended sale is worth, to a competent buyer, whatever your entire SaaS business is worth.

Three mitigations, in order of practicality:

1. **Do not offer the Extended License at all.** Offering it is *opt-in* for the author ([Opting in to the Extended License](https://help.author.envato.com/hc/en-us/articles/360000472683-Opting-in-to-the-Extended-License)). Regular-only means buyers may deploy for their own store(s) but may not resell access. This is the correct default for a multi-tenant product and it costs you the buyers who were going to compete with you anyway.
2. **Price the Extended at multi-tenant value**, not marketplace convention — $499–1,500 rather than 4× the Regular. A buyer who genuinely wants to run a competing SaaS in another region is a fine customer at that price.
3. **For direct sales (option c) you write your own EULA** and are not bound by Envato's licence text at all. Use a per-deployment or per-location licence with a term, not a perpetual multi-tenant grant.

**None of this matters if you never sell source.** The clean version of the strategy is: run the SaaS, sell source only under a bespoke negotiated white-label agreement (option d), and never list a $50 Extended License anywhere.

### 3.3 Your own LICENSE file is currently a liability

`/home/user/duoCount/LICENSE` says: *"No license, right, or permission is granted to use, copy, modify, merge, publish, distribute, sublicense, or sell copies of this software"* — and then ends with a block literally headed:

> `NOTE (remove before release): This is a conservative "all rights reserved" default…`

Shipped as-is in any paid archive this simultaneously tells the buyer they have rights and that no permission is granted, and it displays an unfinished-work marker to a paying customer. The copyright holder is the string "DuoCount", not a legal entity. **Fix before any distribution of source, and set the real entity name.** (This item's adversarial review was truncated in the input I was given; I present it at its originally stated **medium** severity. The factual claim is re-verified directly against the file.)

### 3.4 Dependency licensing: clean, verified, no action needed

All 11 runtime dependencies are MIT or Apache-2.0. Across 1,182 installed packages: 887 MIT, 136 Apache-2.0, 90 ISC, 27 BSD-3, 13 BSD-2, 10 BlueOak. **Zero GPL/AGPL/BSL/SSPL/Elastic/Commons Clause** in the shipped path, confirmed twice (declared-licence enumeration plus a literal text scan of all 1,210 LICENSE/COPYING/NOTICE files). No tracked font files. No stock photography — the 22 PNGs are all your own monogram, and PNG chunk streams carry no tEXt/iTXt/eXIf provenance markers. The three SVG diagrams are original and self-contained. `marketing/index.html` makes zero external network requests.

This is the best-case outcome for a code item and it is the result of a deliberately small dependency list. The one flagged exception is `sharp`'s transitive prebuilt binaries carrying LGPL — relevant only if you ship a binary distribution.

---

## 4. The economics

### 4.1 Envato's split, current as of 1 July 2026

- Flat **50% author fee** for all authors, all marketplaces. Previously: exclusive tiers up to 87.5% retained; non-exclusive 55% fee. ([author.envato.com hub](https://author.envato.com/hub/changes-to-envato-market-revenue-share-and-exclusivity-what-you-need-to-know/), May 2026; first reflected in the 2026-08-15 payout.)
- **List Price = Item Price + Fixed Buyer Fee.** The 50% is charged on **item price only**. Envato's worked example: item price $1 → list $2 → author earns $0.50. ([Fixed Buyer Fees](https://help.author.envato.com/hc/en-us/articles/360000473203-Fixed-Buyer-Fees-on-Envato-Market), undated)

### 4.2 What the niche actually earns

The only comparable with visible numbers: **Stocky POS** ([item 31445124](https://codecanyon.net/item/stockyultimate-inventory-management-system-with-pos/31445124)) — Regular License **$29**, **~2,400 sales**, 203 reviews, 4.90/5, snapshot 2026-07-25, live since 2021.

| Line | Figure | Assumption |
|---|---|---|
| Gross list revenue, ~5 years | ~$69,600 | 2,400 × $29 |
| Item price (net of fixed buyer fee) | ~$25–27/sale | buyer fee $2–4, category-dependent, not verified for JavaScript |
| Author share at today's 50% | ~$12.50–13.50/sale | flat rate, post-2026-07-01 |
| **Author earnings, 5 years, at today's rate** | **~$30–32k** | — |
| **Per year** | **~$6k** | steady-state assumed; actual sales curve unknown |

That is a **top-performing** item in the exact niche, sitting in the busy PHP Scripts category, accumulated over five years. DuoCount would be a new listing, in the thin JavaScript category, with no review history, in a marketplace whose own operator describes conditions as "challenging." **A realistic first-year expectation is $500–3,000 gross, against 3–4 weeks of packaging work and an ongoing 6-month support obligation per buyer.**

Prices for Acculance SaaS, Stockifly, LeadHub and Slotara were not visible in search results — **unresolved.** They are directly checkable on the item pages and would firm up the ASP ceiling if you ever revisit this.

### 4.3 The obligations that come attached

- **Item Support:** 6 months included in list price, extendable by the buyer to 12 max ([Item Support Policy](https://codecanyon.net/page/item_support_policy)). You must "answer technical questions about features and functionality and assist in fixing issues," including for bundled third-party assets. You are **not** required to install, customise, or help with hosting or third-party software ([Item Support Best Practices](https://help.author.envato.com/hc/en-us/articles/360000471703-Item-Support-Best-Practices)) — which means every Firebase/Vercel/Resend ticket is formally out of scope and practically unavoidable.
- **Minimum obligations, supported or not:** items "must work as described, be protected against major security concerns, have version upgrades (at your discretion), and be kept up to date."
- **Refunds:** claimable up to **180 days** for supported CodeCanyon items, 30 days for unsupported, where the item does not work as described ([Refund Policy](https://codecanyon.net/page/customer_refund_policy)).

### 4.4 Direct sale (option c)

Merchant-of-record platforms (Lemon Squeezy, Paddle) handle VAT/sales tax and take roughly 5% + payment fees, so you net **~90–93%** versus Envato's 50%. The catch is entirely traffic: Envato's value was never the split, it was the buyers. You have no audience, no SEO surface (marketing/ is a single static page), and a US-convenience-store-specific vertical with essentially zero organic search volume. **Expect $0 unless someone finds you another way.** Price at **$249 single-store perpetual / $999 multi-location**, not $29 — you are not competing on a marketplace shelf, and low prices attract the highest-support buyers.

### 4.5 Own SaaS (option b) — the recommended path

Your own `docs/positioning-one-pager.md` proposes **~$29/location/month** (Pro tier: unlimited drawers and history, blind counts, variance flags, disputes, EOD PDF, daily digest), anchored at "less than half of LottoShield's entry price" and "roughly 7% of the average store's annual lottery shrink."

| Locations | MRR @ $29 | MRR @ $49 | ARR @ $39 blended |
|---|---|---|---|
| 5 | $145 | $245 | $2,340 |
| 10 | $290 | $490 | $4,680 |
| 25 | $725 | $1,225 | $11,700 |
| 50 | $1,450 | $2,450 | $23,400 |

**Costs, per the research:** Vercel Pro ~$20/mo (Hobby is documented as personal, non-commercial use only — you would be in breach running a paid product on it); Firebase Spark free within quota, Blaze pay-as-you-go beyond it; Resend free to 3,000 emails/month, 100/day, one verified domain; domain ~$12/yr; Anthropic optional.

**The number you do not have and must get:** actual Firestore reads/writes per active store per day. `firestore.rules` performs 7 `get(/databases/…)` lookups in helper functions (lines 22, 36, 238, 241, 337, 435, 443) and every rules `get()` bills as a document read; `AppShell.js:111-177` mounts ~15 concurrent `onSnapshot` listeners. **The original audit called this fatal to the free tier; that was overstated and its own author conceded it needs measuring.** Rules access-calls are cached and de-duplicated within a request (10 per document request / 20 per query), `onSnapshot` bills the initial snapshot then only changed documents, and a shift-count app has very low churn. Several listeners are role- or flag-gated. A store doing a few dozen signed counts a day plausibly sits well under the 50k/day Spark ceiling.

**Do this before you publish a price:** run the seeded demo for a week and read reads/writes per store/day off the Firebase usage dashboard. Put that number next to the $29 in the one-pager. If it is uncomfortable, the remedies are known (cache `sharingMode`/variance thresholds in token claims; scope always-on listeners to the active tab) — but do not do that refactor pre-emptively, because caching settings in claims trades a read for a stale-claim correctness bug, which is a worse defect in a trust product.

**A note on the pricing doc itself:** it is honest about its own limits — competitor prices are flagged "move fast — re-verify before anything printed," and the $29 is explicitly "proposed positioning, not a shipped price." Re-verify the competitor list before it goes anywhere public.

### 4.6 White-label / per-chain (option d) — best return per hour

A single 12-store franchise group at $29/location is $348/mo — larger than a year of realistic CodeCanyon earnings, from one conversation. A lottery-adjacent distributor or a c-store franchise operator paying $2–10k setup plus $200–800/mo is a plausible one-to-three-deal outcome, priced against theft losses rather than against software. Requires the same demo instance as (b) and zero packaging work.

---

## 5. Risk register

Severities below are **post-adversarial-review**. Where the original audit's severity was corrected downward, the correction is stated. Findings whose supporting claims were refuted have been dropped or narrowed accordingly. **"Envato rule?"** answers whether a documented Envato requirement is actually implicated — most of these are buyer-experience and support-cost issues, not rejection triggers, and the honest register says so.

| # | Risk | Severity | Envato rule? | Evidence | Fix | Effort |
|---|---|---|---|---|---|---|
| 1 | **Envato Code-category intake is closed** — no author seat, no submission | **Critical** (confirmed) | n/a — this *is* the channel | [art. 53981083605913](https://help.author.envato.com/hc/en-us/articles/53981083605913-Author-applications-are-temporarily-closed), live 2026-07-28: does not plan to reopen inbound Code applications | Check whether you hold a pre-closure account. If not, re-target everything at (b)/(c)/(d). Revise `docs/distribution-analysis.md` §4. Optional: email author support re. outbound invitation | hours |
| 2 | **No installation documentation, in any accepted format** | **High** (confirmed) | **Yes — the one requirement verified verbatim.** [Code Item Preparation](https://help.author.envato.com/hc/en-us/articles/360000471583-Code-Item-Preparation-Technical-Requirements) (updated 2026-03-25): docs must be ".pdf or HTML", "publicly accessible… not behind a purchase key gate", and "do not assume that the buyer… has any significant level of coding knowledge" | Install instructions exist only as 7 numbered lines at `README.md:105-123`. `docs/` has 33 files, none covering installation; `getting-started.md` (593 lines) starts *after* install. `ls docs/*.html docs/*.pdf` → empty. Zero app screenshots in the tree | Write `docs/installation.md`: ~25 steps, one screenshot per Firebase Console screen, plus the two steps README buries (publishing `firestore.rules`, deploying `firestore.indexes.json`). Add the slug to the existing `src/lib/docs.js` pipeline — your public deploy then satisfies both "HTML" and "publicly accessible" in one move — **and** export a standalone self-contained HTML into the zip. Front it with a "what you'll need and what it costs" table | days |
| 3 | **Open public store registration with no off switch** | **High** (confirmed) | No rule — but harmful in **every** distribution mode | `src/app/api/auth/signup/route.js` is unauthenticated; only guard is `SIGNUP_LIMIT = 5`/hour per IP (line 15), defeated by IP rotation. No toggle in `features.js` or `vendor-settings.js`. `PinLogin.js:107-108` renders the register link to every visitor. `firestore.rules` confirms the design intent | Add `SIGNUPS_OPEN`, **defaulting to `false`** in `.env.local.example` so the safe posture is what you get by doing nothing. Gate the PinLogin link off the same **server-provided** flag so the two cannot drift. Return 403 with a stable `code` so the existing `autherr.*` i18n layer renders it | hours |
| 4 | **Nothing can be evaluated without a full Firebase build** — no demo, no screenshots | **Medium** (*corrected down from high*) | No. [Item Presentation Requirements](https://help.author.envato.com/hc/en-us/articles/360000424863-Item-Presentation-Requirements): a live preview is "not required for other web or code item categories, but… strongly recommended." The claimed rejection does not follow — but it is the **#1 conversion blocker** for (b), (c) and (d) | `/api/seed/route.js:51` requires `requireOwner`; `scripts/import-demo-seed.mjs` needs a service-account JSON *and* a vendorId you can only get by signing up first. `README.md` contains zero URLs. No screenshots anywhere | Stand up **one seeded public demo instance** (own Firebase project, demo vendor, seeder run, PIN on the login screen, nightly reset cron). Put the URL in README line 1, the install doc, `marketing/index.html`. Capture 8–10 screenshots into `docs/screenshots/`. **Do not build a `DEMO_MODE` in-memory shim** — `src/lib/data.js` imports `firebase/firestore` directly with 155 call sites across 26 files and no DAL; faking `onSnapshot` semantics is weeks, and the hosted demo gives you the same result in an afternoon | days |
| 5 | **Config failures are silent to the end user** | **Medium** (*corrected down from critical*) | No | `src/lib/firebase-admin.js:13` throws untyped; `signup/route.js:92-94` and `login/route.js:103-105` only forward `e.message` when `e.status` is set, so a bad service-account key yields `{"error":"Signup failed."}`. `dev/route.js` calls `getAdmin()` at line 21 *before* the `DEV_ADMIN_EMAIL` check at line 36, making `dev_unconfigured` unreachable. **Correction:** both routes `console.error` the full error one line above — on Vercel that is one click into Function Logs, so this is not a blind outage, and the generic client message is a deliberate, commented security decision | Typed errors in `firebase-admin.js` (`.status=500`, `.code=config_missing\|config_unparseable\|config_not_a_key`, reusing the `client_email`/`private_key` check already written in `.github/workflows/deploy-firestore-rules.yml`). Move the `DEV_ADMIN_*` check above `getAdmin()`. Add an "If sign-in fails" README section pointing at Function Logs. **Do not** ship an unauthenticated `/api/setup-check` reporting project_id and which env vars are set — that is worse disclosure than the problem | hours |
| 6 | **Firestore index deployment is under-documented** | **Medium** (*corrected down from high*) | No | `firestore.indexes.json` declares 13 composite indexes; `README.md:116-118` offers CLI deploy or "wait for the console error link." **Corrections:** `firebase-tools ^15.23.0` is already a devDependency, so no global install is needed; and the supportTickets index *is* reachable from a client query (`data.js:197`), so the "server-log-only" claim was wrong — only the `/dev` status variant is server-side, and `/dev` is optional | Replace README step 6 with `npx firebase login` → `npx firebase use --add` → `npx firebase deploy --only firestore` (ships rules **and** indexes off the existing `firebase.json`, replacing step 5 too). Drop the "wait for the error" fallback from the happy path. Optional polish: catch `failed-precondition` in `src/lib/data.js` and render "This screen needs a database index — see installation step N" | hours |
| 7 | **755-line security rules must be hand-pasted, unverified** | **Medium** (*corrected down from high*) | No | `firestore.rules` is 755 lines; `README.md:115` is one sentence. Nothing checks whether rules are live. `.github/workflows/deploy-firestore-rules.yml` exists but is referenced nowhere in README or docs. **Corrections:** unpublished rules produce deny-all — every screen empty at once, an unmissable failure, not a silent security hole; and the "buyer picks test mode" scenario contradicts README step 2, which specifies production mode | Same one-command fix as #6, plus an "After updating DuoCount" line (re-run it) and a cross-reference to the Actions workflow. Build the in-app rules-liveness banner only for the SaaS path | hours |
| 8 | **Firebase cost per store is unmeasured** | **Medium** | No | 7 rules `get()` calls; ~15 concurrent listeners in `AppShell.js:111-177`. Neither README nor `.env.local.example` mentions quotas. **The "will not survive real use" headline is a prediction, not a measurement** — see §4.5 for the mitigating mechanics | One README paragraph (Spark fine for evaluation/one small store; Blaze expected for production; link Firebase pricing). **Measure** reads/writes per store/day before publishing any price. Defer the claims-caching refactor until measurement justifies it | days (mostly waiting) |
| 9 | **Cannot run on cPanel/shared hosting** | **Medium** (*corrected down from critical*) | No — CodeCanyon's own categories include JavaScript, HTML5, .NET and Mobile App Templates, none of which run on cPanel. This is a market-sizing fact, not a rejection criterion | `next 15.5.21`, 21 App-Router routes, `serverExternalPackages:["firebase-admin"]`, no Dockerfile, no `output: "standalone"`, no installer | One line, first in README and any listing: "Requires Node 20+ hosting (Vercel, Railway, Fly, or a VPS). Does **not** run on shared/cPanel hosting." **Skip the Dockerfile** unless a buyer asks — it adds a second deployment path to support for no submission benefit | trivial |
| 10 | **Resend needs DNS domain verification** | **Low** (*corrected down from medium*) | Disclosure only — a documented external API is exactly the dependency type Envato accepts | `src/lib/digest.js:191` posts to `api.resend.com/emails`; no SDK, no SMTP fallback; `.env.local.example:16` seeds a custom-domain sender. **Correction:** `.env.local.example:15` already says "verified sender," and the digest is opt-in per vendor, so no default install silently breaks | Document: create account → Domains → Add → 3 DNS records → wait for Verified → set `DIGEST_FROM`. Note free-tier caps. Surface Resend's actual error text in the Admin "Send test digest" toast (3 lines). **Skip the SMTP fallback** — a second client, a second code path, a second failure surface | hours |
| 11 | **Hosting plan and cron portability undocumented** | **Low** (*corrected down from medium*) | No | `vercel.json` declares the only scheduler (`0 10 * * *` → `/api/cron/digest`); README's Deploying section is Vercel-only with no plan requirement; `.env.local.example:19` asks you to invent `CRON_SECRET` with no generation guidance. **Correction:** the "Firebase will need Blaze" claim is unsupported — DuoCount uses no Cloud Functions or outbound-network Firebase services | Add a hosting/cost table and a portable cron one-liner: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/digest`. Add `openssl rand -hex 32`. Say "Spark is sufficient for a single store; Blaze only beyond quota" | trivial |
| 12 | **No `npm test` script; stale test count in README** | **Low** (*corrected down from medium*) | No — and reviewers reportedly do not install and run items at all, which is the premise of this audit's own #1 | `npm test` → `Missing script: "test"`. 45 `test:*` scripts, no `test` key. `node --test 'tests/*.test.mjs'` → 828 tests, 737 pass, 91 fail (emulator-dependent). `README.md:252` says the rules suite is "73 tests"; it is **90** | Fix 73 → 90 (first thing anyone spot-checks). Move `tests/rules.test.mjs` → `tests/rules/`, add `"test": "node --test 'tests/*.test.mjs'"` and `"test:all": "npm test && npm run test:rules"`. **Do not use `--test-skip-pattern rules`** — it filters by test *name*, not path, so it silently skips unrelated tests while still loading the emulator file. Add a CI workflow | trivial |
| 13 | **Internal business docs served publicly** | **Low** (*corrected down from medium*) | No | `src/app/docs/[slug]/page.js:11` calls `generateStaticParams()` off the unfiltered `docSlugs()`, so all four `INTERNAL` docs prerender and serve; `curl /docs/positioning-one-pager` → 200. **Correction:** `src/lib/docs.js:22-27` documents this as deliberate ("stay renderable at their direct URL… but NOT listed on the index or in search"), so it is a design choice you may disagree with, not an accidental leak | **Primary fix:** exclude `positioning-one-pager.md`, `competitive-gap-analysis.md`, `distribution-analysis.md`, `dev-console-roadmap.md` from any distributed archive. Secondary: export `publicSlugs()` (currently module-private) and use it in `generateStaticParams()`; `dynamicParams=false` is already set so unknown slugs 404 | trivial |
| 14 | **LICENSE is all-rights-reserved and contains a "remove before release" note** | **Medium** (as stated; *adversarial review truncated in input*) | Reviewers read licence files; and this contradicts whatever grant you sell | Verified directly: `LICENSE` grants no rights, then carries a `NOTE (remove before release):` block. Copyright holder is the string "DuoCount" | Replace with the licence matching your chosen channel; name the real legal entity. For direct sale, write a per-deployment EULA (see §3.2) | hours |
| 15 | **`/dev` platform console linked from the login screen** | **Low** (*corrected down from high*) | No | `PinLogin.js:166` renders `<Link href="/dev">` publicly. **Corrections:** `/dev` returning 200 proves nothing — `src/app/dev/page.js` is a client shell and every byte of data comes from `/api/dev` behind `requirePlatformAdmin`; an anonymous visitor sees a login form, like `/wp-admin` on every WordPress item. The console is **off by default** (`.env.local.example` ships both vars blank; `dev-auth.js:30` returns false if either is empty). **The "only PIN-recovery path" claim is FALSE** — `src/app/api/staff/route.js:152-172` lets an owner reset any user's PIN including another owner's; the real gap is narrow: a *sole* owner who forgets their own PIN | Hide the `/dev` footer link when `DEV_ADMIN_EMAIL` is unset (one env read). Move the `DEV_ADMIN_*` check above `getAdmin()` — same fix as #5, do it once. **Skip** the 404-instead-of-403 suggestion (theatre against anyone who can read the shipped source, and it destroys the operator's ability to distinguish "not configured" from "wrong password") and **skip** the boot-time password-entropy check. Document that a second owner is the PIN-recovery answer | hours |
| 16 | **Stale spec doc contradicts shipped product direction** | **Low** (new) | Presentation/accuracy | `docs/lottery-pack-lifecycle-spec.md` ships in the docs set, but `CLAUDE.md` states pack lifecycle was retired in PR #125 and must not be reintroduced. A buyer or prospect reading the docs will ask about a feature that does not exist | Remove or mark clearly as historical/retired | trivial |
| 17 | **Build artifacts in the working tree** | **Low** | Packaging hygiene | `firestore-debug.log` (513 KB emulator log) and `.next/` present. Both are `.gitignore`d (verified with `git check-ignore -v`) but would ride along in a naive zip | Build the archive from `git archive`, not from the working directory | trivial |

### Subjective rejection criteria that would actually bite (if the gate ever opened)

The mechanical hygiene bar is already comfortably passed: **zero `console.log` across 162 `src/` files, 2 TODO markers, 2 justified `dangerouslySetInnerHTML` uses, 737 pure tests passing in 2.4s, 90/90 emulator rules tests passing in 18.5s, a clean zero-config build (exit 0, 20.6s, 58 static pages, 6 ESLint warnings, no errors).** That is materially cleaner than a typical submission. The risks that remain are the judgement calls:

- **"Too similar to existing items."** *"If a new submission is too similar to items that are already available on the Envato Market, it will be rejected. To be accepted, items must be unique, or of a higher quality"* ([Common Rejection Factors for Code Items](https://help.author.envato.com/hc/en-us/articles/360000536823-Common-Rejection-Factors-for-Code-Items)). The retail/POS/inventory admin-panel genre is dense. 2026 author reports describe hard rejections within ~24 hours, no feedback, no resubmission, allegedly from automated fingerprinting rather than installation and testing ([Medium, 2026-03-10](https://medium.com/write-a-catalyst/codecanyon-in-2026-is-the-worlds-biggest-code-marketplace-already-dead-52fbba799295) — secondary, self-reported, **unverifiable**). Hard rejection is terminal: *"attempting to resubmit a hard rejected item(s) may result in revoked upload rights"* ([How to Get Your Items Through Review](https://help.author.envato.com/hc/en-us/articles/360000471923-How-to-Get-Your-Items-Through-Review-at-Envato)).
- **"Commercially viable / minimum utility."** A US-convenience-store scratch-off and cash-drawer counter is a narrow vertical for a global buyer base ([Item Quality FAQs](https://help.author.envato.com/hc/en-us/articles/360000471663-Item-Quality-FAQs)).
- **The no-JavaScript degradation rule.** *"If an item requires JavaScript to work, you must provide an operable degraded version as well."* Still published on the live rejection-factors page. A React 19 app structurally cannot satisfy it. **Unresolved whether this is enforced** — it reads as legacy text, and I could not see the page's last-updated date.
- **The JSLint requirement.** [NodeJS Category Requirements](https://help.author.envato.com/hc/en-us/articles/360000554583-NodeJS-Category-Requirements) demands strict mode, JSLint passage, camelCase, functions under ~100 lines. JSLint does not parse JSX. **Also likely stale, also unconfirmed.** Two published rules a modern React app cannot satisfy is itself the strongest signal that this marketplace is not built for your product.
- **Your strongest asset is invisible at review.** 90 executable Firestore-rules tests proving the tenant-isolation and append-only guarantees are the product's whole pitch — and a review process that reportedly does not install items will never see them. They must be carried entirely by the description, previews and demo. **This is true of every channel, not just Envato**, which is why the demo instance is the recommendation regardless.

---

## 6. Content and legal risk

### 6.1 Lottery / scratch-off

Your instinct is already correct and documented: `docs/legal-disclaimers.md` contains a "Not affiliated with any lottery, brand, or agency" section and a "sample/demo data is illustrative only" section that explicitly anticipates the brand-name question. **The demo data has not caught up to the disclaimer.**

Measured in the repo today: `demo-seed.json` contains **9 "Marlboro", 8 "Red Bull", 7 "Swisher"** occurrences; `src/lib/seed-data.js:68,71` seeds "Marlboro" and "Red Bull" directly. These are live third-party trademarks in a product you intend to distribute or host publicly.

**Action:** replace all trademarked product names in `seed-data.js` and regenerate `demo-seed.json` with generic equivalents ("Premium Cigarettes 100s", "Energy Drink 16oz", "Cigarillos 2-pack"). This is a 20-minute edit and it removes the entire category of risk. Nominative fair use would probably protect you, but "probably" is a bad trade against a free fix — and any trademark complaint on a hosted demo is a takedown, not a lawsuit.

**Also:** the app must never present itself as a lottery settlement or accounting authority. Your product direction already forbids that (settlement was retired on purpose; the shipped scope is opening-vs-closing ticket continuity). Keep the disclaimer prominent on the demo and in any listing: **DuoCount does not reconcile with, integrate with, or represent any state lottery.**

### 6.2 Employee monitoring

The time clock, schedule, punch records, incidents and countersigned counts are all employee-monitoring surfaces. What you have going for you, verified: **no geolocation anywhere** (`grep -rn -i "geolocation\|latitude\|coords" src/` returns nothing) — no GPS punch tracking, which is the single most regulated feature in this category and the one that draws BIPA/state-privacy attention.

**Disclose, do not change:**
- A "what this records about staff" section in `getting-started.md`/`-es.md` and in the sales material: punch times, counts attributed to a named user, countersignatures, incident records, PIN-based identity.
- A line in `terms-of-use.md` putting the notice-and-consent obligation on the store owner as employer, with a pointer that state law varies. `privacy-and-data.md` already correctly identifies the store owner as data controller — extend that framing to employment records explicitly.
- If you ever add GPS punch, biometrics, or screenshot/keystroke capture, the legal profile changes completely. Don't.

### 6.3 Customer phone numbers (rewards)

Rewards are phone-number-keyed. Two things are already right: **no SMS in v1** (per your TCPA note in `CLAUDE.md`) and a `maskPhone()` helper at `src/lib/rewards.js:364`.

**Keep it that way, and disclose:**
- **Never add SMS** without an explicit written consent flow, records of consent, and opt-out handling. TCPA statutory damages are $500–1,500 per message. This is the highest-dollar legal risk in the entire product and it is currently zero. Adding "text your customers their balance" would be the single worst feature decision available to you.
- State in `privacy-and-data.md` exactly what is stored per customer (phone, points ledger, transaction linkage), the retention period, and the deletion path. The inactivity-expiry feature already touches retention — say so.
- The always-excluded legal base (tobacco/vape/alcohol/lottery/gift-cards/fuel) is a genuine compliance feature. **Say it in the marketing copy** — it is the kind of detail that signals to a store owner that you understand their world, and most competitors get it wrong.
- Confirm the store owner is the controller of customer data and that you (as SaaS operator) are a processor. That distinction determines who answers a consumer deletion request. Your privacy doc gets this right for staff data; make it explicit for customer data too.

### 6.4 AI egress

The Anthropic-powered features (digest narrative, natural-language log search, pattern narratives — `src/lib/digest-narrative.js`, `/api/log-search`, `/api/pattern-narrative`) are optional and off by default, gated on `ANTHROPIC_API_KEY` being present. `docs/ai-features-spec.md` and the disclosure strings in `i18n.js` exist.

**What must be true and disclosed:**
- **Exactly what leaves the building.** Write it out: which fields of which records are sent to Anthropic, whether store name / staff names / customer phone numbers are ever included, and whether anything is retained. If staff names or customer identifiers are currently in the prompt payloads, redact them before send — this is a small change now and an unwinnable conversation later.
- **Off by default, per-tenant opt-in, visible toggle.** Confirm a store owner must actively turn this on and can see that it is on. A trust product that silently ships store data to a third party has a contradiction at its centre.
- **Disclose in the listing/marketing**, not just in docs. Envato requires third-party service dependencies to be declared at submission; more importantly, a store owner buying a theft-prevention tool will ask.
- **Third-party API keys** are permitted but "not encouraged," and third-party calls should be "aggressively cached so further calls are not throttled" ([Code FAQs](https://help.author.envato.com/hc/en-us/articles/360000555346-Code-FAQs)). Applies if you ever list.

---

## 7. Submission playbook — **conditional, do not start**

**Precondition (step 0): you already hold a pre-closure Envato author account with CodeCanyon upload enabled.** If not, stop here; go to §8. If yes, everything below is real work — roughly **3–4 weeks** — and you should weigh it against the ~$500–3,000 first-year expectation in §4.2 before committing.

Ordered. Steps 1–8 are dual-purpose and worth doing for options (b)/(c)/(d) too; steps 9–13 are Envato-only sunk cost.

| # | Task | Effort | Dual-purpose? |
|---|---|---|---|
| 1 | Confirm the upload form is enabled for your account. Screenshot it. | 10 min | — |
| 2 | Replace `LICENSE`: real legal entity, licence matching the grant you sell, delete the "remove before release" block. Decide Regular-only vs priced Extended (§3.2). | 1 hr | ✅ |
| 3 | Strip trademarked brand names from `src/lib/seed-data.js`; regenerate `demo-seed.json` via `scripts/gen-demo-seed.mjs`. | 30 min | ✅ |
| 4 | Add `SIGNUPS_OPEN=false` default + server-flagged PinLogin link. | 2 hrs | ✅ |
| 5 | Typed config errors in `firebase-admin.js`; move `DEV_ADMIN_*` check above `getAdmin()`; hide the `/dev` link when unconfigured. | 3 hrs | ✅ |
| 6 | Add `"test"` / `"test:all"` scripts (move `rules.test.mjs` to `tests/rules/` — **not** `--test-skip-pattern`); fix README 73 → 90; add CI workflow. | 1 hr | ✅ |
| 7 | **Stand up the seeded public demo instance** — own Firebase project, demo vendor, seeder run, credentials on the login screen, nightly reset cron, "demo data — resets nightly" banner. | 1 day | ✅ **highest value on this list** |
| 8 | **Write `docs/installation.md`** — ~25 steps, screenshot per Firebase Console screen, `npx firebase deploy --only firestore` as the primary path, hosting/cost table, portable cron line, `openssl rand -hex 32`, Resend DNS walkthrough, "after updating" section. Wire into `src/lib/docs.js` **and** export standalone HTML. Capture 8–10 app screenshots into `docs/screenshots/`. | 3–4 days | ✅ |
| 9 | Write the item description: what it is, who it's for, the trust model, the **explicit** "Requires Node 20+ hosting — not shared/cPanel" line, and full third-party disclosure (Firebase, Vercel, Resend, optional Anthropic). | 1 day | partly |
| 10 | Produce item preview images and cover art. **Unresolved:** exact CodeCanyon code-item pixel dimensions could not be isolated; confirmed constraints are a **3:2 cover aspect ratio** and JPEG/PNG/SVG/GIF formats ([Item Presentation Requirements](https://help.author.envato.com/hc/en-us/articles/360000424863-Item-Presentation-Requirements)). Read the current spec on the upload form before producing final assets. | 1–2 days | partly |
| 11 | Add a root `CHANGELOG.md` with a real version history. | 1 hr | ✅ |
| 12 | Build the archive with `git archive`, excluding `.next/`, `firestore-debug.log`, and the four INTERNAL docs. Include full non-minified source, the standalone HTML documentation, `.env.local.example`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `demo-seed.json`. Under 2 GB (trivially). | 2 hrs | partly |
| 13 | Extract on a clean machine, follow your own install doc start to finish with no prior knowledge, and time it. Anything that makes you improvise is a defect. | half day | ✅ |

**What you upload:** one `.zip` containing full unminified source + `installation.html` + `.env.local.example` + Firebase config artifacts + sanitised demo seed; a public documentation URL (your deployed `/docs/installation`); a live demo URL with published credentials; the item description; the preview/cover images; and a decision on Extended License opt-in.

**What you get in return:** a 7–14 day review ([review times page](https://author.envato.com/market_review_times/codecanyon)), a 6-month per-buyer support obligation, a 180-day refund window, and 50% of item price. **Envato does not publish approval or rejection rates for CodeCanyon** and there is no credible published figure — you cannot compute an expected value here, only a downside.

---

## 8. If you run it as a SaaS — the recommended plan

### 8.1 Build order (roughly two weeks)

1. **The demo instance** (playbook step 7). Everything else sells off it.
2. **`SIGNUPS_OPEN` toggle** — you want signups *on* for your instance, but you need the flag so a prospect's trial tenant and your demo tenant are separable, and so a white-label buyer gets it off.
3. **Screenshots + a real landing page.** `marketing/index.html` is self-contained with zero external requests (verified) but has exactly one image, `daily-flow.svg`. It needs the 8–10 app screenshots, the demo link, and a pricing block.
4. **Measure Firebase cost per store** (§4.5). One week of demo traffic. Do this before you print a price.
5. **Billing.** Stripe Checkout + a per-vendor subscription status. The `/dev` console already tracks billing status and can suspend tenants — extend it rather than rebuilding. Keep the "Load sample data" seeder as your onboarding accelerator.
6. **Ops docs for yourself**: rules/index redeploy on update (`npx firebase deploy --only firestore` — the GitHub Actions workflow at `.github/workflows/deploy-firestore-rules.yml` already does this well and is currently referenced nowhere), Resend domain verification, cron secret rotation, `DEV_ADMIN_*` hygiene, backup/export procedure.
7. **Vercel Pro** ($20/mo). Hobby's non-commercial restriction makes running a paid product on it a terms breach.
8. **Redact PII from AI prompt payloads** (§6.4) before you enable AI features for any paying customer.

### 8.2 Pricing

Start at **$39/location/month**, not $29. Reasons: your own anchor is a lottery shrink figure measured in thousands per year; $29 signals "utility" while $39 signals "control"; and you can discount to $29 for the first ten stores as a founder rate, which is a better story than raising prices later. Annual at 2 months free. **No free tier** — free tenants in a trust product are pure Firestore cost with no conversion signal. Offer a **14-day trial with the sample-data seeder pre-run**.

Second SKU: **multi-location $99/mo up to 5 locations**, because the multi-store rollup and cross-location sharing are already built and franchise groups are your best customers.

Revisit the price only after step 4 tells you the cost per store.

### 8.3 First ten customers

They will not come from search. This is a walk-in, hand-installed business for the first ten:

1. **Stores you or your family already know.** Convenience-store ownership clusters by community and family network. The first three should be people who will take your call at 6am when something breaks.
2. **Lead with the scratch-off gap detector, not the feature list.** "Show me last month's opening and closing ticket numbers for your top ten packs and I'll tell you in ten minutes whether tickets went missing." That is a demo you can run on their real numbers in fifteen minutes, and it is the thing nobody else does.
3. **Install it for them.** All of it. Firebase project, rules, indexes, Resend, the lot. For ten stores this is a day of work each and it is the *entire* competitive advantage of option (b) over options (a)/(c) — the Firebase setup complexity that would be a per-buyer liability is a one-time cost you absorb once, on your own infrastructure, for all tenants.
4. **Spanish is a real edge.** Full en/es catalogs with a lockstep test rule, and a Spanish `getting-started-es.md`. In this vertical, staff-facing Spanish is not a nice-to-have. Lead with it where it applies.
5. **Distributors and jobbers.** The people selling these stores their cigarettes, their POS, and their lottery displays already have the relationship and the route. One distributor deal is worth thirty cold visits — and it is the natural on-ramp to option (d).
6. **Franchise/branded groups** (fuel-brand jobbers, regional c-store chains). One multi-store operator gets you 5–15 locations from one conversation.
7. **Ask every install for one referral,** immediately, while the first variance flag is still fresh. Theft-prevention has an unusually good referral dynamic because owners talk to each other about exactly this.

Target: **10 paying locations in 90 days.** That is ~$390 MRR — not a business yet, but it is the only signal that tells you whether to keep going, and it is a signal CodeCanyon would never have given you.

---

## 9. What not to do, and what you must answer yourself

### Do not

- **Do not build an Envato submission package before confirming you hold an account.** It is 3–4 weeks against a closed gate.
- **Do not buy, rent, or borrow an Envato author account.** It breaches the Author Terms and risks termination plus loss of all earnings.
- **Do not offer a $50 Extended License on a multi-tenant product.** One sale legally licences a competitor. Regular-only, or price the Extended at multi-tenant value.
- **Do not build a `DEMO_MODE` in-memory Firestore shim.** `src/lib/data.js` imports `firebase/firestore` directly across 155 call sites in 26 files with no data-access layer. Faking `onSnapshot` semantics is weeks of work that the hosted demo instance replaces in an afternoon.
- **Do not add an unauthenticated `/api/setup-check`.** An anonymous endpoint reporting project_id, present env vars and rules status is worse than the diagnostic gap it closes.
- **Do not add an SMTP fallback, a Dockerfile, or a boot-time password-entropy check** as "rejection-proofing." None is required by any rule; each adds a permanent support surface.
- **Do not pre-emptively refactor rules `get()` calls into token claims.** It trades a read for a stale-claim correctness bug — the worst kind of defect in a product whose value is that the numbers are trustworthy. Measure first.
- **Do not add SMS to rewards.** Zero legal risk today; $500–1,500 per message in statutory exposure the day you ship it.
- **Do not treat any single marketplace as the business.** Exclusivity is gone; the correct framing for Envato, forever, is "an additional top-of-funnel listing at a 50% take rate."

### Questions only you can answer

1. **Do you hold a pre-closure, ID-verified Envato author account with CodeCanyon upload enabled?** One minute to check. Every conclusion in §7 hangs on it.
2. **Are you willing to do support?** Options (b), (c) and (d) all mean phone calls from store owners. If the honest answer is no, none of these paths work and you should shelve the project rather than pick the least-support one.
3. **Do you have access to ten convenience stores through people who know you?** If yes, option (b) is straightforwardly the right answer. If no, (b) is a cold-sales business and the calculus changes.
4. **What legal entity owns this?** `LICENSE` names the string "DuoCount." Before you take money from a store or ship source to a buyer, that needs to be a real entity — for the copyright line, for the processor relationship in the privacy docs, and for liability.
5. **What is one location's actual Firestore cost per month?** Unmeasured. Everything in §4.5 is arithmetic until you have it.
6. **Would you sell the whole thing?** Nothing here evaluates an acquisition, but a working SaaS with 25 paying locations is a sellable asset in a way that a CodeCanyon listing never is. That asymmetry is another argument for (b).

### Still unresolved externally, and how to close it

| Gap | How to resolve |
|---|---|
| Exact author-application closure date (March vs mid-April 2026) | Read [art. 53981083605913](https://help.author.envato.com/hc/en-us/articles/53981083605913-Author-applications-are-temporarily-closed) directly in a browser — I got HTTP 403 from this environment and could not see last-updated dates on any Envato page |
| Whether the no-JS-degradation and JSLint rules are still enforced | Only answerable by submitting, which you likely cannot do. Treat as unknowable |
| Which category a stateful Next.js app is supposed to be filed under | The [Jamstack Next.js page](https://help.author.envato.com/hc/en-us/articles/7583521740569-Jamstack-Requirements-Next-js) body could not be retrieved. Read it if the gate ever opens |
| Whether items requiring buyer-provisioned third-party cloud accounts are permitted | **No prohibiting rule was found on any primary page — this is absence of evidence, not confirmation.** Firebase mobile templates are clearly accepted; a server-rendered SaaS with a mandatory managed backend is a different profile |
| Live prices/sales for Acculance SaaS, Stockifly, LeadHub, Slotara | Directly checkable on the item pages; would firm up the ASP ceiling |
| Exact CodeCanyon code-item preview image dimensions | Read the spec on the upload form before producing final assets. Confirmed: 3:2 cover ratio, JPEG/PNG/SVG/GIF |
| Whether Envato Market has an internal sunset date | Nothing official exists, and the forum closure removed the channel where it would surface first. Monitor help.author.envato.com and Shutterstock quarterly calls |

---

## Closing

The engineering is not the problem. Zero secrets across 72 commits, zero copyleft in 1,182 packages, 90/90 emulator-verified rules tests proving the trust boundary, a clean zero-config build, `.env.local.example` that is genuinely the best install artifact in the repo, no Firebase Storage dependency, no bundled fonts, no stock imagery, security headers with written rationale — this is a better-built codebase than most things that sell on CodeCanyon.

The problem is that the channel you were aiming at closed its door, halved its rate, and was the wrong shelf for this product anyway. That is not a verdict on DuoCount. Every hour spent on multi-tenancy, custom-claim isolation, the rules test suite and the demo seeder is the foundation of a hosted SaaS — none of it is wasted.

Build the demo instance. Install it in ten stores yourself. Revisit Envato only if it reopens Code intake, and only ever as a listing, never as the business.