import Link from "next/link";
import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import { PRODUCT } from "@/lib/store";
import { getDoc } from "@/lib/docs";

// The user guide lives at a short, memorable /guide URL. It renders the same
// plain-language walkthrough as docs/getting-started.md — one source of truth, so
// the guide and the /docs copy can never drift apart.
export const metadata = {
  title: "DuoCount — User Guide",
  description: "A plain-language guide to using DuoCount, for owners, managers, and staff.",
};

export default function GuidePage() {
  const doc = getDoc("getting-started");
  if (!doc) notFound();

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

        <h1 className="text-2xl font-bold mb-5">User Guide</h1>
        <div className="doc-content" dangerouslySetInnerHTML={{ __html: doc.html }} />

        <p className="text-[12px] text-muted mt-10 pt-5 border-t border-line">
          <Link href="/docs" className="underline underline-offset-2">All documentation</Link>
          {" · "}
          <Link href="/" className="underline underline-offset-2">Back to the app</Link>
        </p>
      </div>
    </main>
  );
}
