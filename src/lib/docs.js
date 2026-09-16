// Server-only helpers that turn the Markdown in `docs/` into pages the Next app
// serves at /docs — so the documentation is reachable on the (public) Vercel
// deployment without depending on GitHub Pages (which a private repo can't use
// on the free plan). Pages are statically generated at build time; `docs/` ships
// in the repo, so no filesystem access happens at runtime.
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

const DOCS_DIR = path.join(process.cwd(), "docs");

// The Jekyll landing (index.md) is replaced by the app's own /docs page, so it
// isn't rendered as a slug.
function mdFiles() {
  try {
    return fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md") && f !== "index.md");
  } catch {
    return [];
  }
}

// Internal business/planning documents (pricing & positioning strategy, the
// competitor sweep, distribution plans, the /dev operator-console roadmap).
// They stay renderable at their direct /docs/<slug> URL — other docs link into
// them and existing bookmarks keep working — but they are NOT listed on the
// /docs index or included in the search index: the audience for the docs site
// is store owners and staff, not the company's own playbook.
const INTERNAL = new Set([
  "positioning-one-pager", "competitive-gap-analysis",
  "distribution-analysis", "distribution-decision-2026",
  "monetization-paths-2026", "dev-console-roadmap",
  // Operator-side credential procedures (what to do when the developer login or
  // a store owner is locked out). Store staff aren't the audience, and the page
  // names the env vars the deployment is configured with.
  "credential-recovery-runbook",
]);
const publicSlugs = () => docSlugs().filter((s) => !INTERNAL.has(s));

export function docSlugs() {
  return mdFiles().map((f) => f.replace(/\.md$/, ""));
}

// Pull the YAML-ish front matter (--- ... ---) off the top, returning a shallow
// key/value map plus the remaining body.
function stripFrontMatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: raw.slice(m[0].length) };
}

function titleOf(meta, body, slug) {
  if (meta.title) return meta.title;
  const h1 = /^#\s+(.+)$/m.exec(body);
  if (h1) return h1[1].trim();
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Point inter-doc links (`foo.md`) at their in-app routes, and the docs banner
// image at the bundled logo. Absolute URLs and #anchors are left alone.
function rewrite(html) {
  return html
    .replace(/href="(?!https?:|\/|#|mailto:)([^"#]+?)\.md(#[^"]*)?"/g, (_m, p, hash = "") => `href="/docs/${p}${hash}"`)
    .replace(/(src|href)="\.?\/?duocount-logo\.png"/g, '$1="/logo.png"');
}

const decodeEntities = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");

// GitHub-flavored heading slug: lowercase, drop punctuation (keep word chars,
// spaces, hyphens), spaces → hyphens. Deliberately matches GitHub so the
// hand-written intra-doc anchor links in the Markdown (e.g. `#for-owners--managers`,
// which keeps a double hyphen where a `&` was removed) resolve to the ids we emit.
const slugifyHeading = (s) =>
  decodeEntities(s).trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s/g, "-") || "section";

// Add ids to h2/h3 so headings are jump targets, and collect a table of contents.
// Ids are de-duplicated GitHub-style (a repeat gets `-1`, `-2`, …).
function withHeadingIds(html) {
  const toc = [];
  const used = new Map();
  const out = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, level, inner) => {
    const text = decodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
    let id = slugifyHeading(inner);
    if (used.has(id)) { const n = used.get(id) + 1; used.set(id, n); id = `${id}-${n}`; }
    else used.set(id, 0);
    toc.push({ level: Number(level), id, text });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: out, toc };
}

export function getDoc(slug) {
  if (!/^[a-z0-9-]+$/i.test(String(slug))) return null;
  const file = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const { meta, body } = stripFrontMatter(raw);
  const title = titleOf(meta, body, slug);
  // Drop a leading H1 — the page renders the title itself.
  const bodyNoH1 = body.replace(/^\s*#\s+.+\r?\n+/, "");
  const { html, toc } = withHeadingIds(rewrite(marked.parse(bodyNoH1, { gfm: true, async: false })));
  return { slug, title, html, toc };
}

// A one-line blurb for the index: the first real paragraph after the H1, with
// markdown stripped and truncated. Falls back to "" when there's nothing usable.
function blurbOf(body) {
  const noH1 = body.replace(/^\s*#\s+.+\r?\n+/, "");
  for (const block of noH1.split(/\r?\n\r?\n/)) {
    const line = block.trim();
    if (!line || line.startsWith("#") || line.startsWith("|") || line.startsWith("```") || line.startsWith(">")) continue;
    const plain = line
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[#*_>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (plain.length < 4) continue;
    // Spec docs open with an engineering "Status: built — …" line; a card blurb
    // should say what the doc IS, not its build state — skip to the next
    // paragraph instead of front-loading project-management prose.
    if (/^status\b/i.test(plain)) continue;
    return plain.length > 140 ? plain.slice(0, 137).trimEnd() + "…" : plain;
  }
  return "";
}

export function listDocs() {
  return publicSlugs()
    .map((slug) => {
      const { meta, body } = stripFrontMatter(fs.readFileSync(path.join(DOCS_DIR, `${slug}.md`), "utf8"));
      return { slug, title: titleOf(meta, body, slug), blurb: blurbOf(body) };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

// Plain, searchable text from rendered HTML: drop tags, decode entities, collapse
// whitespace, and cap length so the shipped index stays small.
function htmlToText(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

// A build-time search index shipped to the client for the /docs + /guide search
// box: one entry per doc with its title, heading anchors, and plain body text.
// Pure ranking over this index lives in ./doc-search.js.
export function searchIndex() {
  return publicSlugs()
    .map((slug) => {
      const doc = getDoc(slug);
      if (!doc) return null;
      return {
        slug,
        title: doc.title,
        headings: doc.toc.map((h) => ({ id: h.id, text: h.text })),
        text: htmlToText(doc.html),
      };
    })
    .filter(Boolean);
}
