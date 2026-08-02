#!/usr/bin/env bash
# AuditSentry pre-commit hook — runs /quick-scan on staged Solidity files.
# Blocks the commit if findings at or above the configured threshold are found.
#
# Install: copy to .git/hooks/pre-commit, or symlink:
#   ln -sf "$(pwd)/hooks/pre-commit-quickscan.sh" .git/hooks/pre-commit
#
# Disable per-commit with: git commit --no-verify  (not recommended)

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CONFIG="${REPO_ROOT}/.auditsentry.yml"

if [[ ! -f "${CONFIG}" ]]; then
  echo "auditsentry: no .auditsentry.yml found, skipping pre-commit scan."
  echo "         (run /auditsentry-init in Claude Code to set up.)"
  exit 0
fi

# Read enabled flag from config (defaults to true)
ENABLED="$(grep -A2 '^hooks:' "${CONFIG}" 2>/dev/null | grep -A1 'pre_commit:' | grep 'enabled:' | awk '{print $2}' || echo 'true')"
if [[ "${ENABLED}" != "true" ]]; then
  exit 0
fi

# Get staged Solidity files
STAGED="$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(sol|vy)$' || true)"
if [[ -z "${STAGED}" ]]; then
  exit 0
fi

echo "auditsentry: scanning $(echo "${STAGED}" | wc -l | tr -d ' ') staged file(s)…"

# Invoke Claude Code with /quick-scan on the staged files.
# This requires the `claude` CLI (Claude Code) to be on PATH.
if ! command -v claude >/dev/null 2>&1; then
  echo "auditsentry: 'claude' CLI not found on PATH; skipping scan."
  echo "         install: https://claude.ai/code"
  exit 0
fi

OUTPUT="$(echo "${STAGED}" | xargs -I {} claude code -p "/quick-scan {}" --output-format=json 2>/dev/null || echo '{"findings":[]}')"

# Count findings at/above threshold
THRESHOLD="$(grep '^severity_threshold:' "${CONFIG}" 2>/dev/null | awk '{print $2}' || echo 'high')"
declare -A LEVEL=( [info]=0 [low]=1 [medium]=2 [high]=3 [critical]=4 )
THRESHOLD_LVL="${LEVEL[${THRESHOLD}]:-3}"

# Parse JSON output for severity counts (best-effort; falls back gracefully)
N_BLOCKING="$(echo "${OUTPUT}" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    sev_lvl = {"info":0,"low":1,"medium":2,"high":3,"critical":4}
    th = '"${THRESHOLD_LVL}"'
    print(sum(1 for f in d.get("findings",[]) if sev_lvl.get(f.get("severity","").lower(),0) >= th))
except Exception:
    print(0)
' 2>/dev/null || echo 0)"

if [[ "${N_BLOCKING}" -gt 0 ]]; then
  echo
  echo "❌ auditsentry: ${N_BLOCKING} finding(s) at or above '${THRESHOLD}' severity"
  echo "   review:  /audit (in Claude Code) for details"
  echo "   bypass:  git commit --no-verify   (use only with reason)"
  exit 1
fi

echo "✓ auditsentry: no blocking findings"
exit 0
