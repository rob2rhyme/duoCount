import Link from "next/link";
import Logo from "@/components/Logo";
import { PRODUCT } from "@/lib/store";
import { listDocs } from "@/lib/docs";

export const metadata = {
  title: "DuoCount — Documentation",
  description: "Guides and product specs for DuoCount.",
};

// Surfaced first; the rest fall into "All documents".
const FEATURED = ["getting-started", "app-summary-spec", "roadmap", "positioning-one-pager"];

function DocCard({ doc }) {
  return (
    <Link href={`/docs/${doc.slug}`} className="card block px-4 py-3 hover:bg-panel transition">
      <span className="font-medium text-sm">{doc.title}</span>
    </Link>
  );
}

export default function DocsIndex() {
  const all = listDocs();
  const bySlug = Object.fromEntries(all.map((d) => [d.slug, d]));
  const featured = FEATURED.map((s) => bySlug[s]).filter(Boolean);
  const rest = all.filter((d) => !FEATURED.includes(d.slug));

  return (
    <main className="min-h-screen px-5 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-9">
          <div className="flex justify-center"><Logo src="/logo.png" alt="DuoCount" size={88} rounded="rounded-2xl" /></div>
          <div className="text-3xl font-extrabold tracking-tight mt-3">
            <span style={{ color: "var(--fg)" }}>Duo</span><span className="text-gold">Count</span>
          </div>
          <div className="text-[11px] uppercase tracking-[2px] text-muted mt-1.5">{PRODUCT.tagline}</div>
        </div>

        <h1 className="text-xl font-semibold">Documentation</h1>
        <p className="text-sm text-muted mt-1 mb-5">Plain-language guides and the product specs behind DuoCount.</p>

        <Link href="/guide" className="block bg-highlight border border-brass/40 rounded-xl px-4 py-3 mb-6 hover:bg-panel transition">
          <div className="font-semibold text-sm">📖 New here? Read the User Guide</div>
          <div className="text-[12px] text-muted mt-0.5">A plain-language walkthrough for owners, managers, and staff.</div>
        </Link>

        {featured.length > 0 && (
          <>
            <h2 className="label">Start here</h2>
            <div className="space-y-2 mb-6">
              {featured.map((d) => <DocCard key={d.slug} doc={d} />)}
            </div>
          </>
        )}

        <h2 className="label">All documents</h2>
        <div className="space-y-2">
          {rest.map((d) => <DocCard key={d.slug} doc={d} />)}
        </div>

        <p className="text-[12px] text-muted mt-9">
          <Link href="/" className="underline underline-offset-2">← Back to the app</Link>
        </p>
      </div>
    </main>
  );
}
