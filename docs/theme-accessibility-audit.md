---
title: Theme & accessibility audit
---

# DuoCount — Theme & Accessibility Audit

**Status:** complete. Every text/background pairing in both themes was measured
against **WCAG 2.1 contrast** thresholds; the failures found were fixed at the
token level, and the results are recorded below so the check is repeatable.

**Method.** Colours are not eyeballed. The theme tokens (`globals.css`), the
fixed brand colours (Tailwind config), and the fixed-palette status colours were
run through a WCAG relative-luminance contrast calculation for every meaningful
foreground/background pair, in **light and dark**. Thresholds:

- **4.5:1** — normal text (AA).
- **3:1** — large text (≥18.66 px bold or ≥24 px) and non-text UI indicators
  (AA — WCAG 1.4.11).
- Disabled controls are **exempt** from contrast (WCAG 1.4.3) but must still be
  perceivably inactive.

The `.pill` status chips are `text-[11px] font-bold` — 11 px bold is **not**
"large text", so they are held to the full **4.5:1**.

## What was found and fixed

| # | Issue | Before | After | Fix |
| --- | --- | --- | --- | --- |
| 1 | **Inline over/short + status text illegible in dark mode.** `text-green-700` / `text-red-600` are fixed light-palette colours that don't adapt; on the dark card surface they fell to **3.27 / 3.40** (fail 4.5). | 3.27 / 3.40 | **7.65 / 5.94** | New theme-aware `--pos` / `--neg` tokens (`text-pos` / `text-neg`), dark values `#45c877` / `#f87171`. Swapped every **inline** status number/label (cash & inventory over-short, dashboard tables, scratch sold, verify line, pack "unaccounted", login errors, Sign-out). |
| 2 | **Red status chips failed AA.** `text-red-600` on `bg-red-100` = **3.95** (fail 4.5). | 3.95 | **5.30** | Chip text → `text-red-700`. (Green chip 4.57 and amber chip 4.51 already passed.) |
| 3 | **`faint` tier failed even large-text contrast** (2.65–3.57) yet was used for real informational text. | 2.65–3.57 | 4.1–5.0 | Darkened `--faint` (light `#7a766c`, dark `#83858f`) so it clears AA-Large everywhere (≈4.5 on surface); and **reclassified genuine content** (help paragraphs, "Awaiting verification", "(units)", owner-only note, status history) from `faint` → `muted`. `faint` now backs only input **placeholders** and one decorative footer line. |
| 4 | **`muted` on `subtle` chips** at **4.49** — a hair under 4.5. | 4.49 | **4.92** | Darkened light `--muted` `#6d6a61` → `#67645b` (improves every muted pairing). |
| 5 | **Disabled controls not perceivable.** The custom `var(--field)` background overrode the browser's default graying, so disabled buttons/inputs looked active. | — | opacity .5/.55 + `not-allowed` | Added `.btn:disabled` / `.input:disabled` rules. |

## Verified — passing

Measured ratios after the fixes (lowest of the relevant backgrounds shown):

| Role | Light | Dark |
| --- | --- | --- |
| Primary text `fg` on bg/surface/panel/subtle/field | 13.97–16.81 ✓ | 10.95–15.08 ✓ |
| Secondary `muted` on bg/surface/panel/subtle | 4.92–5.91 ✓ | 4.84–6.66 ✓ |
| Positive `pos` on surface/panel/bg | 4.95–5.44 ✓ | 7.10–8.55 ✓ |
| Negative `neg` on surface/panel/bg | 4.92–5.41 ✓ | 5.51–6.64 ✓ |
| Gold accent `gold` on surface / highlight | 4.96–5.34 ✓ | 8.18–8.94 ✓ |
| Status chips (red-700/green-700/amber-700 on their -100) | 5.30 / 4.57 / 4.51 ✓ | identical (chips are light in both themes, by design) |
| Header `paper` on `ink`; store-code line | 15.28 / 9.84 ✓ | (fixed brand — same) |
| Role badges `ink` on brass / manager-gold | 5.21 / 7.04 ✓ | (fixed brand — same) |
| **Focus indicator** — brass border on focused field (≥3:1) | 3.14 ✓ | 5.33 ✓ |
| `faint` placeholders / decorative (held to ≥3:1) | 4.1–4.5 ✓ | 4.2–5.0 ✓ |

## Checklist

- [x] Every `fg` / `muted` text pairing ≥ 4.5:1 in **both** themes.
- [x] All inline status text (over/short, verify, errors) theme-aware and ≥ 4.5:1.
- [x] All status chips ≥ 4.5:1 (red chip fixed).
- [x] `faint` reserved for placeholders + decoration; all real content on `muted`+.
- [x] Focus indicator (brass border + ring) ≥ 3:1 vs the field, both themes.
- [x] Disabled buttons/inputs visually inactive (opacity + `not-allowed`).
- [x] Native controls (`select`, scrollbars, date pickers) follow the theme via
      `color-scheme` (`ThemeProvider`).
- [x] Fixed-colour elements (dark header, brand badges, logo matte) verified
      readable in both themes and intentionally constant.
- [x] No-flash boot script prevents a light→dark flicker before contrast applies.

## Intentional decisions

- **Status chips stay light pills in both themes.** Their internal text/background
  contrast passes AA in both, and a light pill on a dark card is a deliberate,
  legible convention. Re-theming them to dark-surface variants is an optional
  future polish, not a contrast fix.
- **PDF, print, and the email digest stay fixed light** — paper and email are
  always light, so those surfaces don't use the theme tokens.
- **Recharts** colours are resolved per-theme in JS (Recharts paints literal SVG
  colour strings), so they're covered by the chart palette, not these tokens.

## Reproducing

The contrast calculation is a plain WCAG relative-luminance function over the
token hex values; re-run it whenever a token or a fixed status colour changes,
and keep this table honest. Any new text role must be checked on the darkest
background it can land on (usually `bg` in light, `surface`/`panel` in dark).
