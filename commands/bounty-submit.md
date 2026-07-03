---
description: Submit a finding to a bug-bounty platform (Immunefi, Cantina) automatically.
argument-hint: "<finding-id> [--platform immunefi|cantina|protocol]"
allowed-tools: Read, Bash
---

# /bounty-submit — submit to a bug bounty

Automates the submission of a confirmed finding to Immunefi (or another bounty platform). Strict prerequisites:

- Finding must have a passing `/exploit-live` PoC against a deployed contract.
- The contract must NOT be one you own (otherwise: just patch).
- A `bounty.yml` config maps protocol-name → platform → program slug.

## Procedure

### 1. Verify exploit reality

If the finding lacks a passing live PoC, refuse and tell the user to run `/exploit-live` first.

### 2. Resolve target program

```yaml
# .auditsentry.yml
bounty:
  immunefi:
    api_key: ${IMMUNEFI_API_KEY}
  cantina:
    api_key: ${CANTINA_API_KEY}
  default_platform: immunefi
  programs:
    - protocol: AcmeFi
      address: "0xabc..."
      platform: immunefi
      program_slug: acme-fi
      severity_map:
        Critical: critical
        High: high
        Medium: medium
```

If the chain+address has no entry, look up via the bounty platform's public directory.

### 3. Build the submission

Format it deterministically with the helper (maps severity to the program's
scale, embeds the PoC, derives the program slug):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/dist/format-bounty.js" \
  --finding finding.json --program program.json \
  --poc test/live-exploits/Exploit.t.sol --out submission.json
```

It emits the Immunefi-style payload (`submission.json`) and, with no `--out`, the
Markdown report on stdout. Sections it produces:
1. **Title** — `[Critical] Reentrancy in Vault.withdraw drains funds`
2. **Severity** — translated per program's scale
3. **Affected asset** — chain + address (proxy + impl if applicable)
4. **Bug description** — clear, technical, no marketing
5. **Proof of concept** — embed the passing Foundry test
6. **Reproduction steps** — numbered
7. **Recommended mitigation** — diff from `/remediate`
8. **Disclosure timeline** — today as initial disclosure

### 4. POST to the platform

**Immunefi:**
```bash
curl -X POST https://api.immunefi.com/v1/bug-reports \
  -H "Authorization: Bearer $IMMUNEFI_API_KEY" \
  -H "content-type: application/json" \
  -d @submission.json
```

(Note: Immunefi's public API may not support automated submission for all programs. In that case, the command writes the submission Markdown to a file and tells the user to paste it into the web form.)

**Cantina:** similar with `https://api.cantina.xyz/v1/...`.

**Protocol-direct:** for protocols with a `security@` email, drafts an email and offers to open a `mailto:` link.

### 5. Output

```
✓ Bug report submitted
  platform:   Immunefi
  program:    Acme Finance
  report id:  IMMU-2026-05-13-abc123
  severity:   Critical
  estimated payout (per program): $50K – $250K
  status URL: https://immunefi.com/dashboard/...

⚠ Do NOT share the PoC publicly until Acme Finance acknowledges.
```

## Safety

- For actively-exploitable Critical: command auto-suggests SEAL 911 (https://seal-911.com) for emergency coordination *in addition* to platform submission.
- All submissions logged to `~/.auditsentry/disclosures/` for audit trail.
- Refuses to submit if `RUGPROOF_OFFLINE=1` or `RUGPROOF_PRIVACY=1`.

## Notes

- Don't double-submit (track submission IDs, refuse on retry).
- Honor responsible disclosure: 90-day standard window unless platform requires different.
- Bounty platforms often have their own submission validators — your draft may be rejected for formatting; the command output includes a copy of what was sent.
