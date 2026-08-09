# AuditSentry GitHub Action

Run AuditSentry security audit on every PR. Posts findings as a comment, fails CI on blocking severities.

## Usage

```yaml
# .github/workflows/audit.yml
name: Audit
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: iktok90-design/AuditSentry-action@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          threshold: high            # or critical / medium / low
          command: "/audit-changes main"
```

## Inputs

| Input | Required | Default | Notes |
|---|---|---|---|
| `anthropic-api-key` | yes | — | Get one at https://console.anthropic.com |
| `command` | no | `/audit-changes main` | Any AuditSentry slash command |
| `threshold` | no | `high` | Block PR on severity ≥ this |
| `comment` | no | `true` | Sticky PR comment |
| `upload-findings` | no | `true` | Upload `auditsentry-findings.json` artifact |

## Outputs

- `blocking` — number of findings at/above threshold
- `grade` — letter grade
- `findings-path` — path to findings JSON

## Cost

This Action calls the Anthropic API. Audit runs are typically $0.05–$0.50 per PR depending on diff size. You can scope down with `paths:` filters in your workflow.
