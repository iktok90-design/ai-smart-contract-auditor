#!/usr/bin/env node
/**
 * Render the audit report from findings JSON to Markdown + HTML + (optionally) PDF.
 *
 * Usage:
 *   render-report --findings <path> [--out-md <path>] [--out-html <path>] [--pdf <path>]
 *
 * --pdf requires `wkhtmltopdf` on PATH (brew install wkhtmltopdf | apt install wkhtmltopdf).
 * If wkhtmltopdf is missing, the command writes MD + HTML and reports the PDF error.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import Handlebars from "handlebars";

const here = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = resolve(here, "..", "..", "templates");

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

function severityLower(s: string): string {
  return (s || "info").toLowerCase();
}

async function which(cmd: string): Promise<string | null> {
  return new Promise((res) => {
    const p = spawn("which", [cmd], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (c) => (out += c.toString()));
    p.on("close", (code) => res(code === 0 ? out.trim() : null));
    p.on("error", () => res(null));
  });
}

async function htmlToPdf(htmlPath: string, pdfPath: string): Promise<{ ok: boolean; err?: string }> {
  const wk = await which("wkhtmltopdf");
  if (!wk) {
    return {
      ok: false,
      err: "wkhtmltopdf not found on PATH. Install: `brew install wkhtmltopdf` | `apt install wkhtmltopdf`",
    };
  }
  return new Promise((res) => {
    const p = spawn(wk, [
      "--enable-local-file-access",
      "--print-media-type",
      "--margin-top", "16mm",
      "--margin-bottom", "16mm",
      "--margin-left", "14mm",
      "--margin-right", "14mm",
      "--encoding", "UTF-8",
      htmlPath, pdfPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (c) => (stderr += c.toString()));
    p.on("close", (code) => res(code === 0 ? { ok: true } : { ok: false, err: stderr.trim() }));
    p.on("error", (err) => res({ ok: false, err: String(err) }));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.findings) {
    console.error("usage: render-report --findings <path> [--out-md path] [--out-html path] [--pdf path]");
    process.exit(1);
  }
  const findings = JSON.parse(await readFile(resolve(args.findings), "utf-8"));

  if (Array.isArray(findings.findings)) {
    findings.findings = findings.findings.map((f: any) => ({
      ...f, severity_lower: severityLower(f.severity),
    }));
  }

  const tplMd = await readFile(resolve(TPL_DIR, "report.md.hbs"), "utf-8");
  const tplHtml = await readFile(resolve(TPL_DIR, "report.html.hbs"), "utf-8");

  const md = Handlebars.compile(tplMd)(findings);
  const html = Handlebars.compile(tplHtml)(findings);

  const outMd = resolve(args["out-md"] ?? `audit-${findings.date ?? "now"}.md`);
  const outHtml = resolve(args["out-html"] ?? `audit-${findings.date ?? "now"}.html`);

  await writeFile(outMd, md, "utf-8");
  await writeFile(outHtml, html, "utf-8");

  console.log(`✓ wrote ${outMd}`);
  console.log(`✓ wrote ${outHtml}`);

  if (args.pdf && args.pdf !== "false") {
    const outPdf = resolve(args.pdf !== "true" ? args.pdf : `audit-${findings.date ?? "now"}.pdf`);
    const result = await htmlToPdf(outHtml, outPdf);
    if (result.ok) {
      console.log(`✓ wrote ${outPdf}`);
    } else {
      console.error(`✗ PDF render failed: ${result.err}`);
      process.exit(2);
    }
  }
}

main().catch((err) => {
  console.error("render-report failed:", err);
  process.exit(1);
});
