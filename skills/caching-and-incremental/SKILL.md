---
name: caching-and-incremental
description: Always-on meta-skill — cache audit results per file by content hash so unchanged files aren't re-analyzed on subsequent runs. Activate on every /audit, /quick-scan, /audit-changes invocation.
---

# Caching & incremental audit (meta-skill)

The first audit of a 50K-line codebase is slow. The second one shouldn't be. This skill governs cache reuse.

## Cache layout

`~/.cache/auditsentry/<repo-fingerprint>/`

```
findings/
  <sha256(file-content)>.json    # findings for that exact file content
  <sha256>.skill-versions        # skill names + versions used to produce findings
manifest.json                     # mapping file-path → current sha256
```

**Repo fingerprint** = sha256 of the absolute repo root path (so different checkouts don't collide).

## Procedure (per file F to audit)

### Step 1 — Compute current hash
`current_hash = sha256(read F)`

### Step 2 — Check manifest
- Look up `manifest[F]` → `cached_hash`.
- If `cached_hash == current_hash`:
  - Load `findings/<current_hash>.json`.
  - Verify `skill-versions` matches current skill set.
  - If both match: **return cached findings**, mark file as cached in output.
- Otherwise → audit fresh and write to cache.

### Step 3 — Write fresh result
After audit completes:
- `write findings/<current_hash>.json`
- Update `manifest[F] = current_hash`

### Step 4 — Garbage collect
Periodically (e.g. weekly): drop `findings/*.json` not referenced from any current manifest.

## Invalidation triggers

Re-audit even if hash matches when:
- The list of active skills has changed since the cached result
- A new vulnerability skill was added that may apply
- User passes `--no-cache` or `--rerun`
- `.auditsentry.yml` config has changed (different severity threshold, profile, etc.)

## Cache disable

- `RUGPROOF_NO_CACHE=1` env var
- `cache: false` in `.auditsentry.yml`
- `--no-cache` flag on any audit command
- `RUGPROOF_OFFLINE=1` does NOT disable the local cache (it's still local I/O)
- `RUGPROOF_PRIVACY=1` writes cache only to a temp dir that's wiped on exit

## Output

In the audit summary, show:
```
Cache:    27 files cached (78%) · 8 files re-analyzed
Speedup:  ~6.4× vs cold run
```

This builds trust that the cache is doing real work.

## When NOT to cache

- `/audit-deep` — too thorough; user wants fresh
- `/audit-strict` — same reason
- `/audit-live` — fork state changes; never cache
- `/exploit*` — exploit attempts must run fresh

## Related

- [[false-positive-feedback-loop]] — dismissals are a separate cache
- [[multi-pass-self-critique]] — strict mode bypasses cache
- /audit, /quick-scan, /audit-changes — main consumers
