# DuoCount — end-to-end QA / UX / conversion audit

Date: 2026-09-30 · Commit audited: `5c75490` · Build: `next start` (production build) on localhost
Tooling: Playwright (Chromium 1194) driving the real app, axe-core 4.13.0, Resource Timing API.

> **Status — the four "Fix now" items are resolved.** B1, B4, B5 and B8 were fixed and
> re-verified against a production build; the measured results are in each row's Resolution
> line. Everything under "Fix soon" and "Nice to have" is still open.

---

## 0. What was and was not tested (read this first)

Everything in the bug table below was **executed against the running app** and the
numbers are measured, not estimated. The limits are equally concrete:

| Area | Status | Why |
| --- | --- | --- |
| Public routes (10) | **Executed** — 6 viewports, light + dark, axe, forms driven | — |
| Authenticated screens (Dashboard, AppShell, Admin, ScratchForm, Inventory, Rewards register) | **NOT executed** | `src/lib/firebase.js` has no emulator wiring and `getAdmin()` calls `cert(credentials())` before any emulator routing, so reaching a signed-in screen requires patching product source. Not done. |
| Cross-browser | **NOT executed** | Chromium only. No Firefox, Safari/WebKit or Edge in this container. |
| Lighthouse | **NOT executed** | Not available. axe-core used for accessibility instead. |
| Real-network performance | **NOT executed** | Localhost has no latency. Timings below are a **floor**, not field data. |
| Real-device touch | **NOT executed** | Emulated viewports only. |

Routes exercised: `/`, `/dev`, `/docs`, `/docs/[slug]`, `/guide`, `/help`, `/reset`,
`/rewards`, `/verify-email`, plus a deliberate 404.

A note on one earlier false alarm, kept here so it is not re-reported: a "Deprecated API"
console warning observed mid-audit came from the audit harness calling
`getEntriesByType("largest-contentful-paint")`, **not** from the app. Re-run without
instrumentation, the console is clean on all 10 routes.

---

## 1. Bug table

| ID | Severity | Page / element | Steps to reproduce | Expected | Actual | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| **B1** | High | `/dev` — `input[type=email]` and the `RevealInput` password (`src/app/dev/page.js:170-176`) | Load `/dev`, run axe, or focus either field with a screen reader | Each input is programmatically tied to its visible label | Both inputs have **no** `id`/`htmlFor`/`aria-label`; labels are bare `<label className="label">`. axe reports `label` **critical**. `/dev` is the only route of 10 with unlabelled inputs | Use the existing `<Field>` component (`src/components/Field.js`), already used in 10+ components and which wires `id` + `aria-describedby`. Also covers the conditional TOTP code input on line 181 |
| **B2** | Medium | Every route — `<html lang>` (`src/app/layout.js:45`) | Switch to Español on `/guide`, then visit `/`, `/help`, `/rewards`, `/reset` | `lang` becomes `es` when the UI is Spanish | `lang="en"` on all 5 routes while the body renders Spanish. WCAG 3.1.1 (A) failure — screen readers read Spanish with an English voice | Have `LangProvider` set `document.documentElement.lang` on change, mirroring how the theme is applied |
| **B3** | Medium | `/`, `/help`, `/reset`, `/guide` — product tagline (`src/lib/store.js:5`) | Switch to Español, look at the header | Whole screen in Spanish | `PRODUCT.tagline` is a hardcoded English string with **no key in `src/lib/i18n.js`**. In Spanish mode `/` reads "…All your counts. All in one place. … CÓDIGO DE TIENDA … Iniciar sesión" — a mixed-language screen, which `CLAUDE.md` explicitly forbids | Move the tagline into `i18n.js` as `product.tagline` (en + es) and resolve via `t()`. Used in 7 places incl. `AppShell.js:461`, so this also affects signed-in screens (code-read, not executed) |
| **B4** | Medium | `/rewards` — `<a href="/">Back to the app</a>` | Load `/rewards` in **light** mode, run axe | ≥ 4.5:1 contrast | **3.86:1**, 12px. The colour is inherited from the wrapping `<p class="text-faint">`, so the failing token is **`--faint` (`#787b7d`)**, not `--muted` (`#64686a`, which passes at 5.10:1) | Not a token change: `--faint` is documented as the placeholder/tertiary token and is correct for that. The defect is `text-faint` used for body text — those usages move to `text-muted` |
| **B5** | Medium | `/` — footer links (`src/components/PinLogin.js:184,186`) | Load `/`, inspect Resource Timing | Login screen loads login code | `/` transfers **854KB**, of which **318KB is `fetch` prefetch of `/guide` (168KB) and `/docs` (142KB)** RSC payloads, because both are Next `<Link>`s in the viewport. Most people signing in never open either | `prefetch={false}` on those two `<Link>`s, or make them plain `<a>` like the Terms/Privacy links two lines above already are |
| **B6** | Medium | `/`, `/help`, `/reset`, `/rewards`, `/verify-email`, 404 — page structure | Run axe on each | One `<main>` landmark per page | **6 of 10 routes have zero `<main>`**. axe: `landmark-one-main` 6 nodes, `region` 48 nodes. Present correctly on `/dev`, `/docs`, `/docs/[slug]`, `/guide` | Wrap the page body in `<main>` in the shared shells used by those 6 routes |
| **B7** | Medium | `/guide`, `/docs/[slug]` — "ON THIS PAGE" chip nav + language toggle | Measure control heights at 375px | ≥ 44px touch targets | All chips are **28px tall** (10 standalone controls on `/guide`, 8 on `/docs/getting-started`); language buttons 81×28. Below WCAG 2.5.5 / Apple HIG 44px. *(The other 15–17 sub-44px elements per page are inline links inside prose, which WCAG 2.5.8 exempts — not counted as defects)* | Raise chip padding to `py-2.5` (→ ~44px) or add an invisible expanded hit area |
| **B8** | Medium | `/` — "New business? Register your store" | Load `/`, measure the control | The primary acquisition CTA is prominent | It is a **292×20px text link** — 20px tall, styled as body copy, below the fold on small phones. This is the only path to creating an account | Promote to a secondary button (`btn-outline`, full width, ≥44px) directly under Sign in |
| **B9** | Medium | `/rewards` — "Check my points" button | Load `/rewards`, click submit with both fields empty | Consistent with the other two public forms | Button is **not disabled when empty** (submits, then shows "Enter the store code and a valid phone number."). `/` and `/dev` both **disable** submit until valid. Three public forms, two different contracts | Pick one contract. Recommend the `/rewards` one (always clickable + inline error) — a disabled button gives a beginner no feedback about *why* |
| **B10** | Medium | All 10 routes — `<head>` | View source / query `meta[property^="og:"]` | Shared links render a card | **Zero Open Graph and zero Twitter tags; zero `rel=canonical`** on every route. A link to DuoCount pasted into WhatsApp/Messenger/Slack renders as a bare URL | Add `openGraph` + `twitter` to `metadata` in `layout.js`, with per-page overrides for `/guide`, `/docs/[slug]`, `/rewards` |
| **B11** | Medium | `/` — signup form, "LOGO URL (OPTIONAL)" | Click Register your store | A shop owner can complete signup unaided | Field expects a hosted image URL (`https://…/logo.svg`). A corner-store owner on a phone has a photo, not a URL — no upload, no "skip for now" affordance beyond the word "(optional)" | Accept a file upload, or move the field out of signup into Admin → Branding entirely |
| **B12** | Low | `/` — signup form, 6 fields | Inspect the inputs | Native validation available | **No field carries `required`**; validation is entirely JS-gated. Works, but loses native browser semantics and AT announcement of required state | Add `required` + `aria-required` alongside the existing JS gate |
| **B13** | Low | All routes — focus indicator | Tab through `/` | One consistent focus treatment | Inputs and `<select>` get a custom `outline: solid 2px`; links and buttons fall back to the UA default `outline: auto 1px`. Two visual languages for the same state | Apply the custom `:focus-visible` ring to `a` and `button` in `globals.css` |
| **B14** | Low | `/rewards` — error handling | Submit the empty form | Focus moves to the field needing attention | Focus stays on the button (`document.activeElement` = `button`). *(The message is announced — 2 live regions present — so this is a convenience defect, not an AT blocker)* | Focus the first invalid input after a failed submit |
| **B15** | Low | `/`, `/help`, `/reset` — header at 375–390px | Load at phone width | Tagline reads as one or two tidy lines | Squeezed by the language `<select>` + theme button into **three** lines: "All your counts. / All in one / place." | Let the tagline span full width below the logo row at `<480px`, or shorten it for small screens |
| **B16** | Low | 404 page | Visit any unknown URL | Same chrome as the rest of the app | No language toggle and no theme toggle — a Spanish-language user who lands here gets an English-only dead end with a single "Go to the start" button | Render the 404 inside the same shell as `/help` |

### Verified working (no defect found)

These were actively tested and passed — worth stating so they are not re-litigated:

- **Zero page errors and zero console errors** on all 10 routes × 6 viewports (320/375/768/1024/1440/1920).
- **Zero horizontal overflow** at every one of those 60 combinations.
- **Dark mode contrast is clean on all 10 routes** (axe `color-contrast`, 390px) — B4 is light-mode only.
- Exactly **one `<h1>` per page**; **zero images missing `alt`**; every page has `<title>`, meta description and favicon.
- **Guide search works well**: "rewards" → 8 results; nonsense input → *"No matches for "zzzqqq-nonexistent.""* — a real empty state, not a blank panel.
- **Language switching works and persists** (`localStorage.duocount-lang`) across navigation — the defects are B2/B3, not the mechanism.
- **404 returns a real 404 status**, not a 200.
- **No XSS reflection**: `<script>alert(1)</script>`, `' OR 1=1--`, 5000-char and emoji payloads into `/`, `/dev`, `/rewards` — raw tag echoed into HTML: **false** in every case, no page errors. (The 8 inline `<script>` tags on each page are Next's own hydration payload.)
- **Signup form: all 6 inputs correctly labelled** — the B1 defect is confined to `/dev`.

---

## 2. UX friction log

Ordered by how early a first-time user hits them.

1. **The signup door is fine print.** (`/`) A brand-new business owner arrives at a screen whose
   dominant control is "Sign in" — which they cannot use, because they have no store code. The one
   thing they *can* do is a 20px text link (B8). The page is built for returning staff; acquisition
   is an afterthought.
2. **The disabled Sign in button gives no reason.** At rest it renders at `opacity: 0.5` with
   `cursor: not-allowed` and no explanation. A beginner who mistypes a 5-digit PIN sees a dead
   button and no message telling them why.
3. **"Store code" is unexplained above the fold.** The helper text — *"Your store code comes from
   whoever set up your business. Ask a manager if you don't have it."* — is genuinely good, but it
   sits *below* the sign-in button, after the point of confusion.
4. **"Logo URL" stops signup cold.** (B11) It is the second field in the form. Even marked optional,
   a field a user cannot fill creates doubt about whether they are qualified to continue.
5. **Language and theme controls outrank the product.** On `/rewards` the first interactive element
   above the fold is "English"; on `/`, `/help`, `/reset`, `/docs` it is an unlabelled icon button.
   Chrome is winning the top of every page.
6. **Mixed-language screens.** (B3) A Spanish user sees an English tagline on four public pages —
   small, but it is exactly the trust signal a bilingual staff-facing product cannot afford to fumble.
7. **The chip nav is hard to hit.** (B7) 28px targets on the two longest, most-scrolled pages, where
   the nav is the main way to move around.

**What is genuinely good and should not be touched:** `/help` is the standout — a triage page
organised by *situation* ("You're staff and forgot your PIN", "Sole owner, no recovery email")
rather than by feature, each with a concrete next action. That is better first-line support than
most commercial SaaS ships. `/guide`'s plain-language framing ("What DuoCount is, in one sentence")
is the same instinct, done well.

---

## 3. Design polish list

| # | Item | Detail |
| --- | --- | --- |
| P1 | Tagline wrap | Three-line break at phone width on 3 routes (B15) |
| P2 | Chip nav height | 28px chips read as tags, not controls; they are the primary in-page nav (B7) |
| P3 | Focus ring split | Custom 2px ring on inputs, browser default on links/buttons (B13) |
| P4 | Disabled-button treatment | `opacity: 0.5` on a saturated green reads as "loading", not "not yet" — prefer a flat muted fill |
| P5 | `text-faint` on body text | `--faint` (`#787b7d`) is the placeholder/tertiary token and fails AA at 12px. It is correct for placeholders and "no value" em-dashes; the defect is the 7 places that used it for real prose (B4) |
| P6 | 404 is vertically centred | On a tall viewport the card floats mid-screen with a large empty header area; no chrome (B16) |
| P7 | `/rewards` vs `/` button states | Same component, same green, opposite disabled semantics — visually identical, behaviourally different (B9) |
| P8 | Language control is two different widgets | A `<select>` on `/`, `/help`, `/reset`; segmented buttons on `/guide`, `/rewards`. Pick one |

---

## 4. Top 5 engagement wins

1. **Promote the signup CTA to a real button** (B8). The single highest-leverage change here: the
   only acquisition path in the entire public surface is currently 20px of underlined body text.
2. **Ship Open Graph tags** (B10). Every link anyone shares — owner to staff, staff to staff —
   currently renders as a naked URL. This is free distribution being thrown away on a product whose
   growth is inherently word-of-mouth between small retailers.
3. **Cut 318KB of doc prefetch from the login screen** (B5). A one-line change that removes 37% of
   the login page's bytes for users on store wifi.
4. **Put the store-code explainer above the sign-in button**, not below it. The copy already exists
   and is good; it is simply in the wrong place relative to the moment of confusion.
5. **Give the disabled Sign in button a reason.** Inline "Enter your 6-digit PIN" beats a greyed
   rectangle. `/rewards` already does this correctly — copy its behaviour (B9).

---

## 5. Scorecard

| Dimension | Score | Justification |
| --- | --- | --- |
| Functionality | **8 / 10** | Every public route renders with zero page and zero console errors across 60 viewport combinations; search, language, theme and 404 all behave. Docked for B9's inconsistent form contract and B2's stale `lang`. **Authenticated screens untested — this score covers the public surface only.** |
| UI consistency | **7 / 10** | One coherent visual language throughout, but three public forms ship two different empty-state contracts, two different language widgets, two focus-ring treatments, and `<main>` on only 4 of 10 routes. |
| Beginner-friendliness | **8 / 10** | `/help`'s situation-based triage and `/guide`'s plain-language framing are genuinely above market. Held back by the Logo URL field (B11) and by the store-code explainer sitting below the button it explains. |
| Premium feel | **7 / 10** | Cohesive palette, real working dark mode, good empty states, careful copy. Undercut by a three-line tagline wrap at phone width, a 20px primary CTA, and 28px nav chips. |
| Performance | **7 / 10** | TTFB 11ms, DCL 73ms, load 300ms — but 854KB on the login screen, 318KB of it doc prefetch nobody asked for (B5). **Localhost only: these are a floor, real-network numbers will be worse.** |
| Accessibility | **6 / 10** | One critical `label` failure (B1), one AA contrast failure (B4), 6 of 10 routes with no `<main>` (B6), `lang` stuck at `en` (B2), and 28px targets (B7). Offset by clean dark-mode contrast, correct heading structure, full `alt` coverage and working keyboard focus. |

---

## 6. Priority roadmap

### Fix now — **done**
- **B1** — `/dev` now wraps all three controls in `<Field>`. axe on `/dev`: **zero violations**
  (was 1 critical); both inputs report `via <label for>`. Rendering is pixel-identical.
- **B5** — `prefetch={false}` on the three footer links. Login page **854KB → 541KB (−313KB,
  −37%)**; prefetch traffic 318KB → 4KB. `/reset` and `/help` keep their prefetch on purpose.
- **B8** — the CTA is a `btn-ghost` secondary button, **≥44px at every width** (62px at phone
  width where the label wraps, 44px at 430px), `text-balance` so it breaks after the question
  rather than orphaning "store". Signup still opens correctly.
- **B4** — the 7 real-prose `text-faint` usages moved to `text-muted`; decorative separators and
  "no value" em-dashes keep `text-faint`. axe `color-contrast` across all 10 routes in both
  schemes: **zero violations**.

Fixing B4 surfaced a latent bug in the `check:css` ratchet from #256: `utilityFamily` classified
every unrecognised `text-*` utility as a colour, so `text-balance` beside `.btn-ghost` read as a
dead colour utility. Added the `text-wrap` and `text-overflow` families plus a test; the dead-
utility baseline is unchanged at 292 across 37 files, confirming nothing else was being masked.

### Fix soon
- **B2** / **B3** — `lang` attribute and the untranslated tagline. B3 also violates the project's own
  "never leave a half-translated screen" rule and reaches signed-in screens via `AppShell`.
- **B10** — Open Graph tags.
- **B6** — `<main>` landmark on the 6 routes missing it.
- **B7** — 44px chip nav and language toggle.
- **B9** — settle on one form-submit contract across the three public forms.
- **B11** — Logo URL as an upload, or out of signup.

### Nice to have
- **B13** focus-ring consistency · **B14** focus-on-error · **B12** `required` attributes ·
  **B15** tagline wrap · **B16** 404 chrome · **P4** disabled-button treatment ·
  **P8** one language widget.

---

## 7. Marketplace / theme submission readiness (optional add-on)

| Criterion | Status | Evidence |
| --- | --- | --- |
| Zero console errors | **Pass** | 10 routes × 6 viewports, clean |
| Responsive, no overflow | **Pass** | Zero horizontal overflow at 320–1920 on all 10 routes |
| Documentation | **Pass** | `/guide` + `/docs` tree, bilingual, searchable — well above the usual bar |
| Consistent file naming | **Pass** | `PascalCase.js` components, `kebab-case.js` libs, `tests/*.test.mjs` — consistent |
| Commented code | **Pass** | Non-obvious logic carries intent comments (e.g. the arrow-wrap note in `api/dev/route.js`, the shell note in `AppShell.js:456`) |
| Accessibility baseline | **Fail** | B1 critical + B4 AA contrast + B6 landmarks must clear first |
| Valid HTML (W3C) | **Not verified** | No validator available offline; not claimed either way |
| Licensed demo content | **Not verified** | Logo/wordmark provenance not established in-repo |
| Social preview metadata | **Fail** | Zero OG tags on every route (B10) |

**Verdict:** the content and code-hygiene criteria are already met; the blockers are the
accessibility trio (B1, B4, B6) and OG metadata (B10). Fixing the four "Fix now" items plus B6
would clear every criterion that was testable here.
