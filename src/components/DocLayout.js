// Shared reading layout for /guide and /docs/[slug]: a branded/breadcrumb header,
// a table of contents (collapsible on mobile, a sticky sidebar on desktop), and
// the rendered doc. Server component — the only interactivity is a native
// <details> and in-page anchor links, so no client JS ships.

function TocList({ toc, label }) {
  return (
    <nav aria-label={label}>
      <ul className="space-y-1">
        {toc.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={`block leading-snug py-0.5 text-muted hover:text-fg transition ${
                h.level === 3 ? "pl-3 text-[12.5px]" : "text-[13px] font-medium"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// `tocLabel` lets a localized caller (GuideView) label the table of contents in
// the reader's language; the English /docs pages keep the default.
export default function DocLayout({
  header, title, html, toc = [], footer,
  tocLabel = "On this page", topLabel = "Back to top",
}) {
  const hasToc = toc.length > 2;
  // The chip row shows H2s only; H3s would overflow it into uselessness. If a
  // doc happens to be all H3s, fall back to whatever it has rather than
  // rendering an empty bar.
  const h2s = toc.filter((h) => h.level === 2);
  const jumpTargets = h2s.length > 1 ? h2s : toc;

  return (
    <main id="top" className="min-h-screen px-5 py-10">
      <div className="max-w-5xl mx-auto">
        {header}

        <div className={hasToc ? "lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12" : "max-w-2xl mx-auto"}>
          {hasToc && (
            <>
              {/* Mobile/tablet: a sticky row of jump chips. This used to be a
                  collapsed <details> — two taps and easy to miss, which is a bad
                  trade on a long legal page you are trying to find one clause in.
                  Sticky + horizontally scrollable keeps every section one tap
                  away no matter how far down you are. Top-level headings only,
                  so the row stays scannable. Still zero client JS. */}
              <nav
                aria-label={tocLabel}
                className="lg:hidden sticky top-0 z-20 -mx-5 mb-7 px-5 py-2.5 bg-bg/95 backdrop-blur border-b border-line"
              >
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted shrink-0 pr-1">
                    {tocLabel}
                  </span>
                  {jumpTargets.map((h) => (
                    <a
                      key={h.id}
                      href={`#${h.id}`}
                      className="shrink-0 whitespace-nowrap text-[12px] px-2.5 py-1 rounded-lg border border-line text-muted hover:text-fg hover:border-brass/50 transition"
                    >
                      {h.text}
                    </a>
                  ))}
                  <a
                    href="#top"
                    className="shrink-0 whitespace-nowrap text-[12px] px-2.5 py-1 rounded-lg border border-line text-muted hover:text-fg hover:border-brass/50 transition"
                  >
                    ↑ {topLabel}
                  </a>
                </div>
              </nav>

              {/* Desktop: a sticky sidebar */}
              <aside className="hidden lg:block lg:sticky lg:top-8 lg:self-start lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-r lg:border-line lg:pr-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">{tocLabel}</div>
                <TocList toc={toc} label={tocLabel} />
                <a href="#top" className="block mt-3 pt-3 border-t border-line-soft text-[12.5px] text-muted hover:text-fg transition">
                  ↑ {topLabel}
                </a>
              </aside>
            </>
          )}

          <article className="min-w-0">
            {title && <h1 className="text-2xl font-bold mb-5 scroll-mt-8">{title}</h1>}
            <div className="doc-content" dangerouslySetInnerHTML={{ __html: html }} />
            {footer}
          </article>
        </div>
      </div>
    </main>
  );
}
