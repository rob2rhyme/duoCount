import Link from "next/link";
import { notFound } from "next/navigation";
import { docSlugs, getDoc } from "@/lib/docs";

// Pre-render every doc at build time; unknown slugs 404 rather than hitting the
// filesystem at runtime.
export const dynamicParams = false;

export function generateStaticParams() {
  return docSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  return { title: doc ? `${doc.title} — DuoCount docs` : "DuoCount docs" };
}

export default async function DocPage({ params }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  return (
    <main className="min-h-screen px-5 py-10">
      <div className="max-w-2xl mx-auto">
        <p className="text-[12px] text-muted mb-4">
          <Link href="/docs" className="underline underline-offset-2">← Documentation</Link>
        </p>
        <h1 className="text-2xl font-bold mb-5">{doc.title}</h1>
        <div className="doc-content" dangerouslySetInnerHTML={{ __html: doc.html }} />
        <p className="text-[12px] text-muted mt-10 pt-5 border-t border-line">
          <Link href="/docs" className="underline underline-offset-2">← All documents</Link>
          {" · "}
          <Link href="/" className="underline underline-offset-2">Back to the app</Link>
        </p>
      </div>
    </main>
  );
}
