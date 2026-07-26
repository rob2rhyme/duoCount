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
export default function DocLayout({ header, title, html, toc = [], footer, tocLabel = "On this page" }) {
  const hasToc = toc.length > 2;

  return (
    <main className="min-h-screen px-5 py-10">
      <div className="max-w-5xl mx-auto">
        {header}

        <div className={hasToc ? "lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12" : "max-w-2xl mx-auto"}>
          {hasToc && (
            <>
              {/* Mobile: a collapsible "On this page" */}
              <details className="lg:hidden card px-4 py-3 mb-7">
                <summary className="text-xs font-semibold uppercase tracking-wide text-muted cursor-pointer select-none">
                  {tocLabel}
                </summary>
                <div className="mt-3">
                  <TocList toc={toc} label={tocLabel} />
                </div>
              </details>

              {/* Desktop: a sticky sidebar */}
              <aside className="hidden lg:block lg:sticky lg:top-8 lg:self-start lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-r lg:border-line lg:pr-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">{tocLabel}</div>
                <TocList toc={toc} label={tocLabel} />
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
