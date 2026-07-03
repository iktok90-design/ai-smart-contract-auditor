---
description: Post the latest /audit results to a Slack channel via incoming webhook.
argument-hint: "[--webhook-url <url>] [--severity-filter critical|high|medium]"
allowed-tools: Read, Bash
---

# /notify-slack — push findings to Slack

Sends a compact summary of the most recent audit to a Slack channel. Use after `/audit` when collaborating with a team.

## Setup

Create an incoming webhook in your Slack workspace: https://api.slack.com/messaging/webhooks

Then either:
- Pass `--webhook-url` to this command, or
- Set `SLACK_WEBHOOK_URL` in `.env`, or
- Add to `.auditsentry.yml`:
  ```yaml
  notifications:
    slack:
      webhook_url: "https://hooks.slack.com/services/T..../B..../...."
  ```

## Procedure

1. Locate the latest findings JSON (default `auditsentry-reports/findings.json`).
2. Filter by `--severity-filter` (default: critical + high).
3. Build a Slack Block Kit payload:
   ```json
   {
     "blocks": [
       { "type": "header", "text": { "type": "plain_text", "text": "🛡 AuditSentry — VulnerableVault.sol" } },
       { "type": "section", "fields": [
           { "type": "mrkdwn", "text": "*Critical:* 2" },
           { "type": "mrkdwn", "text": "*High:* 4" },
           { "type": "mrkdwn", "text": "*Grade:* F" },
           { "type": "mrkdwn", "text": "*Top:* Reentrancy in withdraw()" }
       ]}
     ]
   }
   ```
4. POST to webhook via `curl`. Bash command pattern:
   ```bash
   curl -X POST -H 'content-type: application/json' \
        --data @payload.json \
        "$SLACK_WEBHOOK_URL"
   ```
5. Confirm 200 response or report the failure.

## Output

```
✓ posted 6 findings to Slack
  channel: #security
  permalink: https://acme.slack.com/archives/...
```

## Notes

- Don't paste contract source into Slack. Findings + IDs only.
- For Critical findings, prefix the message with `<!channel>` to ping the security on-call (configurable).
- Webhook URLs are secrets — never commit to a repo. Use `.env` or `.auditsentry.local.yml`.
