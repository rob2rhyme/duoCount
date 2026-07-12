import Link from "next/link";
import { notFound } from "next/navigation";
import DocLayout from "@/components/DocLayout";
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

  const header = (
    <p className="text-[12px] text-muted mb-6">
      <Link href="/docs" className="underline underline-offset-2 hover:text-fg">← Documentation</Link>
    </p>
  );

  const footer = (
    <p className="text-[12px] text-muted mt-12 pt-5 border-t border-line">
      <Link href="/docs" className="underline underline-offset-2 hover:text-fg">← All documents</Link>
      {" · "}
      <Link href="/guide" className="underline underline-offset-2 hover:text-fg">User guide</Link>
      {" · "}
      <Link href="/" className="underline underline-offset-2 hover:text-fg">Back to the app</Link>
    </p>
  );

  return <DocLayout header={header} title={doc.title} html={doc.html} toc={doc.toc} footer={footer} />;
}
