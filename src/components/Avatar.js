// Premium initials avatar for people — the same badge language as the docs-card
// icons (gold on highlight, brass ring) so staff get the same treatment as
// content. Pure presentational: initials from the first two words of the name,
// with a person line-icon fallback when there's no name to draw from.
export default function Avatar({ name = "", inactive = false, className = "" }) {
  const initials = String(name).trim().split(/\s+/).slice(0, 2)
    .map((w) => (w[0] || "").toUpperCase()).join("");
  return (
    <span aria-hidden="true"
      className={`flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-highlight text-gold ring-1 ring-brass/30 text-[12px] font-bold tracking-wide ${inactive ? "opacity-50" : ""} ${className}`}>
      {initials || (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      )}
    </span>
  );
}
