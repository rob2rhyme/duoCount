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

export function getDoc(slug) {
  if (!/^[a-z0-9-]+$/i.test(String(slug))) return null;
  const file = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const { meta, body } = stripFrontMatter(raw);
  const title = titleOf(meta, body, slug);
  // Drop a leading H1 — the page renders the title itself.
  const bodyNoH1 = body.replace(/^\s*#\s+.+\r?\n+/, "");
  const html = rewrite(marked.parse(bodyNoH1, { gfm: true, async: false }));
  return { slug, title, html };
}

export function listDocs() {
  return docSlugs()
    .map((slug) => {
      const { meta, body } = stripFrontMatter(fs.readFileSync(path.join(DOCS_DIR, `${slug}.md`), "utf8"));
      return { slug, title: titleOf(meta, body, slug) };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}
