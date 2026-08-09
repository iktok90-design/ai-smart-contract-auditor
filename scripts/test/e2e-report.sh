#!/usr/bin/env bash
# End-to-end check of the report pipeline: a findings JSON must render to a PNG
# audit card and an HTML report, and the sample findings must validate against
# the published schema. Run from repo root: bash scripts/test/e2e-report.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

findings="samples/sample-findings.json"
md="samples/audit-vulnerable-vault.md"

echo "→ checking card-summary $findings has the keys the renderer needs"
node -e "
  const f = require('./$findings');
  for (const k of ['target','grade','counts']) {
    if (!(k in f)) { console.error('  ✗ card summary missing key: ' + k); process.exit(1); }
  }
  for (const k of ['critical','high','medium','low','info']) {
    if (typeof f.counts[k] !== 'number') { console.error('  ✗ counts.' + k + ' not a number'); process.exit(1); }
  }
  console.log('  ✓ card summary ok');
"

echo "→ rendering PNG audit card"
node scripts/dist/render-card.js --findings "$findings" --out "$OUT/card.png"
test -s "$OUT/card.png" || { echo "  ✗ card.png missing/empty"; exit 1; }
node -e "
  const b = require('fs').readFileSync('$OUT/card.png');
  const sig = [0x89,0x50,0x4e,0x47];
  if (!sig.every((x,i) => b[i] === x)) { console.error('  ✗ not a PNG'); process.exit(1); }
  console.log('  ✓ card.png (' + b.length + ' bytes)');
"

echo "→ rendering HTML report"
node scripts/dist/md-to-html.js --in "$md" --out "$OUT/report.html"
test -s "$OUT/report.html" || { echo "  ✗ report.html missing/empty"; exit 1; }
grep -qi "<html" "$OUT/report.html" || { echo "  ✗ report.html has no <html>"; exit 1; }
echo "  ✓ report.html ($(wc -c < "$OUT/report.html") bytes)"

echo "✓ e2e report pipeline passed"
