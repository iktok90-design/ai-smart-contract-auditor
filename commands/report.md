---
description: Render the latest audit as a deliverable report in Markdown / HTML / PDF / JSON / PNG.
argument-hint: "[--format markdown|html|pdf|json|png|all]  [--out <dir>]"
allowed-tools: Read, Write, Bash, Agent, Skill
---

# /report — generate audit deliverable

Take the most recent `/audit` (or `/audit-deep`) result and render it as a deliverable. Default formats from `.auditsentry.yml report.formats`.

## Procedure

### Step 1 — Locate findings

If a recent audit isn't in conversation context, ask the user to run `/audit` first, or point them at `auditsentry-reports/findings.json` if it exists.

### Step 2 — Build the report sections

1. **Executive summary** — 4-6 sentences. Lead with the dollar value at risk, the number of Critical findings, and the trust level. Suitable for executives.
2. **Severity overview** — counts table, grade.
3. **Trust report** (centralization findings) — from [[centralization-risk]] format.
4. **Findings** — one section per finding, sorted by severity descending:
   - Title, ID, severity, confidence
   - File path:line + code block of the offending lines
   - Description (what / how / why)
   - Impact + likelihood
   - Remediation patch (diff)
   - Historical context if any
5. **Methodology** — which skills ran, which specialist subagents dispatched, scope (lines audited).
6. **Out of scope / known limitations** — be honest about what wasn't checked.
7. **Appendix** — tool versions, MCP server versions, git commit, contract addresses.

### Step 3 — Dispatch report-writer subagent

For long reports, dispatch the `report-writer` subagent with the raw findings — it will produce polished prose without consuming the main context.

### Step 4 — Render formats

For each requested format, use the corresponding template in `templates/`:

- **markdown** → `templates/report.md.hbs` → `auditsentry-reports/audit-YYYY-MM-DD.md`
- **html** → `templates/report.html.hbs` → styled, navigable, collapsible sections
- **pdf** → render HTML through headless Chrome / wkhtmltopdf
- **json** → structured findings + metadata for CI / dashboards
- **png** → `templates/audit-card.svg.hbs` → run through `resvg` or `sharp` (use `/card` internally)

### Step 5 — Output

Tell the user where the files are:

```
Report generated:
  auditsentry-reports/audit-2026-05-12.md
  auditsentry-reports/audit-2026-05-12.html
  auditsentry-reports/audit-2026-05-12.json
  auditsentry-reports/audit-card-2026-05-12.png
```

## Notes

- Findings appear in *severity-descending* order, not file order.
- Each finding gets a stable ID — re-running on the same code should produce the same IDs for the same findings (use a hash of file:line:vuln-class).
- The PNG card is always-on regardless of selected formats (it's the cheap viral hook).
- If the user has `report.audit_card.public_gallery_submit: true`, also push the PNG + JSON to the public gallery API.
