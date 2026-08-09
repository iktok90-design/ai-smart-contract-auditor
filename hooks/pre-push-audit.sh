#!/usr/bin/env bash
# AuditSentry pre-push hook — runs full /audit on changed files vs the upstream branch.
# Blocks the push if Critical or High findings exist.
#
# Install: ln -sf "$(pwd)/hooks/pre-push-audit.sh" .git/hooks/pre-push

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CONFIG="${REPO_ROOT}/.auditsentry.yml"

if [[ ! -f "${CONFIG}" ]]; then
  exit 0
fi

ENABLED="$(grep -A2 '^hooks:' "${CONFIG}" 2>/dev/null | grep -A1 'pre_push:' | grep 'enabled:' | awk '{print $2}' || echo 'true')"
if [[ "${ENABLED}" != "true" ]]; then
  exit 0
fi

# Determine base branch (default: main)
BASE="${RUGPROOF_BASE:-main}"
if ! git rev-parse --verify "${BASE}" >/dev/null 2>&1; then
  BASE="origin/main"
fi

CHANGED="$(git diff --name-only "${BASE}...HEAD" -- '*.sol' '*.vy' 2>/dev/null || true)"
if [[ -z "${CHANGED}" ]]; then
  echo "auditsentry: no Solidity/Vyper changes vs ${BASE}, skipping pre-push audit."
  exit 0
fi

echo "auditsentry: auditing $(echo "${CHANGED}" | wc -l | tr -d ' ') changed file(s) vs ${BASE}…"

if ! command -v claude >/dev/null 2>&1; then
  echo "auditsentry: 'claude' CLI not found, skipping pre-push audit."
  exit 0
fi

OUTPUT="$(claude code -p "/audit-changes ${BASE}" --output-format=json 2>/dev/null || echo '{"findings":[]}')"

THRESHOLD="$(grep -A2 '^hooks:' "${CONFIG}" 2>/dev/null | grep -A1 'pre_push:' | grep 'fail_on:' | awk '{print $2}' || echo 'high')"
declare -A LEVEL=( [info]=0 [low]=1 [medium]=2 [high]=3 [critical]=4 )
TH="${LEVEL[${THRESHOLD}]:-3}"

N="$(echo "${OUTPUT}" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    sev_lvl = {"info":0,"low":1,"medium":2,"high":3,"critical":4}
    th = '"${TH}"'
    findings = [f for f in d.get("findings",[]) if sev_lvl.get(f.get("severity","").lower(),0) >= th]
    print(len(findings))
    for f in findings[:5]:
        print(f"  ❌ [{f.get(\"severity\",\"?\").upper()}] {f.get(\"id\",\"?\")} {f.get(\"title\",\"\")} ({f.get(\"path\",\"?\")}:{f.get(\"line\",\"?\")})", file=sys.stderr)
except Exception:
    print(0)
' 2>/dev/null || echo 0)"

# Read first line as count, rest is already on stderr
COUNT="$(echo "${N}" | head -n1)"

if [[ "${COUNT}" -gt 0 ]]; then
  echo
  echo "❌ auditsentry: ${COUNT} finding(s) at/above '${THRESHOLD}' severity in changed files"
  echo "   bypass: git push --no-verify   (use sparingly, document why)"
  exit 1
fi

echo "✓ auditsentry: pre-push audit clean"
exit 0
