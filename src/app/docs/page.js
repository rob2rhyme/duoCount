import Link from "next/link";
import Logo from "@/components/Logo";
import DocSearch from "@/components/DocSearch";
import DocIcon from "@/components/DocIcon";
import { PRODUCT } from "@/lib/store";
import { listDocs, searchIndex } from "@/lib/docs";

export const metadata = {
  title: "DuoCount — Documentation",
  description: "Guides and product specs for DuoCount.",
};

// getting-started is the hero (its own /guide route) and its Spanish twin rides
// beside it — never in the technical buckets below. These read as overviews.
const HERO = ["getting-started", "getting-started-es"];
const OVERVIEW = ["faq", "faq-es", "app-summary-spec", "roadmap"];
// Each legal doc sits beside its Spanish twin — a Spanish-first clerk should
// never have to read a monitoring notice in a second language.
const LEGAL = [
  "terms-of-use", "terms-of-use-es",
  "privacy-and-data", "privacy-and-data-es",
  "legal-disclaimers", "legal-disclaimers-es",
];

function DocCard({ doc }) {
  return (
    <Link
      href={`/docs/${doc.slug}`}
      className="card flex items-start gap-3 px-4 py-3.5 hover:bg-panel hover:border-brass/40 transition group"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-highlight text-gold" aria-hidden="true">
        <DocIcon slug={doc.slug} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-[14.5px] group-hover:text-gold transition">{doc.title}</span>
        {doc.blurb && <span className="block text-[12.5px] text-muted mt-1 leading-snug">{doc.blurb}</span>}
      </span>
    </Link>
  );
}

function Section({ title, docs }) {
  if (!docs.length) return null;
  return (
    <section className="mb-8">
      <h2 className="label">{title}</h2>
      <div className="grid sm:grid-cols-2 gap-2.5">
        {docs.map((d) => <DocCard key={d.slug} doc={d} />)}
      </div>
    </section>
  );
}

export default function DocsIndex() {
  const all = listDocs();
  const index = searchIndex();
  const bySlug = Object.fromEntries(all.map((d) => [d.slug, d]));

  const legalSet = new Set(LEGAL);
  const overviewSet = new Set([...HERO, ...OVERVIEW]);
  const overview = OVERVIEW.map((s) => bySlug[s]).filter(Boolean);
  const legal = LEGAL.map((s) => bySlug[s]).filter(Boolean);
  const specs = all.filter((d) => !overviewSet.has(d.slug) && d.slug.endsWith("-spec"));
  const more = all.filter((d) => !overviewSet.has(d.slug) && !legalSet.has(d.slug) && !d.slug.endsWith("-spec"));

  return (
    <main className="min-h-screen px-5 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-9">
          <div className="flex justify-center"><Logo src="/logo.png" alt="DuoCount" size={84} rounded="rounded-2xl" /></div>
          <div className="text-3xl font-extrabold tracking-tight mt-3">
            <span style={{ color: "var(--fg)" }}>Duo</span><span className="text-gold">Count</span>
          </div>
          <div className="text-[11px] uppercase tracking-[2px] text-muted mt-1.5">{PRODUCT.tagline}</div>
        </div>

        <h1 className="text-xl font-semibold">Documentation</h1>
        <p className="text-sm text-muted mt-1 mb-6">Plain-language guides and the product specs behind DuoCount.</p>

        <DocSearch index={index} />

        <Link
          href="/guide"
          className="flex items-start gap-3 bg-highlight border border-brass/40 rounded-xl px-4 py-3.5 mb-2.5 hover:border-brass transition"
        >
          <span className="text-xl leading-none mt-0.5" aria-hidden>📖</span>
          <span>
            <span className="block font-semibold text-sm">New here? Read the User Guide</span>
            <span className="block text-[12.5px] text-muted mt-0.5">A plain-language walkthrough for owners, managers, and staff — set up your store, log counts, and pull reports.</span>
          </span>
          <span className="ml-auto text-muted self-center" aria-hidden>→</span>
        </Link>
        {/* The Spanish guide rides right under the hero — a Spanish-first clerk
            should never have to dig it out of a technical section. Links to the
            es doc directly so it reads in Spanish regardless of device setting. */}
        <Link
          href="/docs/getting-started-es"
          className="flex items-start gap-3 bg-highlight border border-brass/40 rounded-xl px-4 py-3.5 mb-8 hover:border-brass transition"
          lang="es"
        >
          <span className="text-xl leading-none mt-0.5" aria-hidden>📖</span>
          <span>
            <span className="block font-semibold text-sm">¿Prefieres español? Lee la Guía de uso</span>
            <span className="block text-[12.5px] text-muted mt-0.5">La misma guía completa, en español — configura tu tienda, registra conteos y saca reportes.</span>
          </span>
          <span className="ml-auto text-muted self-center" aria-hidden>→</span>
        </Link>

        <Section title="Overview" docs={overview} />
        <Section title="Feature specs" docs={specs} />
        <Section title="Analysis & reference" docs={more} />
        <Section title="Legal" docs={legal} />

        <p className="text-[12px] text-muted mt-4 pt-5 border-t border-line">
          <Link href="/guide" className="underline underline-offset-2 hover:text-fg">User guide</Link>
          {" · "}
          <Link href="/" className="underline underline-offset-2 hover:text-fg">← Back to the app</Link>
        </p>
      </div>
    </main>
  );
}
