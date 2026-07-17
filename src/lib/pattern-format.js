// Render a pattern alert's { title, detail } from its stable `code` + `params`,
// in any locale. detectPatterns (patterns.js) emits code + params on every
// alert; the message templates live in the i18n catalog under
// `pattern.<code>.title` / `.detail`, so there is ONE source of English truth
// that both surfaces read:
//   - the fixed-English digest email renders with locale "en" (patterns.js
//     itself pre-renders title/detail this way, so the digest + the PII
//     redactor keep seeing byte-identical English and never change);
//   - the manager Dashboard renders with the reader's active locale.
//
// Pure and isomorphic (i18n.js is browser-safe) — no Firebase, no clock.

import { translate } from "./i18n.js";

// en + es both pluralize these prose nouns on the 1-vs-not-1 boundary, so a
// single `_one` / `_other` key pair covers both locales.
const plural = (n) => (Number(n) === 1 ? "_one" : "_other");

/**
 * @param {{ code: string, params?: object }} alert  an entry from detectPatterns
 * @param {string} locale  "en" | "es" (anything else falls back to English)
 * @returns {{ title: string, detail: string }}
 */
export function renderPattern(alert, locale) {
  const { code, params = {} } = alert || {};
  const t = (key) => translate(locale, key, params);
  // pack-gap is the only message with runtime plurals: the title pluralizes on
  // ticket count, the detail on how many count boundaries the gap spans.
  if (code === "pack-gap") {
    return {
      title: t(`pattern.pack-gap.title${plural(params.tickets)}`),
      detail: t(`pattern.pack-gap.detail${plural(params.boundaries)}`),
    };
  }
  return { title: t(`pattern.${code}.title`), detail: t(`pattern.${code}.detail`) };
}
