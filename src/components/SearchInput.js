"use client";

// Shared search box for the list filters (Inventory / Log / Notes / Incidents) so
// every in-app search looks and behaves the same: a magnifier, a labelled input,
// Escape-to-clear, and a clear (×) button. Controlled — pass value + onChange.
export default function SearchInput({ value, onChange, placeholder = "Search…", label = "Search", className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="15" height="15"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
      </svg>
      {/* Inline padding, not pl-9/pr-8: `.input` declares px-3 later in the
          cascade, so the utility classes lose and the text slides under the
          magnifier. (The native search-cancel button is hidden in globals.css —
          the × below is the only clear control.) */}
      <input type="search" className="input" style={{ paddingLeft: "2.25rem", paddingRight: "2rem" }}
        value={value} aria-label={label} placeholder={placeholder}
        autoComplete="off" onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onChange(""); }} />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-lg leading-none text-muted hover:text-fg">×</button>
      )}
    </div>
  );
}
