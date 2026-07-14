---
title: AI features — in-app pattern narrative
---

# DuoCount — AI Pattern-Narrative Spec (feature 3)

**Status: Phase 1 built (shipped dark); Phase 2 (owner toggle + disclosure)
pending.** Built — the reused digest core factored into a shared
`runNarrative(redacted, ctx)` (behavior-preserving for the cron), `redactForModel`
reused as-is, the pure `buildInsightSummary(patterns, counts)` + `aiInsightsEnabled`
gate, the manager-gated `POST /api/pattern-narrative` route (server-enforced
opt-in, redacts names server-side), the "Explain these signals" button on the
Dashboard's Patterns card (shown only when `vendor.aiInsights` is on; result
cached per pattern-set; React auto-escapes the model text), and the tests
(`npm run test:insight`; the digest's 9 tests still pass, confirming the
extraction is behavior-preserving). Off by default — with the flag off the
Dashboard is unchanged. **Still to build (Phase 2):** the `vendor.aiInsights`
owner toggle in Admin (+ the one-key `firestore.rules` allow-list entry) and the
`privacy-and-data.md` disclosure. **Also open:** live model-call verification
against a pilot (needs a real key + deploy). This is the build spec for the third
AI feature named in `ai-features-spec.md` (§Phasing) and `distribution-analysis.md`
§1.1.

**Relationship to the shipped AI features.** This is the **in-app twin of the
digest narrative** (feature 1, built): both summarize the same pattern signals in
the same non-accusatory voice, so this feature **reuses the digest narrative's
pure core** (`redactForModel` + `buildNarrativePrompt` in `src/lib/digest-
narrative.js`) rather than re-deriving the pseudonymization and prompt. The
difference is the surface and the trigger: the digest narrative is generated in
the daily cron and lands in an email; this one is generated **on demand** when a
manager asks for it on the Dashboard. It shares the **on-demand, user-initiated**
posture of NL log search (feature 2) — an explicit click is an explicit egress.

---

## Goal

The Dashboard already shows a **"Patterns"** card for managers — the output of
`detectPatterns` (`src/lib/patterns.js`): a list of `{ severity, title, detail }`
signals ("Employee A: 4 short counts in 14 days", "POS Cash Drawer: short 5 times
across 2 people", …). Today the reader has to synthesize the list themselves.

This feature adds an **"Explain these signals"** action to that card. On click it
generates a 2–3 sentence plain-English readout — *what the signals add up to and
what to look at first* — plus a short "what to watch" list, from the **same
pattern data already on screen**. It never fetches new data, and it holds the
pattern engine's philosophy verbatim: *a signal to start a conversation, not a
verdict* (`patterns.js` header).

It is **additive and on-demand**: the Patterns card renders exactly as it does
today; the narrative appears only after the manager asks for it, and any failure
just means no narrative block.

---

## Why on-demand, not automatic

The digest narrative auto-generates because the digest is a once-a-day batch. The
Dashboard is viewed many times a day, so auto-generating on every mount would mean
a model call (cost + latency + egress) on every visit. Instead:

- **A button triggers it** — one explicit, visible egress per click, matching the
  NL-search "Ask" posture. The manager decides when to send.
- **The result is cached in component state, keyed by the pattern set** — clicking
  again with the same signals reuses the result; it regenerates only when the
  underlying patterns change. No repeat calls while the manager reads.

---

## Integration point

1. **Reuse the digest narrative core (no fork of the redaction/prompt).**
   `redactForModel(summary)` and `buildNarrativePrompt(redacted, ctx)` already
   pseudonymize person names in `person-*` pattern titles and encode the
   only-restate / non-accusatory / treat-as-data rules. Feature 3 feeds them a
   summary object built from the Dashboard's data and reuses the same
   `{ summary, watch }` schema. If the in-app framing needs a different lead-in
   ("what to look at first" vs the digest's "yesterday" tone), add a small
   `surface: "dashboard"` switch to `buildNarrativePrompt` rather than a second
   prompt builder — one prompt core, two surfaces.
2. **New pure helper `buildInsightSummary(patterns, aggregates)`** (pure,
   unit-tested) — shapes the Dashboard's `patterns` + the headline counts it
   already computes (open variances / disputes / unverified, window days) into
   the same `summary` shape `redactForModel` expects. Keeps the Dashboard from
   hand-rolling the payload. Lives alongside the reused core (e.g. in
   `digest-narrative.js` or a small `insight.js`).
3. **New server-only route `POST /api/pattern-narrative`.** Body carries the
   **redacted** summary (the client redacts with `redactForModel` before sending —
   see Privacy) or the raw patterns (the route redacts); returns
   `{ narrative: { summary, watch } }` or `{ narrative: null }`. Server-side
   because the key is server-only; `requireManager`-gated (patterns are a
   manager-only surface). It reuses the narrative generate path — factor the model
   call out of `generateNarrative` into a shared `runNarrative(redacted, ctx)` so
   the cron and this route share one call site.
4. **UI (Dashboard "Patterns" card).** An **"Explain these signals"** button in
   the card header (manager-only, shown only when `vendor.aiInsights` is on). On
   click: POST to the route, render the returned summary + "what to watch" bullets
   in a block at the **top of the card** (escaped — model output is untrusted
   text), with a subtle "AI summary" label and a re-run/dismiss control. On
   failure, a toast and no block.

---

## API design

Identical posture to the digest narrative (`ai-features-spec.md` §API design) —
this is the point of reusing the core:

- **SDK, server-side only.** `@anthropic-ai/sdk`, the same **`ANTHROPIC_API_KEY`**
  as the other two features (one key powers all AI).
- **Model: `claude-haiku-4-5`**, the shared constant. Same tier, same reasons;
  `claude-fable-5` excluded (retention posture).
- **Structured output** with the existing narrative schema
  (`{ summary: string, watch: string[] }`) — the renderer never parses prose.
- **Prompt caching** on the (cacheable) system prompt, shared with the digest
  narrative.
- **No extended thinking, no streaming.** Short summarization into a small block.
- **Timeout + abort.** ~8s `AbortSignal`; on abort the route returns
  `{ narrative: null }`.

---

## Privacy & trust

Same guardrails as the digest narrative, with the on-demand egress made explicit:

1. **Opt-in per vendor, owner-controlled, OFF by default.** A **new dedicated
   flag `vendor.aiInsights`**, separate from `digest.narrative` and `aiSearch` —
   the established principle that turning one AI surface on must never silently
   turn another on. `aiInsightsEnabled(vendor)` also requires
   `ANTHROPIC_API_KEY`. (Cosmetic: the three AI toggles can be grouped under one
   "AI features" subsection in Admin, but each stays an independent flag.)
2. **Send reduced, pseudonymized pattern data — reuse `redactForModel`.** Person
   names in `person-*` titles become stable pseudonyms before egress; drawer /
   item / game labels and the numeric counts stay; only allow-listed fields go.
   No raw entries, no amounts beyond the pattern totals the alert already states.
3. **On-demand, user-initiated.** Nothing is sent until a manager clicks "Explain
   these signals" — the same explicit-egress model as NL search.
4. **Server-side only; manager-gated.** Key in the route's environment; the route
   requires a manager (patterns are manager-only).
5. **No writes.** The narrative is display-only — it never touches the
   append-only log or the pattern records.
6. **Documented handling.** A one-line note on the owner toggle and a paragraph in
   `docs/privacy-and-data.md`: what is sent (the pattern signals with names
   pseudonymized), to whom (Anthropic), why (to summarize them), and that it's off
   unless enabled and only on an explicit click. Zero-retention posture where
   available.

---

## Failure handling (additive, never a gate)

| Condition | Behavior |
| --- | --- |
| `ANTHROPIC_API_KEY` unset | `aiInsightsEnabled` → false; no button; the Patterns card is unchanged. |
| Vendor flag off | Same — no button. |
| No patterns | No button (nothing to explain). |
| API error / schema-invalid after retries | Route returns `{ narrative: null }`; a toast, no block. |
| Timeout (~8s abort) | Same — `null`, no block. |

The Patterns card is the product; the narrative is a garnish that can always be
absent.

---

## Testing

Reuses the digest narrative's test posture and, where possible, its tests.

- **Reused:** `redactForModel` / `buildNarrativePrompt` are already unit-tested
  (`tests/digest-narrative.test.mjs`); a `surface: "dashboard"` switch, if added,
  gets one assertion there.
- `tests/insight.test.mjs`: `buildInsightSummary(patterns, aggregates)` — produces
  the summary shape `redactForModel` consumes (patterns preserved, counts mapped,
  no extra fields); an empty pattern list yields an empty-but-valid summary.
- `runNarrative` / the route (network) are exercised manually with a key set — the
  same live-verify note the other two features carry.

---

## Phasing

1. **Phase 1 — mechanics + button, shipped dark. ✅ built.** `buildInsightSummary`,
   the `runNarrative` extraction (shared with the cron — the digest's tests still
   pass, so it's behavior-preserving), the `/api/pattern-narrative` route, the
   `vendor.aiInsights` gate, the "Explain these signals" button with its cached
   result, and the tests. Flag defaults off, so the Dashboard is unchanged. With a
   key + the flag on, spot-check the in-app readout (the only part not exercisable
   in-repo).
2. **Phase 2 — owner UX + disclosure.** The `vendor.aiInsights` toggle in Admin →
   Business settings ("AI insight on the Dashboard — off by default") with the
   data-handling note, grouped with the other AI toggles, the one-key
   `firestore.rules` allow-list entry, and the matching `privacy-and-data.md`
   paragraph.
3. **Phase 3 — later.** Features 4–5 (variance-note assist, incident write-up
   assist) — the human-in-the-loop drafting features — stay deferred until the
   opt-in/consent UX across features 1–3 is proven on a live pilot, then each gets
   its own spec with the review flow made explicit.

---

## Out of scope / later

- **Auto-generating on Dashboard load.** On-demand only, to bound cost and make
  egress explicit.
- **Any write to the log or the pattern records.** Display-only, permanently.
- **New detectors or changing what counts as a pattern.** This feature narrates
  the existing `detectPatterns` output; detector work is `tier-two-build-spec.md`.
- **Client-side model calls.** Never; the key is server-only.

---

## Acceptance criteria (Phase 1)

- With the flag **off** (default), the Dashboard "Patterns" card is unchanged — no
  button, no narrative.
- With the flag **on**, a key set, and at least one pattern, an "Explain these
  signals" button appears; clicking it renders a 2–3 sentence summary + up to four
  "what to watch" bullets, all HTML-escaped, generated only from the on-screen
  pattern data.
- The payload contains **no raw employee names** — person patterns are
  pseudonymized via the reused `redactForModel`; the existing test already asserts
  this.
- The digest narrative is **unchanged** — the `runNarrative` extraction is
  behavior-preserving for the cron (same email output).
- Any model failure or timeout leaves the Patterns card intact with no block.
- The result is cached per pattern set (no repeat call while the signals are
  unchanged); the model id stays one constant; the key is never client-exposed.
