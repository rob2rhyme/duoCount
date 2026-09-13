# DuoCount — Distribution & AI-Integration Analysis

**Status:** analysis only — no code in this item. **Partly superseded (Sept 2026):**
§4's marketplace recommendation is retired — see
[Distribution decision (2026)](/docs/distribution-decision-2026). A decision aid for how DuoCount
reaches more buyers (AI features, a static build, a WordPress path, other
packagings), each with effort, trade-offs, and a recommendation.

**Baseline.** DuoCount is a Next.js (App Router) + Tailwind + Firebase app:
client UI, a handful of server API routes (`/api/auth`, `/api/cron/digest`,
`/api/seed`) that use the Firebase Admin SDK, and Firestore security rules that
enforce the append-only, countersigned trust model. That server surface and the
existing daily email digest are the two hooks the options below build on.

---

## 1. AI integration

### 1.1 Where an LLM actually adds value

Ranked by value-per-effort and risk. Each reuses data the app already computes,
so none requires new data collection.

| # | Feature | What it does | Model tier | Risk |
|---|---------|--------------|-----------|------|
| 1 | **Digest narrative** | Turn the existing daily digest's aggregates into 2–3 plain-English sentences + "what to watch tomorrow" | Haiku / Sonnet | Low — already server-side aggregated |
| 2 | **Natural-language log search** | "Sam's shorts over $10 last month" → the Log's existing filter object (type/who/drawer/status) | Haiku | Low — output is a filter, not prose about people |
| 3 | **Pattern narratives** | Render the computed `detectPatterns` signals as readable, non-accusatory prose | Haiku / Sonnet | Low |
| 4 | **Variance-note assist** | Draft a neutral cause-code + note for a flagged entry; the manager edits before saving | Sonnet | Medium — touches personnel judgement |
| 5 | **Incident write-up assist** | Expand a manager's bullet points into a factual, neutral write-up draft | Sonnet / Opus | Medium — personnel record |

Features 4–5 draft text a human always reviews and edits before it's committed —
they never auto-write to the append-only log.

### 1.2 How to build it on the Anthropic API

- **Server-side only.** Call the API from a Next.js route (the same pattern as
  `/api/cron/digest`), never the browser — the API key must never ship to the client.
  Use the official `@anthropic-ai/sdk` (this is a JS/TS project). This slots
  directly into the existing `src/app/api/**` + `firebase-admin` architecture.
- **Model choice** (current model IDs / list price per million tokens):
  - `claude-haiku-4-5` — **$1 in / $5 out**, 200K context. The default for the
    cheap, high-volume tasks: search-intent parsing, classification, pattern
    prose.
  - `claude-sonnet-5` — **$3 / $15** (intro **$2 / $10** through 2026-08-31).
    For higher-quality summarization and draft-writing (features 1, 4, 5).
  - `claude-opus-4-8` — **$5 / $25**. Reserve for the highest-stakes drafting
    where quality matters more than cost.
  Start on Haiku for 1–3 and Sonnet for 4–5; move a feature up a tier only if
  output quality warrants it.
- **Structured outputs** for anything that feeds code — NL-search → a validated
  filter object, and incident classification → an enum — via
  `output_config: { format: { type: "json_schema", schema } }` so the response
  parses deterministically.
- **Prompt caching** for the stable system prompt + schema/instructions prefix
  (large and identical across calls, especially the once-a-day digest): mark it
  with `cache_control` so repeated calls read the prefix at ~0.1× instead of
  full price. Minimum cacheable prefix is model-specific (~1–4K tokens).
- **Streaming** for the longer drafts (features 4–5) so the UI shows progress.

### 1.3 Cost

These are lightweight NL tasks on small inputs, so cost is close to noise. Rough
per-run estimates at list price:

| Feature | ~Input tok | ~Output tok | Model | ~Cost/run | Cadence | ~$/vendor/mo |
|---|---:|---:|---|---:|---|---:|
| Digest narrative | 2,000 | 250 | Haiku | $0.003 | daily | ~$0.10 |
| NL log search | 1,500 | 150 | Haiku | $0.002 | per query | cents |
| Variance-note assist | 1,500 | 300 | Sonnet | $0.006 | per flag | cents |

Even a busy multi-location vendor lands in the low single-digit dollars per
month before prompt caching. Cost is not the constraint here — **privacy is.**

### 1.4 Privacy & trust (the deciding factor)

DuoCount's whole positioning is "every number has a name; nothing is edited
after the fact." Sending the log — which contains employee names, cash amounts,
and incident (personnel) records — to any third-party API is a genuine trust
decision, not a technical afterthought. Guardrails, in order:

- **Opt-in per vendor**, owner-controlled (a Business setting), **off by
  default**. Never silently enable.
- **Send aggregates, not raw PII, wherever possible.** The digest narrative can
  run on the already-computed day totals; redact or pseudonymize names/IDs for
  search and pattern prose (map "Sam Rivera" → "employee A" on the way out,
  restore on the way in).
- **Server-side only**, so raw data never transits the client, and the key is
  never exposed.
- **Document data handling** plainly in-product and pick the retention posture
  that matches the promise (e.g. zero-data-retention where the workload allows;
  note that the most capable tier, Fable 5, requires 30-day retention and so is
  a poor fit here — Haiku/Sonnet are the right tiers anyway).
- **Human-in-the-loop** for anything written to the record (features 4–5).

### 1.5 Recommendation

Ship **the digest narrative first** (feature 1): highest value, lowest risk (it
already runs server-side on aggregates), and it extends a feature that exists.
Gate it behind an owner opt-in with a clear data-handling note. Then add
**NL log search** (feature 2) with name-pseudonymization. Hold features 4–5 until
the opt-in/consent UX is proven. Write it up as its own `ai-features-spec.md`
when it graduates from analysis to build.

> **Graduated to a build spec:** the digest narrative is now specified
> end-to-end in **`ai-features-spec.md`** (integration point in `digest.js`,
> Haiku + structured-output + prompt-caching API design, privacy guardrails,
> additive failure handling, tests, phasing). Still analysis/design only — no
> application code — but ready to pick up.

---

## 2. Static HTML recreation

A backend-less build — hand-written HTML/CSS/JS with canned data.

- **Good for:** a marketing landing page, a ThemeForest/Envato preview, an
  offline "click-through" demo, and fast screenshots. The installable PWA, the
  print-forms, and the demo-seed screenshots already give most of the raw
  material.
- **What you lose:** no real auth, no Firestore rules, no live data — so it can
  only ever be a *shell*. Keeping it in sync with the real app is ongoing cost.
- **Effort:** low for a landing page; medium for a convincing canned-data
  click-through (re-skin the real components with static fixtures, like the
  temporary layout-audit harness did).
- **Recommendation:** build a **static marketing/landing page** and a **single
  canned-data demo screen**, not a full static clone. Don't maintain a parallel
  static app — point buyers at a live demo vendor seeded with the demo data
  instead (that's cheaper to keep honest).

---

## 3. WordPress version

Three distinct paths — don't conflate them:

- **(a) Marketing site on WordPress** — WP for the brochure/landing/pricing/blog,
  linking out to the real app. **Low effort, low risk, recommended.** WP is a
  fine CMS; it just isn't where the counting logic should live.
- **(b) WordPress plugin that reimplements counts in WP + MySQL** — a full port
  of drawers/scratch/inventory into PHP + MySQL. **High effort, high risk, not
  recommended.** You would rebuild the entire trust model (append-only,
  countersigned, tenant-isolated) on a stack that doesn't enforce it the way
  Firestore rules do — the core product promise would regress. Only revisit if a
  concrete buyer segment is WP-locked and accepts the weaker guarantees.
- **(c) Headless / embed** — WP for content, the Next.js app embedded via iframe
  or linked SSO. **Medium effort**; reasonable if a customer already lives in WP
  and wants a single front door. Keeps the trust model where it belongs.
- **Recommendation:** do **(a)** for reach; consider **(c)** only on real
  demand; **avoid (b)**.

---

## 4. Other packagings

- **Self-host template (Envato/CodeCanyon).** ~~Likely the strongest distribution
  channel for this codebase.~~ **SUPERSEDED — do not act on this bullet.** Envato
  closed Code-category author intake and states it does not plan to reopen it, and
  all authors moved to a flat 50% revenue share on 1 July 2026; separately, one
  Extended License on a single-deployment multi-tenant product legally entitles the
  buyer to run it as a competing paid SaaS. See
  [Distribution decision (2026)](/docs/distribution-decision-2026) for the evidence
  and the replacement recommendation, and
  [Monetization paths (2026)](/docs/monetization-paths-2026) for why POS
  marketplaces and a route-operator pivot were also rejected. The packaging
  observations below still hold if the channel ever reopens: a clean README, an env
  template, one-command setup, and the demo seed as the "try it" path. (Most
  marketplaces disallow bundling paid third-party keys, so any AI features ship
  **off by default**, bring-your-own Anthropic key.)
- **Hosted multi-tenant SaaS.** The multi-tenant model already exists (vendors /
  locations / rules keyed on claims). Productizing hosting (billing, onboarding,
  a status page) is a **business** effort more than an engineering one — the app
  is most of the way there.
- **Native app shell.** The PWA is now installable (see `pwa-spec.md`), which
  covers most "on my phone" needs for free. If an app-store listing is required,
  a thin Capacitor/wrapper around the same web app is **low effort** — don't
  rewrite native.

---

## 5. Recommended sequence

1. **Self-host template polish** (§4) — highest distribution leverage, reuses
   everything, and the demo seed is the "try it" hook.
2. **Marketing: static landing page + WordPress brochure** (§2, §3a) — cheap
   reach; link to a live seeded demo rather than a static clone.
3. **AI: digest narrative, opt-in** (§1.5) — a differentiated, genuinely useful
   feature at negligible cost, once the privacy opt-in is in place.
4. Everything else (WP embed, native shell, AI features 2–5, hosted SaaS) on
   real, expressed demand.

Nothing here requires abandoning the current stack; each option builds on the
server routes, the trust rules, the PWA, and the demo seed that already exist.
