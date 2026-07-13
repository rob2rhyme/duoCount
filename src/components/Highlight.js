"use client";
import { highlightSegments } from "@/lib/text-match";

// Renders `text` with the query `terms` wrapped in <mark>, via the shared
// segmenting so every search surface (docs search + the list filters) highlights
// matches the same way. Returns the text untouched when there are no terms.
export default function Highlight({ text, terms, markClassName = "rounded-[3px] bg-highlight px-0.5 font-semibold text-fg underline decoration-gold decoration-2 underline-offset-2" }) {
  const segments = highlightSegments(text, terms);
  return segments.map((seg, i) =>
    seg.match
      ? <mark key={i} className={markClassName}>{seg.text}</mark>
      : <span key={i}>{seg.text}</span>);
}
