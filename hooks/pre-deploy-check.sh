#!/usr/bin/env bash
# AuditSentry pre-deploy hook — runs /audit on build artifacts before deployment.
# Blocks `forge create`, `hardhat run scripts/deploy.*`, etc. on Critical / High findings.
#
# Wired via plugin.json's PreToolUse hook on Bash. Receives JSON on stdin from Claude Code:
#   { "tool_name": "Bash", "tool_input": { "command": "..." } }
# Should exit 0 to allow, exit 2 with stderr message to deny (Claude Code convention).

set -euo pipefail

# Read the hook payload
PAYLOAD="$(cat)"
COMMAND="$(echo "${PAYLOAD}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || echo "")"

# Fast-path: only intercept commands that look like deploys
if ! echo "${COMMAND}" | grep -qE '(forge create|forge script.*--broadcast|hardhat .*deploy|hardhat run.*deploy)'; then
  exit 0
fi

REPO_ROOT="$(pwd)"
CONFIG="${REPO_ROOT}/.auditsentry.yml"

if [[ ! -f "${CONFIG}" ]]; then
  exit 0
fi

ENABLED="$(grep -A2 '^hooks:' "${CONFIG}" 2>/dev/null | grep -A1 'pre_deploy:' | grep 'enabled:' | awk '{print $2}' || echo 'true')"
if [[ "${ENABLED}" != "true" ]]; then
  exit 0
fi

echo "auditsentry: pre-deploy check — auditing build artifacts before broadcasting…" >&2

if ! command -v claude >/dev/null 2>&1; then
  echo "auditsentry: 'claude' CLI not found, skipping pre-deploy audit." >&2
  exit 0
fi

OUTPUT="$(claude code -p "/audit" --output-format=json 2>/dev/null || echo '{"findings":[]}')"

THRESHOLD="$(grep -A2 '^hooks:' "${CONFIG}" 2>/dev/null | grep -A1 'pre_deploy:' | grep 'fail_on:' | awk '{print $2}' || echo 'medium')"
declare -A LEVEL=( [info]=0 [low]=1 [medium]=2 [high]=3 [critical]=4 )
TH="${LEVEL[${THRESHOLD}]:-2}"

N="$(echo "${OUTPUT}" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    sev_lvl = {"info":0,"low":1,"medium":2,"high":3,"critical":4}
    th = '"${TH}"'
    print(sum(1 for f in d.get("findings",[]) if sev_lvl.get(f.get("severity","").lower(),0) >= th))
except Exception:
    print(0)
' 2>/dev/null || echo 0)"

if [[ "${N}" -gt 0 ]]; then
  cat >&2 <<EOF
❌ auditsentry: pre-deploy check failed — ${N} finding(s) at/above '${THRESHOLD}' severity
   review: /audit (full report)
   override: set RUGPROOF_BYPASS_DEPLOY=1 (logged to .auditsentry-bypass-log)
EOF
  if [[ "${RUGPROOF_BYPASS_DEPLOY:-0}" == "1" ]]; then
    echo "$(date -u +%FT%TZ) BYPASS user=$(whoami) cmd=${COMMAND}" >> "${REPO_ROOT}/.auditsentry-bypass-log"
    echo "auditsentry: BYPASS active — proceeding with deploy" >&2
    exit 0
  fi
  exit 2
fi

echo "✓ auditsentry: pre-deploy audit clean" >&2
exit 0
