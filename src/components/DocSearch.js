"use client";
import { useMemo, useState, useId } from "react";
import Link from "next/link";
import { searchDocs } from "@/lib/doc-search";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Wrap the matched query words in <mark> so hits stand out in titles + snippets.
function Highlight({ text, terms }) {
  if (!terms || !terms.length || !text) return text || null;
  const set = new Set(terms.map((t) => t.toLowerCase()));
  const re = new RegExp(`(${terms.map(escapeRe).join("|")})`, "gi");
  return String(text).split(re).map((part, i) =>
    set.has(part.toLowerCase())
      ? <mark key={i} className="rounded bg-highlight px-0.5 font-semibold text-fg">{part}</mark>
      : <span key={i}>{part}</span>);
}

// A live search box over the whole documentation set (all of /docs and the
// /guide). Ranking is the pure searchDocs() over a build-time index passed in as
// a prop; results deep-link to the matching doc + heading. Client-only (needs
// input state), but does no fetching — the index ships with the page.
export default function DocSearch({ index = [], placeholder = "Search the documentation…" }) {
  const [q, setQ] = useState("");
  const listId = useId();
  const results = useMemo(() => searchDocs(index, q), [index, q]);
  const active = q.trim().length >= 2;

  return (
    <div className="relative mb-7">
      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="15" height="15"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          className="input pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
          placeholder={placeholder}
          aria-label="Search the documentation"
          aria-expanded={active}
          aria-controls={listId}
          role="combobox"
          autoComplete="off"
        />
      </div>

      {active && (
        <div id={listId} role="listbox" aria-label="Search results"
          className="absolute z-20 mt-2 w-full max-h-[60vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-xl">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted">No matches for “{q.trim()}”.</div>
          ) : (
            results.map((r) => (
              <Link key={r.slug} role="option" aria-selected="false"
                href={`/docs/${r.slug}${r.anchor ? `#${r.anchor}` : ""}`}
                onClick={() => setQ("")}
                className="block border-b border-line px-4 py-3 transition last:border-0 hover:bg-panel">
                <div className="text-[14px] font-semibold"><Highlight text={r.title} terms={r.terms} /></div>
                {r.snippet && (
                  <div className="mt-0.5 text-[12.5px] leading-snug text-muted"><Highlight text={r.snippet} terms={r.terms} /></div>
                )}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
