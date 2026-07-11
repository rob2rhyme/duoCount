// Shared empty-state block: a soft icon badge, a title, a supporting line, and
// an optional call-to-action. Theme-aware (badge + glyph use semantic tokens),
// used by the Log, Notes, Incidents, and Dashboard screens so a first-run app
// reads as intentional rather than blank.

const svg = "24";
const base = { width: svg, height: svg, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };

export function IconReceipt(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M5 3.5h14v17l-2.3-1.5-2.35 1.5L12 20.5l-2.35 1.5L7.3 20.5 5 20.5z" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" />
    </svg>
  );
}
export function IconNote(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M4.5 5.5A1.5 1.5 0 0 1 6 4h12a1.5 1.5 0 0 1 1.5 1.5V14L14 19.5H6A1.5 1.5 0 0 1 4.5 18z" />
      <path d="M19.5 14H15.5A1.5 1.5 0 0 0 14 15.5v4" />
      <path d="M8 8.5h8M8 12h5" />
    </svg>
  );
}
export function IconShield(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M12 3l7 2.5v5c0 4.5-3 8.2-7 9.5-4-1.3-7-5-7-9.5v-5z" />
      <path d="M9 12l2 2 4-4.5" />
    </svg>
  );
}
export function IconChart(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M4 20h16" />
      <path d="M7 20v-6M12 20V6M17 20v-9" />
    </svg>
  );
}
export function IconClock(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
export function IconCalendar(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M4 9.5h16M8 3.5v4M16 3.5v4" />
    </svg>
  );
}

export default function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div className="text-center px-5 py-12">
      <div className="mx-auto mb-3.5 grid place-items-center w-14 h-14 rounded-2xl bg-subtle text-muted" aria-hidden="true">
        {icon}
      </div>
      <p className="font-semibold text-fg text-[15px]">{title}</p>
      {subtitle && (
        <p className="text-[13px] text-muted mt-1.5 max-w-[19rem] mx-auto leading-relaxed">{subtitle}</p>
      )}
      {action && (
        <button onClick={action.onClick}
          className="btn-ghost w-auto mx-auto mt-4 text-[13px] px-4 py-2">
          {action.label}
        </button>
      )}
    </div>
  );
}
