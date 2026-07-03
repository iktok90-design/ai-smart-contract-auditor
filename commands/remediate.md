---
description: Generate code patches that fix one or more findings. Outputs as a unified diff and (optionally) applies it.
argument-hint: "<finding-id>...  [--apply]"
allowed-tools: Read, Edit, Write, Bash, Agent, Skill
---

# /remediate — write the fix

For each finding ID in `$ARGUMENTS`, produce a concrete code patch.

## Procedure

### Step 1 — Resolve finding(s)

Pull the finding(s) from the most recent audit. If not available, ask the user to re-run `/audit` or pipe in a findings.json.

### Step 2 — Dispatch `remediation-suggester` subagent

For each finding, the subagent:
- Reads the affected file and the relevant skill from `skills/`
- Generates the fix as a unified diff against the file
- Cross-references known-good implementations (OZ, Solady) for the canonical fix shape
- Adds a `// auditsentry: fixed REENT-001` comment? **No** — do not add comments about the fix. Just fix it. (CLAUDE.md rule: no "fixed X" comments.)

### Step 3 — Validate the patch

Before output:
- Check the patch compiles (run `forge build` if Foundry project).
- Run any existing tests (`forge test` or `npm test`) to make sure the fix doesn't break them.
- Re-run the relevant vuln skill against the patched file — confirm the finding is gone.

### Step 4 — Output

```
Remediation for REENT-001:

--- a/src/Vault.sol
+++ b/src/Vault.sol
@@ -140,10 +140,10 @@ function withdraw() external {
-    uint256 amt = balance[msg.sender];
-    (bool ok,) = msg.sender.call{value: amt}("");
-    require(ok);
-    balance[msg.sender] = 0;
+    uint256 amt = balance[msg.sender];
+    balance[msg.sender] = 0;
+    (bool ok,) = msg.sender.call{value: amt}("");
+    require(ok, "withdraw failed");
}

Verification:
  forge build:    ✓
  forge test:     12 passing, 0 failing
  re-audit:       REENT-001 no longer reported
```

If `--apply` flag passed, also apply the patch to the file in place. Otherwise just print it.

## Notes

- One patch per finding by default. If multiple findings are in the same function, you may combine them in one diff with a clear note.
- If the fix requires architectural change (e.g. "move from push to pull payments"), the patch may span multiple files. Tell the user.
- Never add comments to the patched code beyond what was there.
- If the fix isn't safely automatable (e.g. needs a multi-sig deployment), output advice instead of a diff.
