---
title: Localization & low-literacy count path
---

# DuoCount — Localization Spec (Spanish first)

**Status: Phase 1 shipped (Spanish count path + mechanics + icon-forward
treatment); Phases 2–3 designed, not built.** `src/lib/i18n.js` (pure `translate`
/ `resolveLocale` + the en/es catalogs, ~95 keys), `LangProvider` / `useLang()`,
the language picker on `PinLogin` and the language row in `PreferencesMenu`, and
the full count-path sweep — login, the tab bar (top strip + mobile bottom nav),
all three count forms, their validation messages (via stable `code`s on
`count-validation.js`), save errors (the `SAVE_FAILED` sentinel), the blind-count
confirm, and every toast — plus tab glyphs, ✓ on Save, 🌅/🌇 on shift, and ▲/▼ on
the over/short readout. The completeness test (`npm run test:i18n`) pins the en
and es key sets equal. **One honest carve-out:** the `login()` / `signup()` error
prose originates server-side (the auth API), so it still surfaces in English —
keyed with the API layer in Phase 2. This spec remains the contract for Phases
2–3, because the expensive part — touching every string beyond the count path —
is real, unglamorous work that a `t()` helper alone does not make cheap.

It follows the pattern the app already uses for personal, per-device preferences
(the light/dark theme in `ThemeProvider` and the scroll-to-top FAB in
`PrefsProvider`, surfaced in the header **Settings** menu): a tiny pure module +
one provider + `localStorage`, no new runtime dependency, no schema change.

---

## Goal

Let a clerk run the **entire daily count in their own language**, Spanish first —
sign in, pick the count tab, fill the cash / scratch-off / inventory form, and read
the confirmation toast — with meaning carried by **icons plus a label in that
language**, not by more English words. Concretely, when the device's language is
set to Spanish:

- `PinLogin` ("Store code", "Your PIN", "Sign in"), the `AppShell` tab bar (Cash /
  Scratch-offs / Inventory / …), the three count forms (`CashForm`, `ScratchForm`,
  `InventoryForm`), and every toast they raise ("Cash entry signed & saved", "Pick
  a location first", "Save failed — check connection") render in Spanish.
- Each count-path tab and each primary action also carries a **language-neutral
  glyph**, so recognition never depends on reading the label at all.
- With the default English locale, every one of those screens is **byte-identical
  to today** — this is purely additive.

It is explicitly **not** a goal to translate user-authored store data (note text,
incident write-ups, item / game / drawer names), the fixed-light paper and email
output, or the AI prose surfaces — see **Out of scope**.

---

## Why

**The demographic is the whole argument.** DuoCount is "built for the register"
(`distribution-analysis.md`, `pwa-spec.md`): the person doing the count is a
convenience-store clerk on a phone, and that workforce is heavily non-native
English — for a large share, English is a second language and reading fluency is
uneven. The product's core promise is a *fast, self-auditing* close. Every English
word a clerk has to decode mid-count is friction on exactly the population that
uses the count path most.

**Localization is an adoption lever, not a nicety.** An owner choosing between
DuoCount and a paper log (or a competitor) is choosing what their staff will
actually use shift after shift. A count screen in the clerk's language, with a
glyph they recognize instantly, is the difference between "the staff adopted it"
and "the staff went back to the clipboard." This is a distribution feature dressed
as a UI feature.

**The naive fix makes it worse.** The reflex — and the direction the UI-enhancements
tier leaned, for good reasons at the time — is to *add more English microcopy*: the
helper line under the cash form ("Expected = start + sales − paid out. Your name,
drawer, location, and time stamp attach automatically."), the scratch hint
("End # − start # = tickets sold. That × price must match the drawer…"), the
inventory hint, the empty-state sentences. For a fluent reader that is clarifying.
For a low-literacy or non-native clerk it is *more English to decode* — it raises
the reading load and can obscure the task rather than reveal it. The lever for this
population is **fewer words, more glyphs, and the clerk's own language** — not more
English sentences. A design that just runs the existing English strings through a
translator, and adds nothing else, would be a real improvement but still miss half
the point.

---

## Approach

### A lightweight string catalog + `t(key)` — deliberately not a framework

A new **pure** module, `src/lib/i18n.js`, holds a per-locale object of keyed
strings and a resolver:

```
// src/lib/i18n.js  (pure; unit-tested with node --test)
export const LANG_KEY = "duocount-lang";       // localStorage, sibling of duocount-theme / duocount-fab
export const DEFAULT_LOCALE = "en";
export const LOCALES = ["en", "es"];            // Phase 1; the array is the only thing a new locale adds

const CATALOG = {
  en: {
    "nav.cash": "Cash",
    "cash.title": "New drawer count",
    "cash.counted_close": "Counted at close",
    "common.save_sign": "Save & sign entry",
    "toast.saved_cash": "Cash entry signed & saved",
    "toast.saved_over": "Saved — over {amount}",
    "err.pick_location": "Pick a location first",
    // …every user-facing string on the count path
  },
  es: {
    "nav.cash": "Caja",
    "cash.title": "Nuevo conteo de caja",
    "cash.counted_close": "Contado al cierre",
    "common.save_sign": "Guardar y firmar",
    "toast.saved_cash": "Entrada de caja firmada y guardada",
    "toast.saved_over": "Guardado — sobra {amount}",
    "err.pick_location": "Primero elige una ubicación",
  },
};

// Resolve against the active locale; fall back to English; never return blank.
export function translate(locale, key, vars) {
  const s = CATALOG[locale]?.[key] ?? CATALOG.en[key] ?? key;   // key is the last-resort signal, not ""
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : s;
}
```

- **Keys, not English text, are the lookup.** A stable dotted key
  (`namespace.thing`) per string — `nav.*` for the tab bar, `cash.*` /
  `scratch.*` / `inventory.*` for each form, `common.*` for shared actions
  (Save & sign, Opening / Closing, Date, Location), `toast.*` / `err.*` for the
  confirmations and errors. Keying (rather than "translate this English phrase")
  means English copy can be reworded without silently orphaning the Spanish.
- **Interpolation for composed strings.** The forms build dynamic messages today —
  `over ${money(diff)}`, `short ${Math.abs(diff)} ${unit}s`, `Selected ${match.name}` —
  which cannot be a single fixed string. These become parameterized keys, e.g.
  `t("toast.saved_over", { amount: money(diff) })`, so word order is the
  translator's to set (Spanish routinely reorders these). Grammatical plurals
  (`unit`s) are handled per-key for two locales; full ICU pluralization is
  **out of scope** (see below).
- **English fallback, always — never blank.** A key missing from the active locale
  falls back to English; a key missing everywhere returns *the key itself*, which
  is visible-but-obviously-wrong (a dev signal), never an empty element. A
  half-translated screen degrades to English words, not to holes.

### Language preference — mirrors theme / FAB exactly

A `LangProvider` (new, `src/components/LangProvider.js`) modeled one-for-one on
`ThemeProvider` / `PrefsProvider`:

- Reads/writes `localStorage` key **`duocount-lang`**, a sibling of the existing
  `duocount-theme` and `duocount-fab`. It's a **personal, per-device** preference —
  it never touches the vendor record, needs no Firestore rules, and one clerk's
  choice never changes what a coworker sees (same posture as the theme, per
  `ui-enhancements-spec.md` §4).
- Exposes `useLang() → { lang, setLang, t }`, where `t(key, vars)` closes over the
  active `lang`. Components call `const { t } = useLang()` and then `t("cash.title")`.
- **Default `"en"` during SSR and the first client render** so hydration is stable;
  the stored locale is read in an effect after mount (identical to how
  `ThemeProvider` and `PrefsProvider` avoid a hydration mismatch). Unlike the theme
  we add **no `<head>` boot script**: a color flash (theme) is jarring; a one-frame
  English-then-Spanish text swap is not, and text reflow is cheap. This is a
  deliberate, honest trade — we accept a sub-frame English flash to avoid inlining
  a second boot script.
- Surfaced in two places: a **language row in the header Settings menu**
  (`PreferencesMenu`, alongside Appearance and the FAB switch) and a **picker on the
  `PinLogin` card** next to the existing `ThemeToggle` — because login is the *first*
  count-path screen, and a clerk must be able to switch before they can read
  anything.

### Why not react-i18next / next-intl / FormatJS

For a two-locale, keyed-string catalog the heavyweight libraries are a bad trade:
they bring a provider tree, an ICU message compiler, plural/gender/date machinery,
a message-extraction build step, and real bundle weight — to solve problems we
don't have. A ~40-line pure module plus one provider **matches the pattern the team
already maintains** (theme, prefs, `lib/shortcuts.js`, `lib/log-filter.js`: small
pure cores, unit-tested with `node --test`), stays tree-shakeable, adds **zero
runtime dependency**, and is trivially testable. If DuoCount ever needs rich
pluralization or gender across a dozen locales, revisit then — but YAGNI now, and a
dependency is easy to add later and hard to remove.

### Extraction is the actual work

The `t()` function is a day. The **string sweep is the feature.** Every count-path
component is full of inline English literals that must each be located and replaced:
JSX text (`<h2>New drawer count</h2>`), `label={"Location"}` props on `Field`,
`placeholder="0.00"` and `placeholder="acme-market"`, `<option>` labels ("Opening",
"Closing", "No drawers — add in Admin"), button text ("Save & sign entry",
"Saving…", "Sign in", "Checking…"), the summary readouts ("Expected in drawer",
"Over / short", "Tickets sold"), and every `onSaved(...)` / `setErr(...)` message.
Composed strings become parameterized keys. This is mechanical but voluminous and
easy to do 90% of — hence the **completeness test** (below) that fails the build
when a key is missing from a locale, and the **phasing** that does the count path
first and the long tail later rather than pretending it's one commit.

The Spanish catalog itself should be a **native / professional pass, not raw machine
output** — clerk trust hinges on the copy reading naturally; awkward Spanish signals
an unreliable tool as surely as English does.

---

## Scope — the daily count path, first

Phase 1 covers exactly the surfaces a clerk uses every shift, end to end:

| Surface | File | Representative strings to key |
| --- | --- | --- |
| Login | `src/components/PinLogin.js` | "Store code", "Your PIN (6 digits)", "Sign in" / "Checking…", the "New business? Register…" link, the two helper paragraphs, error text from `login()` |
| Tab bar | `src/components/AppShell.js` (`TABS`) | Cash, Scratch-offs, Inventory, Log, Notes, Incidents, Time, Dashboard, Admin (the count tabs first) |
| Cash count | `src/components/CashForm.js` | "New drawer count", "Location", "Cash drawer", "Date", "Shift", "Opening"/"Closing", "Starting drawer", "Cash sales", "Paid out / drops", "Counted now"/"Counted at close", "Count cash by denomination", "Coins", "Counter total", "Expected in drawer", "Over / short", "Blind count", "Save & sign entry" / "Saving…", the footer helper line |
| Scratch count | `src/components/ScratchForm.js` | "Scratch-off pack count", "Game name", "Pack / book #", "Ticket price", "Start ticket #", "End ticket #", "Tickets sold", "Dollars sold", scanner title/hint, and the prefill/scan toasts |
| Inventory count | `src/components/InventoryForm.js` | "Inventory count", "Item", "Start qty (last count)", "Received (deliveries)", "Sold since last count", "Removed (damage/returns)", "Counted on hand", "Expected on hand", the `unit`s readouts, scanner strings |
| Toasts | raised via `onSaved` / `ping` in `AppShell` | "Cash entry signed & saved", "Scratch-off entry signed & saved", "Inventory count signed & saved", "Pick a location first", "Pick a drawer first", "Save failed — check connection", the blind-mode `Saved — over/short …` results, "Pack scanned", "Selected {item}" |

Everything else — Log, Notes, Incidents, Time, Dashboard, Admin, the `/guide` and
`/docs` pages — is **Phase 2** (see Phasing). Doing the count path as one complete,
reviewable slug (rather than sprinkling `t()` app-wide and leaving it 60% done) is
the point: a screen that is 70% Spanish and 30% English is *worse than all-English*
for this population, because the leftover English reads as evidence the translation
can't be trusted.

---

## Low-literacy / icon-forward treatment (count path)

Translation alone is table stakes. The count path also gets a treatment that lets a
clerk operate it **without reading fluently in any language** — meaning carried by a
glyph, reinforced by the label in their language. This is the part that "just add
Spanish labels" would miss.

- **Tabs get a glyph, not just a word.** The `AppShell` tab bar renders text only
  today (`{t.label}`). Add a per-tab icon that is the constant recognition anchor —
  Cash 💵, Scratch-offs 🎟️, Inventory 📦, Log 📋, Notes 📝, Time ⏱️, Dashboard 📊 —
  with the localized word beneath/beside it. The glyph is what a clerk learns; the
  word reinforces it. (The digit/`[`·`]` keyboard shortcuts in `lib/shortcuts.js`
  are unaffected — they key off tab *index*, not label.)
- **Primary actions lead with an icon.** "Save & sign entry" pairs a ✓ / ✍️ glyph
  with the localized label; "Sign in" and the denomination toggle (already
  `🧮 Count cash by denomination`) follow the same pattern. For the two highest-stakes
  actions during a transition, an optional **bilingual label** (English + Spanish
  stacked) can be offered — but as a deliberate, sparing choice, not default clutter.
- **Direction, not just words, on the readout.** The Over / short panel already
  encodes sign and color (`+`/`−`, `text-pos` / `text-neg`). Pair it with a ▲ / ▼
  glyph so "over vs short" reads pre-linguistically; keep the semantic chip hues
  (short/over/watch) from the theme audit unchanged.
- **Lean on the language-neutral parts we already have.** The denomination counter
  (`$100 × count → money()`), the ticket-number math, and the qty fields are already
  numbers-and-glyphs, not prose — that is the model. Shift open/close can carry a
  sunrise/sunset glyph; the camera scan buttons already use 📷.
- **Bigger targets on the count path.** The primary Save button, the tab buttons,
  and the denomination-row inputs get comfortable minimum tap sizes (building on the
  16px-on-touch and tap-target work in `pwa-spec.md`), because the count is done fast,
  one-handed, behind a register.

All of the above are **design proposals** for Phase 1, to be built alongside the
Spanish count-path catalog — not a second, deferred project. Emoji glyphs are the
zero-dependency starting point; a small inline-SVG icon set (as `EmptyState` already
ships) is the natural upgrade if emoji rendering proves inconsistent across
devices.

---

## Failure handling — degrade to English, never to blank

| Condition | Behavior |
| --- | --- |
| No stored locale (first run) | `DEFAULT_LOCALE` = English; every screen is exactly as today. |
| Stored locale not in `LOCALES` (corrupt value) | Falls through to English, same as `resolveTheme()` treats a bad theme value. |
| Key missing in the active locale | Falls back to the English string for that key. |
| Key missing in **every** locale | Returns the key itself (e.g. `cash.title`) — visible and obviously-wrong as a dev signal, but **never an empty element**. The completeness test is what keeps this from reaching production. |
| Interpolation var not supplied | Leaves the `{placeholder}` literal in place rather than printing `undefined`. |
| `localStorage` unavailable (private mode) | `try/catch` swallows it and the app runs in memory at the default/last locale, identical to how `ThemeProvider` / `PrefsProvider` handle it. |

The through-line matches the AI specs' additive posture: localization can only ever
*improve* a screen over English, never break it — worst case, a clerk sees English,
which is exactly the app as it ships today.

---

## Testing

Same posture as the rest of the pure cores (`lib/shortcuts.js`, `lib/log-filter.js`,
`lib/log-search.js`): the pure module is unit-tested with `node --test`; the provider
(localStorage I/O) is not, same as `ThemeProvider`.

- **`tests/i18n.test.mjs`** (`npm run test:i18n`):
  - **Catalog completeness (the load-bearing test).** The key set of every locale in
    `LOCALES` equals the key set of `en` — no key in `en` is missing from `es`, and
    `es` has no stray key absent from `en`. This is what makes the extraction sweep
    safe to do incrementally: add a string, forget its Spanish, and CI goes red.
  - **Fallback chain.** A key present only in `en` resolves to English under `es`; a
    key present nowhere returns the key string (never `""`/`undefined`).
  - **Interpolation.** `{vars}` are all substituted; a missing var leaves its literal
    placeholder; a string with no vars is returned untouched.
  - **No empty values.** No catalog value is an empty string (a blank translation is
    a bug, distinct from a missing key).
- **Stretch (Phase 2):** a scan asserting the count-path components contain no bare
  string literal in a `label` / `placeholder` / JSX-text / toast position (i.e. every
  user-facing string goes through `t()`). Harder to make robust; noted, not required
  for Phase 1.

`translate()` / `CATALOG` are pure and fully covered; the model id / dependency
concerns of the AI specs don't apply here — there is no network and no key.

---

## Phasing

1. **Phase 1 — Spanish count path + mechanics. ✅ shipped** as one complete slug:
   `src/lib/i18n.js` (`translate`, `LOCALES`, `LANG_KEY`, `DEFAULT_LOCALE`,
   `resolveLocale`) + the completeness test; `LangProvider` and `useLang()`; the
   language row in `PreferencesMenu` and the picker on `PinLogin`; the full
   Spanish catalog for the count path (login → tab bar incl. the mobile bottom
   nav → the three forms → validation/save errors → their toasts); and the
   icon-forward treatment (tab glyphs, ✓ Save, 🌅/🌇 shift, ▲/▼ over-short).
   Validation messages localize via stable `code`s added to `count-validation.js`
   (its English `message` is unchanged, so nothing else moved); the save-failure
   line localizes via the `SAVE_FAILED` sentinel. Default English is unchanged;
   the server-authored `login()` error prose is the one deferred string (Phase 2,
   with the API layer).
2. **Phase 2 — the rest of the app.** Extract and translate the remaining
   user-facing surfaces: Log (`LogList`), Notes, Incidents, Time, Dashboard, Admin,
   and the `/guide` + `/docs` pages. Purely more catalog entries and more `t()`
   calls — the mechanics don't change. The completeness test keeps each screen honest
   as it lands.
3. **Phase 3 — more locales + RTL.** Additional locales are *just another object* in
   the catalog and one more entry in `LOCALES`. **RTL / Arabic is explicitly larger
   and later:** it needs `dir="rtl"` on the document, an audit for logical (vs
   left/right) CSS properties, mirrored layouts and iconography, and re-testing the
   count path in a mirrored frame. It is called out here so the Phase 1 module design
   doesn't accidentally preclude it (keys and interpolation are direction-agnostic),
   but it is **not** in this spec's build scope.

Sequencing note, stated plainly: build the mechanics + completeness test first
(cheap, testable, low risk), *then* do the count-path sweep (highest ROI — the
screens clerks touch every shift), and only then the long tail. Don't let the count
path ship half-translated.

---

## Acceptance criteria (Phase 1)

- With the locale **English** (default), `PinLogin`, the `AppShell` tab bar, and the
  three count forms are **byte-identical** to today — localization is off unless chosen.
- Setting **Spanish** (in Settings or on the login card) translates login, the tab
  bar, all three count forms, and every toast they raise, with **no English left on
  the count path**.
- Every count-path **tab and primary action carries a language-neutral glyph**, so
  recognition does not depend on reading the label.
- A missing or newly-added key **falls back to English**, never a blank element; a
  key missing everywhere shows the key as a dev signal only. The **completeness test
  passes** (the `en` and `es` key sets are equal).
- The language choice **persists per device** (`duocount-lang`), survives reload, and
  mirrors the theme/FAB posture: it never writes to the vendor record, needs no
  Firestore rules, and never changes what a coworker sees.
- `translate()` and the catalogs are **pure and unit-tested**; **no runtime i18n
  dependency** is added; the locale id lives in one place (`LOCALES` / `DEFAULT_LOCALE`).

---

## Out of scope / later

- **Any locale beyond Spanish, and RTL / Arabic** — Phase 3. The module is designed
  not to preclude them, but they aren't built here.
- **The rest of the app** (Log, Notes, Incidents, Time, Dashboard, Admin, guide/docs)
  — Phase 2; the count path is the Phase 1 line.
- **User-authored store data** — note text, incident write-ups, and item / game /
  drawer / location names are the store's own content, not UI chrome. They are shown
  verbatim and **never machine-translated**; translating them would be both wrong
  (they're proper nouns and free text) and a privacy surface.
- **Fixed-light, non-UI output.** The email digest (`lib/digest.js`), the PDF / print
  report (`ReportModal`), and the AI **digest narrative** and **log-search** prose are
  separate surfaces with their own posture (paper and email are always fixed-light per
  `ui-enhancements-spec.md` §3.3; the narrative is model-authored English prose that
  pseudonymizes names per `ai-features-spec.md`). Localizing model-generated prose is a
  distinct problem — not a catalog entry — and is not attempted here.
- **Locale-aware number / currency / date formatting** beyond what `money()` already
  does. Phase 1 targets US stores in USD, so `$` and existing formatting stay; full
  `Intl`-based decimal/date localization is deferred.
- **Server-persisted, per-user locale.** Phase 1 is per-device `localStorage`, exactly
  like the theme. A locale stored on the user profile (so it follows a clerk across
  shared devices) is a reasonable later addition, but it is not this spec.
- **ICU pluralization / gender machinery.** Two-locale per-key plurals are handled
  inline; the general framework is intentionally not adopted (see *Why not a
  framework*).
