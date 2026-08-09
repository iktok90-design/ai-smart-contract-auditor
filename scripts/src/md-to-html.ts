#!/usr/bin/env node
/**
 * Tiny standalone Markdown → HTML converter for sample reports.
 * Avoids adding a marked/markdown-it dep just for this — supports the subset of MD
 * we actually use in samples/: headings, code fences, tables, links, bold, lists, blockquotes.
 *
 * Usage:
 *   md-to-html --in <file.md> --out <file.html> [--title "Page title"]
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[k] = v;
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  // Order matters. Code first to avoid escaping inside.
  return s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCode: false | string = false;
  let inTable = false;
  let inList = false;
  let frontMatter = false;
  let frontMatterDone = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Front-matter (skip YAML between --- markers at top of file)
    if (i === 0 && line.trim() === "---") { frontMatter = true; continue; }
    if (frontMatter && !frontMatterDone) {
      if (line.trim() === "---") { frontMatterDone = true; frontMatter = false; }
      continue;
    }

    // Code fence
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      if (inCode === false) {
        inCode = fence[1] || "plaintext";
        out.push(`<pre><code class="lang-${inCode}">`);
      } else {
        out.push("</code></pre>");
        inCode = false;
      }
      continue;
    }
    if (inCode !== false) {
      out.push(escapeHtml(line));
      continue;
    }

    // Tables — simple: detect `| ... |` pattern + separator row
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
      const next = lines[i + 1] || "";
      const isHeaderSep = /^\s*\|[-:|\s]+\|\s*$/.test(next);
      if (!inTable && isHeaderSep) {
        inTable = true;
        out.push("<table>");
        out.push("<thead><tr>" + cells.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead>");
        out.push("<tbody>");
        i++; // skip separator
        continue;
      }
      if (inTable) {
        out.push("<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
        continue;
      }
    } else if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
    }

    // Lists
    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      if (!inList) {
        out.push(/^\d+\./.test(listMatch[2]) ? "<ol>" : "<ul>");
        inList = true;
      }
      out.push(`<li>${inline(listMatch[3])}</li>`);
      continue;
    } else if (inList && line.trim() === "") {
      out.push("</ul>");
      inList = false;
    } else if (inList) {
      out.push("</ul>");
      inList = false;
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      continue;
    }

    // Horizontal rule
    if (/^-{3,}\s*$/.test(line)) {
      out.push("<hr>");
      continue;
    }

    // Paragraphs / blanks
    if (line.trim() === "") {
      out.push("");
      continue;
    }
    out.push(`<p>${inline(line)}</p>`);
  }

  if (inCode !== false) out.push("</code></pre>");
  if (inTable) out.push("</tbody></table>");
  if (inList) out.push("</ul>");

  return out.join("\n");
}

const PAGE_TPL = (title: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<base href="/AuditSentry/">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — AuditSentry</title>
<meta name="theme-color" content="#0a0904">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/docs.css">
</head>
<body>
<div class="bg-honeycomb"></div>
<div class="bg-grain"></div>

<nav class="nav">
  <div class="nav-inner">
    <a class="logo" href="index.html"><span class="logo-mark"></span>RUGPROOF</a>
    <div class="nav-links">
      <a href="index.html#features">features</a>
      <a href="index.html#stack">stack</a>
      <a href="index.html#install">install</a>
      <a href="gallery/">gallery</a>
      <a href="docs/" style="color: var(--honey);">docs</a>
      <a class="cta" href="https://github.com/iktok90-design/AuditSentry">github →</a>
    </div>
  </div>
</nav>

<main class="doc">
${body}
</main>

<footer>
  <div class="container">
    <div class="footer-bottom">
      <a href="docs/" style="color: var(--text-mid); text-decoration: none;">← all docs</a>
      <span>v0.1.0</span>
    </div>
  </div>
</footer>

<script src="assets/animations.js"></script>
</body>
</html>
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in || !args.out) {
    console.error("usage: md-to-html --in <file.md> --out <file.html> [--title T]");
    process.exit(1);
  }
  const md = await readFile(resolve(args.in), "utf-8");
  const body = mdToHtml(md);
  // Use first H1 as title if not provided
  const titleMatch = md.match(/^#\s+(.+)$/m);
  const title = args.title || titleMatch?.[1] || basename(args.in);
  await writeFile(resolve(args.out), PAGE_TPL(title, body), "utf-8");
  console.log(`✓ ${args.out}`);
}

main().catch((err) => {
  console.error("md-to-html failed:", err);
  process.exit(1);
});
