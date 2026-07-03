---
description: Compose a tweet from the latest audit. Either auto-posts (if Twitter API creds set) or generates a one-click intent URL.
argument-hint: "[--auto] [--include-card] [--text \"custom prefix\"]"
allowed-tools: Read, Bash
---

# /tweet — share an audit

Compose a tweet from the latest `/audit` output. The audit-card PNG attaches automatically.

Two modes:
- **Manual (default)** — generates a tweet draft + opens a Twitter/X intent URL in the browser. No keys required.
- **Auto** (`--auto`) — uses `TWITTER_BEARER_TOKEN` + `TWITTER_API_KEY` to post directly via the X API v2.

## Procedure

1. Read latest audit findings + (if `--include-card`) latest PNG card.
2. Compose the text. Default template:
   ```
   🛡 AuditSentry audit:  {target}

   Grade: {grade}
   Critical: {critical}  High: {high}  Medium: {medium}

   Top: {top_finding}

   Audited with @auditsentry_dev
   ```
3. Truncate to 280 characters; preserve hashtag + handle.
4. **Manual mode:**
   ```bash
   open "https://x.com/intent/tweet?text=$(jq -r -n --arg t "$TEXT" '$t|@uri')"
   ```
   Tells the user to attach the PNG manually (X intent URL doesn't accept media).
5. **Auto mode:**
   - Upload media via `POST /media/upload` (Twitter v1.1 endpoint, still required).
   - Create tweet via `POST /2/tweets` with `media.media_ids`.

## Output

Manual:
```
✓ tweet draft prepared
  open the URL in your browser to post:
  https://x.com/intent/tweet?text=...
  attach: auditsentry-reports/audit-card-2026-05-13.png
```

Auto:
```
✓ posted: https://x.com/auditsentry_dev/status/1234567890
  characters used: 247 / 280
  media: auditsentry-reports/audit-card-2026-05-13.png
```

## Notes

- DO NOT auto-tweet findings on contracts the user doesn't own. Public exploit disclosure must be coordinated. The command refuses if the audit was via `/audit-live` and the contract isn't in the user's `.auditsentry.yml owned_contracts:` list.
- For private/in-progress audits, prefer `--draft-only` flag — generates the URL without opening it.
- The PNG card carries the visual hook. Always include it for engagement.
