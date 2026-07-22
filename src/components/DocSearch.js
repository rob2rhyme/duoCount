"use client";
import { useMemo, useState, useId } from "react";
import Link from "next/link";
import { searchDocs } from "@/lib/doc-search";
import Highlight from "./Highlight";
import { useLang } from "./LangProvider";

// A live search box over the whole documentation set (all of /docs and the
// /guide). Ranking is the pure searchDocs() over a build-time index passed in as
// a prop; results deep-link to the matching doc + heading. Client-only (needs
// input state), but does no fetching — the index ships with the page.
export default function DocSearch({ index = [], placeholder }) {
  const { t } = useLang();
  const ph = placeholder ?? t("docsearch.placeholder");
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
        {/* Inline padding for the same cascade reason as SearchInput: `.input`'s
            px-3 is declared later and beats the pl-9 utility, sliding the text
            under the magnifier. The native search-cancel is hidden globally; the
            × below matches the shared SearchInput's clear control. */}
        <input
          type="search"
          className="input"
          style={{ paddingLeft: "2.25rem", paddingRight: "2rem" }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
          placeholder={ph}
          aria-label={t("docsearch.aria")}
          aria-expanded={active}
          aria-controls={listId}
          role="combobox"
          autoComplete="off"
        />
        {q && (
          <button type="button" aria-label={t("common.clear_search")} onClick={() => setQ("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-lg leading-none text-muted hover:text-fg">×</button>
        )}
      </div>

      {active && (
        <div id={listId} role="listbox" aria-label={t("docsearch.results")}
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
