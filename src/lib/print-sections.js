/**
 * Show/hide chooser for a printable report sheet.
 *
 * The scratch report prints four blocks — the KPI summary, By game, By staff,
 * and the Shift log — and not everyone wants all four. A store that prints the
 * sheet as a shift-handoff record only wants the Shift log; the by-game table
 * alone can run to a page of $0.00 rows for every game the state sells.
 *
 * The toggles live IN the print preview rather than in the app, because that's
 * where you find out you didn't want a section: you print, you see the noise,
 * and you fix it without closing the tab and starting over. The choice is
 * remembered per device so the next print opens the way you left it.
 *
 * This module is pure string-building so it can be unit-tested without a DOM.
 * The markup it emits is written into a popup the app opens (`about:blank`,
 * same origin), which is why persistence goes through `localStorage` under a
 * key both sides share.
 */

export const PRINT_SECTIONS_KEY = "duocount-print-sections";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Normalize a stored/parsed choice against the sections a given sheet offers.
 * Anything not explicitly `false` prints — a new section added later shows up
 * for everyone instead of being silently suppressed by a stale stored object,
 * and a corrupt value can never blank the whole sheet.
 */
export function resolvePrintSections(raw, ids = []) {
  const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const id of ids) out[id] = stored[id] !== false;
  return out;
}

/**
 * Read the remembered choice. Takes the storage object so tests (and SSR) can
 * pass their own; any failure — private mode, disabled storage, bad JSON —
 * falls back to "print everything" rather than throwing mid-print.
 */
export function readPrintSections(storage, ids = [], key = PRINT_SECTIONS_KEY) {
  let raw = null;
  try { raw = JSON.parse(storage?.getItem(key) || "null"); } catch { raw = null; }
  return resolvePrintSections(raw, ids);
}

/**
 * Wrap one block of the sheet so the toolbar can find and hide it.
 * `visible === false` renders it hidden from the start (the remembered choice)
 * without dropping it from the document, so re-checking the box brings it back
 * with no reprint.
 */
export function printSection(id, html, visible = true) {
  if (!html) return "";
  return `<section data-print-sec="${esc(id)}"${visible ? "" : ` style="display:none"`}>${html}</section>`;
}

/**
 * The chooser itself: a sticky, never-printed strip of checkboxes.
 *
 * `sections` is `[{ id, label, present }]` — a section with `present: false`
 * (no rows in this range) gets no checkbox, so the strip only ever offers
 * choices that would change the page.
 */
export function printSectionsToolbarHtml(sections = [], { state = {}, label = "Include", printLabel = "", storageKey = PRINT_SECTIONS_KEY } = {}) {
  const shown = sections.filter((s) => s && s.present !== false);
  // One choice is no choice — don't spend a toolbar on it.
  if (shown.length < 2) return "";
  const boxes = shown.map((s) => {
    const on = state[s.id] !== false;
    return `<label><input type="checkbox" data-sec="${esc(s.id)}"${on ? " checked" : ""}> ${esc(s.label)}</label>`;
  }).join("");
  return `<style>
    .dc-tools{position:sticky;top:0;z-index:8;display:flex;gap:6px;flex-wrap:wrap;align-items:center;
      font:600 12px Helvetica,Arial,sans-serif;background:#fff;border:1px solid #bbb;border-radius:9px;
      padding:7px 10px;margin:0 96px 14px 0;box-shadow:0 1px 5px rgba(0,0,0,.15)}
    .dc-tools .t{color:#666;text-transform:uppercase;letter-spacing:.04em;font-size:10px;margin-right:2px}
    .dc-tools label{display:inline-flex;align-items:center;gap:5px;cursor:pointer;padding:3px 8px;
      border:1px solid #ddd;border-radius:7px;font-weight:600}
    .dc-tools .go{margin-left:auto;font:600 12px Helvetica,Arial,sans-serif;padding:4px 11px;
      border:1px solid #bbb;border-radius:7px;background:#f6f6f4;color:#1a241c;cursor:pointer}
    @media print{.dc-tools{display:none}}
    </style>
    <div class="dc-tools"><span class="t">${esc(label)}</span>${boxes}${
      // The browser fires its own print dialog as soon as the sheet opens, so
      // after a toggle you'd otherwise have to go hunt for Ctrl+P.
      printLabel ? `<button class="go" type="button" onclick="window.print()">${esc(printLabel)}</button>` : ""}</div>
    <script>(function(){
      var boxes=[].slice.call(document.querySelectorAll('.dc-tools input[data-sec]'));
      function apply(b){var el=document.querySelector('[data-print-sec="'+b.getAttribute('data-sec')+'"]');
        if(el)el.style.display=b.checked?'':'none';}
      boxes.forEach(function(b){b.addEventListener('change',function(){
        apply(b);
        try{var s={};boxes.forEach(function(x){s[x.getAttribute('data-sec')]=x.checked;});
          localStorage.setItem(${JSON.stringify(storageKey)},JSON.stringify(s));}catch(e){}
      });});
    })();</script>`;
}
