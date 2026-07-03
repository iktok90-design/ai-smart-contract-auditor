#!/usr/bin/env bash
# AuditSentry post-test hook — analyzes coverage after `forge test` and reports gaps.
# Hooks into Bash PostToolUse via plugin.json, fires when forge/hardhat test commands finish.

set -euo pipefail

PAYLOAD="$(cat)"
COMMAND="$(echo "${PAYLOAD}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || echo "")"

# Only act on test commands
if ! echo "${COMMAND}" | grep -qE '(forge test|hardhat test|npm test|yarn test)'; then
  exit 0
fi

REPO_ROOT="$(pwd)"
CONFIG="${REPO_ROOT}/.auditsentry.yml"

if [[ ! -f "${CONFIG}" ]]; then
  exit 0
fi

ENABLED="$(grep -A2 '^hooks:' "${CONFIG}" 2>/dev/null | grep -A1 'post_test:' | grep 'enabled:' | awk '{print $2}' || echo 'true')"
if [[ "${ENABLED}" != "true" ]]; then
  exit 0
fi

# Run coverage analysis (best-effort; non-blocking)
if command -v forge >/dev/null 2>&1; then
  COV_OUT="$(forge coverage --report summary 2>/dev/null | tail -n 30 || echo "")"
  if [[ -n "${COV_OUT}" ]]; then
    UNDER_80="$(echo "${COV_OUT}" | awk -F'|' '$3 ~ /[0-9]/ {gsub(/%/, "", $3); if ($3+0 < 80) print "  ⚠ " $2 " — " $3 "% line coverage"}' || true)"
    if [[ -n "${UNDER_80}" ]]; then
      cat >&2 <<EOF

auditsentry: coverage gaps detected (line < 80%):
${UNDER_80}

   tip: /coverage     (in Claude Code) auto-generates tests for the gaps
EOF
    fi
  fi
fi

exit 0
