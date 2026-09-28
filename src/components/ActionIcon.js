// Line icons for the developer console's per-store actions — inline SVG
// (feather-style, stroke = currentColor), same construction as DocIcon so
// nothing external loads and each glyph inherits its button's colour, including
// the red `text-neg` on the destructive ones and the dimming when disabled.
//
// These sit BESIDE the existing text label, never instead of it. The row mixes
// a reversible action (Suspend) with a destructive one (Delete store) and an
// irreversible-feeling one (Reset owner PIN); at a glance on a phone those are
// six similar green pills, and the icon is what makes the one you want findable
// without reading every label. Decorative by construction — the label is the
// button's accessible name, so every glyph is aria-hidden and the icon carries
// no information the text doesn't already say.
const PATHS = {
  // Temporarily stop — pause, not stop, because suspending is reversible.
  suspend: <><circle cx="12" cy="12" r="10" /><line x1="10" y1="15" x2="10" y2="9" /><line x1="14" y1="15" x2="14" y2="9" /></>,
  // Bring a suspended store back online.
  reactivate: <><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></>,
  // Undo a delete — the counter-clockwise arrow, distinct from reactivate's power symbol.
  restore: <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>,
  billing: <><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></>,
  rename: <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />,
  // An internal remark about the store, so a speech bubble rather than a page.
  note: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  pin: <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />,
  delete: <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
};

export default function ActionIcon({ name, size = 14, className = "" }) {
  const path = PATHS[name];
  // An unmapped name renders nothing rather than a fallback glyph: a wrong icon
  // on a destructive button is worse than no icon, and the label still reads.
  if (!path) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`flex-shrink-0 ${className}`} aria-hidden="true" focusable="false">
      {path}
    </svg>
  );
}
