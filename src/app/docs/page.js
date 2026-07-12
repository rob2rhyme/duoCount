import Link from "next/link";
import Logo from "@/components/Logo";
import { PRODUCT } from "@/lib/store";
import { listDocs } from "@/lib/docs";

export const metadata = {
  title: "DuoCount — Documentation",
  description: "Guides and product specs for DuoCount.",
};

// getting-started is the hero (its own /guide route); these read as overviews.
const HERO = "getting-started";
const OVERVIEW = ["app-summary-spec", "positioning-one-pager", "roadmap"];

function DocCard({ doc }) {
  return (
    <Link
      href={`/docs/${doc.slug}`}
      className="card block px-4 py-3.5 hover:bg-panel hover:border-brass/40 transition group"
    >
      <div className="font-semibold text-[14.5px] group-hover:text-gold transition">{doc.title}</div>
      {doc.blurb && <div className="text-[12.5px] text-muted mt-1 leading-snug">{doc.blurb}</div>}
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
  const bySlug = Object.fromEntries(all.map((d) => [d.slug, d]));

  const overviewSet = new Set([HERO, ...OVERVIEW]);
  const overview = OVERVIEW.map((s) => bySlug[s]).filter(Boolean);
  const specs = all.filter((d) => !overviewSet.has(d.slug) && d.slug.endsWith("-spec"));
  const more = all.filter((d) => !overviewSet.has(d.slug) && !d.slug.endsWith("-spec"));

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

        <Link
          href="/guide"
          className="flex items-start gap-3 bg-highlight border border-brass/40 rounded-xl px-4 py-3.5 mb-8 hover:border-brass transition"
        >
          <span className="text-xl leading-none mt-0.5" aria-hidden>📖</span>
          <span>
            <span className="block font-semibold text-sm">New here? Read the User Guide</span>
            <span className="block text-[12.5px] text-muted mt-0.5">A plain-language walkthrough for owners, managers, and staff — set up your store, log counts, and pull reports.</span>
          </span>
          <span className="ml-auto text-muted self-center" aria-hidden>→</span>
        </Link>

        <Section title="Overview" docs={overview} />
        <Section title="Feature specs" docs={specs} />
        <Section title="Analysis & reference" docs={more} />

        <p className="text-[12px] text-muted mt-4 pt-5 border-t border-line">
          <Link href="/guide" className="underline underline-offset-2 hover:text-fg">User guide</Link>
          {" · "}
          <Link href="/" className="underline underline-offset-2 hover:text-fg">← Back to the app</Link>
        </p>
      </div>
    </main>
  );
}
