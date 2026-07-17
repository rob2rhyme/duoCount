import { notFound } from "next/navigation";
import GuideView from "@/components/GuideView";
import { PRODUCT } from "@/lib/store";
import { getDoc, searchIndex } from "@/lib/docs";

// The user guide lives at a short, memorable /guide URL. It renders the same
// plain-language walkthrough as docs/getting-started.md — one source of truth,
// so the guide and its /docs copy can never drift apart. Both language
// versions (en + docs/getting-started-es.md) are rendered at build time;
// GuideView shows the one matching the reader's per-device language.
export const metadata = {
  title: "DuoCount — User Guide",
  description: "A plain-language guide to using DuoCount, for owners, managers, and staff.",
};

export default function GuidePage() {
  const en = getDoc("getting-started");
  if (!en) notFound();
  const es = getDoc("getting-started-es");
  return <GuideView docs={{ en, es: es || en }} index={searchIndex()} tagline={PRODUCT.tagline} />;
}
