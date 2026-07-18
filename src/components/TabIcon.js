// Tab icons — curated inline-SVG line icons, one per screen, replacing the
// emoji glyphs. Same design language as the BottomNav group icons and the
// DocIcon set: 24×24 viewBox, currentColor stroke (theme-aware for free),
// round caps/joins, no external assets. Icons stay language-neutral, so the
// icon-forward localization treatment is unchanged.

const stroke = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.9,
  strokeLinecap: "round", strokeLinejoin: "round",
};

const PATHS = {
  // banknote — the cash drawer
  cash: (
    <>
      <rect x="2.75" y="6" width="18.5" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.25 9.5v5M17.75 9.5v5" />
    </>
  ),
  // ticket with a perforation — scratch-offs
  scratch: (
    <>
      <path d="M2.75 9.6V7.1a1.6 1.6 0 0 1 1.6-1.6h15.3a1.6 1.6 0 0 1 1.6 1.6v2.5a2.4 2.4 0 0 0 0 4.8v2.5a1.6 1.6 0 0 1-1.6 1.6H4.35a1.6 1.6 0 0 1-1.6-1.6v-2.5a2.4 2.4 0 0 0 0-4.8z" />
      <path d="M15 6.6v1.5M15 11.25v1.5M15 15.9v1.5" />
    </>
  ),
  // sealed carton — inventory
  inventory: (
    <>
      <path d="M21 8.1 12 3 3 8.1v7.8L12 21l9-5.1z" />
      <path d="M3.3 8.2 12 13.1l8.7-4.9M12 13.1V21" />
    </>
  ),
  // star — rewards
  rewards: (
    <path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1.05 5.9L12 17l-5.25 2.8L7.8 13.9 3.5 9.8l5.9-.8z" />
  ),
  // list with check ticks — the log
  log: (
    <>
      <path d="M4 6.5l1.4 1.4L8 5.4M4 12.2l1.4 1.4L8 11.1M4 17.9l1.4 1.4 2.6-2.5" />
      <path d="M11.5 6.6H20M11.5 12.3H20M11.5 18H20" />
    </>
  ),
  // pencil over a line — shift notes
  notes: (
    <>
      <path d="M12.5 20.25H21" />
      <path d="M16.7 3.8a2.05 2.05 0 0 1 2.9 2.9L7.4 18.9 3 20l1.1-4.4z" />
    </>
  ),
  // alert triangle — incidents
  incidents: (
    <>
      <path d="M10.3 4.1 2 18.1a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.2M12 17.4h.01" />
    </>
  ),
  // clock — time
  time: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.4V12l3.1 1.9" />
    </>
  ),
  // tile grid — the dashboard
  dashboard: (
    <>
      <rect x="3.4" y="3.4" width="7.4" height="9.4" rx="1.6" />
      <rect x="13.2" y="3.4" width="7.4" height="5.4" rx="1.6" />
      <rect x="13.2" y="11.2" width="7.4" height="9.4" rx="1.6" />
      <rect x="3.4" y="15.2" width="7.4" height="5.4" rx="1.6" />
    </>
  ),
  // storefront with awning — the portfolio of stores
  portfolio: (
    <>
      <path d="M4 9.6 5.3 4.5h13.4L20 9.6" />
      <path d="M4 9.6a2.2 2.2 0 0 0 4.1 1.1 2.2 2.2 0 0 0 3.9 0 2.2 2.2 0 0 0 3.9 0A2.2 2.2 0 0 0 20 9.6" />
      <path d="M5.1 12.4V19a1.2 1.2 0 0 0 1.2 1.2h11.4A1.2 1.2 0 0 0 18.9 19v-6.6" />
      <path d="M9.8 20.2v-5.4h4.4v5.4" />
    </>
  ),
  // gear — admin (the BottomNav admin gear, shared shape)
  admin: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 12.6H4a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5.6 6L5.5 6a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
};

export default function TabIcon({ id, size = 16, className = "" }) {
  const paths = PATHS[id];
  if (!paths) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}
      className={`flex-shrink-0 ${className}`} aria-hidden="true">
      {paths}
    </svg>
  );
}
