import Link from "next/link";
import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import DocLayout from "@/components/DocLayout";
import DocSearch from "@/components/DocSearch";
import { PRODUCT } from "@/lib/store";
import { getDoc, searchIndex } from "@/lib/docs";

// The user guide lives at a short, memorable /guide URL. It renders the same
// plain-language walkthrough as docs/getting-started.md — one source of truth, so
// the guide and its /docs copy can never drift apart.
export const metadata = {
  title: "DuoCount — User Guide",
  description: "A plain-language guide to using DuoCount, for owners, managers, and staff.",
};

export default function GuidePage() {
  const doc = getDoc("getting-started");
  if (!doc) notFound();
  const index = searchIndex();

  const header = (
    <div className="mb-10">
      <div className="text-center">
        <div className="flex justify-center">
          <Logo src="/logo.png" alt="DuoCount" size={80} rounded="rounded-2xl" />
        </div>
        <div className="text-3xl font-extrabold tracking-tight mt-3">
          <span style={{ color: "var(--fg)" }}>Duo</span><span className="text-gold">Count</span>
        </div>
        <div className="text-[11px] uppercase tracking-[2px] text-muted mt-1.5">{PRODUCT.tagline}</div>
      </div>
      <div className="max-w-xl mx-auto mt-6">
        <DocSearch index={index} placeholder="Search all guides and docs…" />
      </div>
    </div>
  );

  const footer = (
    <p className="text-[12px] text-muted mt-12 pt-5 border-t border-line">
      <Link href="/docs" className="underline underline-offset-2 hover:text-fg">All documentation</Link>
      {" · "}
      <Link href="/" className="underline underline-offset-2 hover:text-fg">Back to the app</Link>
    </p>
  );

  return <DocLayout header={header} title="User Guide" html={doc.html} toc={doc.toc} footer={footer} />;
}
