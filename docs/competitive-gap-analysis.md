---
title: Competitive gap analysis & UX enhancement plan
---

# DuoCount — Competitive Gap Analysis & UX Enhancement Plan

*Prepared 2026-07. Synthesized from the DuoCount feature inventory, the internal
positioning one-pager, a live-app UX review, and web research on lottery / c-store
/ cash / workforce competitors and real operator pain points, then adversarially
re-checked. **Caveat:** the competitor facts below come from web research — treat
specific prices and feature claims as directional and re-verify before any
external use (same caution as `positioning-one-pager.md` §Sources).*

---

## 1. Who we actually compete with

The field is wider than the named apps:

- **The status quo** — a paper spiral notebook, a Google Sheet, and the store
  WhatsApp group. This is what most small operators use today and what DuoCount
  must displace. The pitch has to beat *"good enough and free,"* not just the
  branded tools.
- **Free incumbent POS bundles** — **NRS (National Retail Solutions)** is a *free*
  POS saturating the independent/bodega demographic with cash back-office +
  lottery baked in; and the POS the store already owns (Gilbarco Passport,
  Verifone Ruby/Commander, Clover/Square) already prints an end-of-shift cash
  report for $0.
- **Smart safes** (Tidel, APG, Loomis SafePoint) — for real cash volume, this is
  the *hardware* answer to drawer accountability, a direct competitor to the
  countersign value prop.
- **Named apps** — LottoShield (~$79+/mo; auto-reconciles against *live state
  lottery data*, auto-adds new games), LottoReco (OCR of paper/terminal reports,
  ~45→5 min), FTx / Petrosoft (full c-store back office, heavy onboarding),
  Homebase / Deputy (best-in-class workforce), Tellermate (hardware cash recon),
  Modisoft (POS + lottery, free tier).

## 2. Where DuoCount genuinely wins

DuoCount owns a **row no single competitor occupies**: cash **+** lottery/scratch
**+** high-shrink inventory **+** team accountability **+** time-clock/scheduling,
POS-agnostic, in one cheap PWA. The defensible core:

- **The countersigned "duo count"** — every count signed + verified by a
  *different* person, enforced in Firestore rules (a manager can't verify or
  self-resolve their own count). This directly answers the loudest operator
  complaint: *three people share a drawer, it's $40 short, no way to know who —
  which encourages theft.* No competitor makes this a first principle.
- **Append-only, un-editable history** — discrepancies can't be quietly buried;
  it protects staff *and* owner in a shortage dispute.
- **Breadth + POS-agnostic + ~$19–39/loc** — no hardware, no POS switch.

**Honest read:** the moat is the *combination + the trust framing*, not
proprietary tech. DuoCount wins only if the **experience** is one a busy clerk
actually prefers — and today it isn't yet. The competitor matrix is genuinely
strong on breadth, but "✅ across every column" partly reflects self-scoring; the
gaps below are where the reality bites.

## 3. The gaps that matter

### (a) Experience gaps — these lose the trial in the first 10 minutes
*(from the live-app review; see the enhancement backlog for fixes)*

- **No first-run onboarding** — a new owner lands on the Cash tab with empty
  selects and "Pick a location first" toasts; nothing teaches the
  location→drawer→staff order. Reads as broken.
- **Nine text-only tabs, no bottom nav** — poor one-handed IA for a mobile-first
  PWA; off-screen tabs get missed.
- **Native `prompt()`/`confirm()`** for PIN resets, item edits, blind-count
  confirm — unreliable in installed PWAs; a PIN reset can *silently fail*.
- **Ephemeral feedback** — one ~2.2s toast; "Save failed" vanishes, rapid saves
  clobber each other. Corrosive for a *reliability* pitch.
- **Click-time-only validation, inventory entry burden** (five fields/item/shift),
  **buried power features** (scan is a sub-44px emoji, Reports a tiny ghost
  button), **no attention badges**.

### (b) Strategic / capability gaps

- **No multi-store owner rollup** — the highest-value buyer (3–8 stores) has no
  portfolio view: no "which store is shortest this week," no cross-store
  employee/shrink comparison, no consolidated close. *(→ `multi-store-rollup-spec.md`)*
- **No bulk import / migration** — switching from paper/Excel means hand-keying
  the whole item catalog + roster; setup friction survives even a first-run
  wizard. *(→ `bulk-import-spec.md`)*
- **No accountant / franchise exports** — no QuickBooks-friendly CSV, no one-tap
  close-of-day PDF for the bookkeeper or corporate. *(→ `accountant-export-spec.md`)*
- **No i18n / low-literacy mode** — c-store clerks are heavily non-native-English;
  zero Spanish today, and a naive "more English labels" fix works against them.
  *(→ `localization-spec.md`)*
- **Offline reliability claimed as a strength but never stress-tested** — spotty
  wifi + append-only immutable rules can produce silent sync/version conflicts.
  "Did my count save?" is existential for a trust product.
- **The countersign has a solo-shift hole** — who countersigns the lone 2am
  closer? No async/remote-verify fallback, so the flagship feature breaks exactly
  when theft risk is highest.
- **No real-time push** — only a once-a-day email digest (off by default); a
  flagged short waits up to 24h.
- **Time clock has no buddy-punch prevention or OT/break compliance** — a shared
  PIN defeats it; shipping payroll without compliance is a liability.

## 4. Prioritized enhancement plan (honest, value-per-effort)

**Tier 1 — cheap, saves the trial (build first; pure UI on existing reads):**

1. **First-run onboarding + zero-config empty states** — setup-progress checklist,
   route new owners to Admin, EmptyState CTAs on the count tabs. *(biggest
   trial-saver)*
2. **Everyday-usability bundle** — mobile bottom nav, inline validation
   (disable Save until valid, focus the bad field), persistent/retryable save
   errors, smart shift default + remembered location/drawer, inventory fast-path
   (primary "counted on hand," details behind an expander), 44px scan targets.
3. **Manager attention-badges** on Log / Incidents / Time — ambient "needs
   attention" from existing subscriptions.

**Tier 2 — high strategic value, mostly reuse (spec'd, then build):**

4. **CSV bulk import** (items / employees / opening baselines) — kills the setup
   wall + enables migration off paper/Excel.
5. **Multi-store owner rollup dashboard** — unlocks the highest-value buyer;
   largely reuses existing per-location reads.
6. **Accountant / close-of-day export** (PDF + QuickBooks CSV, optional franchise
   format) — low effort, high retention.
7. **In-app notification center** (defer web push) — the real-time
   loss-prevention story at a fraction of push's complexity.
8. **Spanish + low-literacy icon-forward count screens** — direct adoption lever
   for the real clerk demographic.

**Tier 3 — bigger bets, de-risk first:** offline write-queue reliability UX;
solo-shift countersign fallback; buddy-punch + OT/break compliance; and a **POS
e-journal / nightly-CSV import** — the missing data spine.

### Explicitly deferred / reframed

- **OCR of paper lottery reports** — accuracy on faded thermal receipts is poor;
  a subtly-wrong pack# that a rushed clerk "confirms" *launders a bad number
  through a signature* — worse than hand entry for an accountability product.
- **Self-logged voids/refunds** — a thief won't log their own void; hollow
  **without** a POS journal feed. Valuable only paired with the Tier-3 POS import.
- **Schedule↔shortage auto-correlation** — naming a person as statistically tied
  to shorts is a de-facto accusation (wrongful-termination/discrimination risk)
  that corrodes the "impersonal/structural" promise.
- **Center of gravity:** everyday usability + onboarding + import + exports +
  multi-store + i18n — **not** more AI. The AI features ship dark/unproven; don't
  stack the next bets on them.

---

*The Tier-1 items are tracked in `roadmap.md` §"Enhancement backlog"; the Tier-2
strategic items each have their own `*-spec.md` (multi-store rollup, bulk import,
accountant export, localization).*
