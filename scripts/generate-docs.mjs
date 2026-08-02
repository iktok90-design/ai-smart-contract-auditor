#!/usr/bin/env node
// Generate browsable reference pages for the docs site directly from source, so
// they can't drift from the actual commands/agents/skills/MCP servers.
// Outputs HTML into docs/docs/. Run from repo root: node scripts/generate-docs.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "docs");

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// --- frontmatter parsing -------------------------------------------------
function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function readDir(rel) {
  const dir = join(ROOT, rel);
  return existsSync(dir) ? readdirSync(dir) : [];
}

// --- collectors ----------------------------------------------------------
const commands = readDir("commands")
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const fm = frontmatter(readFileSync(join(ROOT, "commands", f), "utf-8"));
    return { name: "/" + f.replace(/\.md$/, ""), file: f, ...fm };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const agents = readDir("agents")
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const fm = frontmatter(readFileSync(join(ROOT, "agents", f), "utf-8"));
    return { name: fm.name || f.replace(/\.md$/, ""), model: fm.model || "", description: fm.description || "" };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const skills = readDir("skills")
  .filter((d) => existsSync(join(ROOT, "skills", d, "SKILL.md")))
  .map((d) => {
    const fm = frontmatter(readFileSync(join(ROOT, "skills", d, "SKILL.md"), "utf-8"));
    return { name: fm.name || d, description: fm.description || "" };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// MCP servers + their tools (curated from plugin.json + server sources).
const mcp = [
  { name: "block-explorer", tools: ["get_source_code", "get_abi", "get_runtime_code", "get_constructor_args", "get_storage_at", "get_tx", "get_trace", "resolve_proxy"], note: "Etherscan v2 multichain (single ETHERSCAN_API_KEY) + Beratrail; EIP-1967/1822 proxy resolution; offline → labeled mock." },
  { name: "forge-runner", tools: ["build", "test", "gas_report", "coverage", "inspect_storage", "exec"], note: "Wraps Foundry; mock fallback when forge absent (labeled with __reason)." },
  { name: "hardhat-runner", tools: ["compile", "test", "run"], note: "Wraps Hardhat via npx --no-install; fails fast outside HH projects." },
  { name: "anvil", tools: ["fork", "kill_fork", "send_raw_tx", "snapshot", "revert", "list_forks"], note: "Local forks; polls RPC readiness before returning." },
  { name: "tenderly", tools: ["simulate", "create_fork", "delete_fork"], note: "Hosted simulation; needs TENDERLY_* creds, else labeled stub." },
  { name: "c4-history", tools: ["search", "get_finding", "refresh_cache"], note: "Code4rena findings via GitHub, 24h cache, curated offline stub." },
  { name: "sherlock-history", tools: ["search", "get_finding", "refresh_cache"], note: "Sherlock findings via GitHub, 24h cache, offline stub." },
  { name: "gas-tracker", tools: ["get_gas_price"], note: "Live gas via eth_gasPrice." },
  { name: "token-metadata", tools: ["get_token_metadata", "detect_quirks", "check_safety"], note: "ERC-20 metadata + quirks DB; check_safety via GoPlus with offline fallback." },
  { name: "slither-runner", tools: ["analyze", "is_available"], note: "Runs Slither if installed, else labeled sample for parse-slither." },
  { name: "mythril-runner", tools: ["analyze", "is_available"], note: "Runs Mythril if installed, else labeled sample for parse-mythril." },
  { name: "fuzz-runner", tools: ["echidna", "medusa", "halmos", "is_available"], note: "Property-fuzz / symbolic runners; real binary if installed, else labeled sample." },
  { name: "monitoring", tools: ["suggest_monitors", "scan_recent"], note: "Post-deploy watch: recommend alert events for a contract; scan recent logs for upgrade/ownership/pause; offline sample." },
];

// --- page shell ----------------------------------------------------------
function page(title, eyebrow, h1, lead, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<base href="/AuditSentry/">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — AuditSentry</title>
<meta name="theme-color" content="#0a0904">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/docs.css">
<!-- generated by scripts/generate-docs.mjs — do not edit by hand -->
</head>
<body>
<div class="bg-honeycomb"></div>
<div class="bg-grain"></div>

<nav class="nav">
  <div class="nav-inner">
    <a class="logo" href="index.html"><span class="logo-mark"></span>RUGPROOF</a>
    <div class="nav-links">
      <a href="index.html#features">features</a>
      <a href="docs/">docs</a>
      <a href="docs/commands.html">commands</a>
      <a href="docs/skills.html">skills</a>
      <a href="docs/agents.html">agents</a>
      <a class="cta" href="https://github.com/iktok90-design/AuditSentry">github →</a>
    </div>
  </div>
</nav>

<main class="doc">
  <div class="eyebrow" style="margin-bottom: 16px;">${esc(eyebrow)}</div>
  <h1>${h1}</h1>
  <p>${lead}</p>
${bodyHtml}
</main>

<footer>
  <div class="container">
    <div class="footer-bottom">
      <a href="docs/" style="color: var(--text-mid); text-decoration: none;">← docs index</a>
      <span>v0.2.0</span>
    </div>
  </div>
</footer>

<script src="assets/animations.js"></script>
</body>
</html>
`;
}

function table(headers, rows) {
  return `  <table>
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>
${rows.map((r) => `      <tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n")}
    </tbody>
  </table>`;
}

const ghCmd = (f) => `https://github.com/iktok90-design/AuditSentry/blob/main/commands/${f}`;
const ghAgent = (n) => `https://github.com/iktok90-design/AuditSentry/blob/main/agents/${n}.md`;
const ghSkill = (n) => `https://github.com/iktok90-design/AuditSentry/blob/main/skills/${n}/SKILL.md`;

// --- commands page (cheatsheet + decision tree) --------------------------
const decisionTree = `  <h2>Which command?</h2>
  <pre class="tree">I want to…
├─ audit my whole repo ............... /audit            (deep: /audit-deep, paranoid: /audit-strict)
├─ quick pre-commit check ............ /quick-scan
├─ audit a deployed contract ......... /audit-live &lt;chain&gt; &lt;addr&gt;
├─ audit only my git changes ......... /audit-changes
├─ check dependency versions ......... /audit-deps
├─ compare a contract across chains .. /audit-multi-chain &lt;addr&gt; &lt;chains&gt;
├─ know if a token can rug me ........ /rug-check
├─ prove a property formally ......... /prover
├─ turn a finding into a PoC ......... /exploit &lt;id&gt;   (live: /exploit-live)
├─ generate a patch .................. /remediate &lt;id&gt;
├─ produce a shareable report ........ /report   (card only: /card)
└─ pre-launch go/no-go ............... /pre-deploy</pre>`;

writeFileSync(
  join(OUT, "commands.html"),
  page("Commands", "/docs/commands", `Slash <span style="font-style:italic;color:var(--honey)">commands.</span>`,
    `All ${commands.length} AuditSentry commands, generated from source.`,
    decisionTree + "\n  <h2>All commands</h2>\n" + table(
      ["Command", "Arguments", "What it does"],
      commands.map((c) => [
        `<a href="${ghCmd(c.file)}"><code>${esc(c.name)}</code></a>`,
        c["argument-hint"] ? `<code>${esc(c["argument-hint"])}</code>` : "—",
        esc(c.description || ""),
      ]),
    )),
);

// --- skills page ---------------------------------------------------------
writeFileSync(
  join(OUT, "skills.html"),
  page("Skills", "/docs/skills", `Vulnerability <span style="font-style:italic;color:var(--honey)">skills.</span>`,
    `${skills.length} auto-invoked detection skills. Each activates when Claude sees matching code patterns.`,
    table(["Skill", "What it detects"],
      skills.map((s) => [`<a href="${ghSkill(s.name)}"><code>${esc(s.name)}</code></a>`, esc(s.description)]))),
);

// --- agents page ---------------------------------------------------------
writeFileSync(
  join(OUT, "agents.html"),
  page("Agents", "/docs/agents", `Specialist <span style="font-style:italic;color:var(--honey)">subagents.</span>`,
    `${agents.length} specialist subagents. <code>/audit</code> dispatches them by detected protocol type; ` +
    `<code>attacker</code> and <code>defender</code> always run.`,
    table(["Agent", "Model", "Specialism"],
      agents.map((a) => [`<a href="${ghAgent(a.name)}"><code>${esc(a.name)}</code></a>`, esc(a.model || "—"), esc(a.description)]))),
);

// --- mcp reference -------------------------------------------------------
writeFileSync(
  join(OUT, "mcp-reference.html"),
  page("MCP reference", "/docs/mcp", `MCP <span style="font-style:italic;color:var(--honey)">servers.</span>`,
    `${mcp.length} MCP servers. Every server degrades gracefully offline (labeled stub data) so the plugin works with zero configuration.`,
    table(["Server", "Tools", "Behaviour"],
      mcp.map((m) => [`<code>${esc(m.name)}</code>`, m.tools.map((t) => `<code>${esc(t)}</code>`).join(" "), esc(m.note)]))),
);

console.log(`✓ generated docs: commands(${commands.length}) skills(${skills.length}) agents(${agents.length}) mcp(${mcp.length})`);
