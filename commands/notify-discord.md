---
description: Post the latest /audit results to a Discord channel via webhook.
argument-hint: "[--webhook-url <url>] [--severity-filter critical|high|medium]"
allowed-tools: Read, Bash
---

# /notify-discord — push findings to Discord

Sends a compact summary of the most recent audit to a Discord channel.

## Setup

In Discord: Channel Settings → Integrations → Webhooks → New Webhook → copy URL.

Then:
- Pass `--webhook-url`, or
- Set `DISCORD_WEBHOOK_URL` env, or
- Add to `.auditsentry.yml`:
  ```yaml
  notifications:
    discord:
      webhook_url: "https://discord.com/api/webhooks/..."
      mention_role: "1234567890"   # optional — ping this role on Critical
  ```

## Procedure

1. Read latest findings JSON.
2. Filter by severity.
3. Build a Discord embed payload:
   ```json
   {
     "username": "AuditSentry",
     "avatar_url": "https://iktok90-design.github.io/AuditSentry/icon.png",
     "embeds": [{
       "title": "🛡 Audit: VulnerableVault.sol",
       "color": 16729927,
       "fields": [
         { "name": "Critical", "value": "2", "inline": true },
         { "name": "High",     "value": "4", "inline": true },
         { "name": "Grade",    "value": "F", "inline": true },
         { "name": "Top",      "value": "Reentrancy in withdraw()", "inline": false }
       ],
       "footer": { "text": "iktok90-design.github.io/AuditSentry" }
     }]
   }
   ```
4. POST via `curl -X POST -H 'content-type: application/json' --data @payload.json "$DISCORD_WEBHOOK_URL"`.

## Output

```
✓ posted to Discord (200 OK)
  channel hint: #security-alerts
```

## Notes

- For Critical: prepend `<@&{role_id}>` to mention the security role.
- Embed color: red for Critical, orange for High, yellow for Medium.
- Discord allows up to 25 fields per embed; chunk multiple findings into multiple embeds (max 10 embeds per message).
