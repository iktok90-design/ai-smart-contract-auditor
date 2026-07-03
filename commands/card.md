---
description: Generate a shareable PNG audit card from the latest /audit. Optimized for social media.
argument-hint: "[--out <path>] [--style classic|bear|hacker|minimal]"
allowed-tools: Read, Write, Bash, Skill
---

# /card — shareable PNG audit card

Renders a 1200×1200 PNG (Twitter/X-card friendly) with the audit summary.

## What's on the card

- Contract name + (truncated) address
- Letter grade (A+ → F), prominently
- Severity counts: ⛔ Critical · ⚠ High · ⚡ Medium · ◌ Low
- Top finding title (one-liner)
- Date + chain (if from `/audit-live`)
- "Audited by AuditSentry" branding mark
- QR code linking to the full report URL (if public gallery enabled)

## Procedure

1. Pull the latest audit summary.
2. Pick the style from `$ARGUMENTS --style` or `.auditsentry.yml report.audit_card.style`. Default `classic`.
   - `classic` — clean, professional, dark gradient
   - `bear` — Berachain-themed, ursine mascot in corner (homage to the chain)
   - `hacker` — green-on-black terminal aesthetic
   - `minimal` — single grade letter on white, smallest text
3. Render the SVG template (`templates/audit-card.svg.hbs`) with the data.
4. Convert SVG → PNG using `resvg` (preferred, no headless browser) or `sharp` fallback.
5. Output to `--out` or `auditsentry-reports/audit-card-<date>.png`.

## Output

```
Audit card written: auditsentry-reports/audit-card-2026-05-12.png
  Dimensions: 1200×1200
  Style: bear
  Grade: B
  Findings: 0C / 2H / 4M / 7L

Share on Twitter? Run:
  /card --share twitter
```

## Public gallery

If `.auditsentry.yml report.audit_card.public_gallery_submit: true`, also POST the card + audit JSON to the gallery API. Returns a permalink URL the user can include in tweets.

## Notes

- The card is the viral output. Make it look great. Borrow visual language from CTF badges and game leaderboards.
- The grade letter is the largest element. Don't hide it.
- Don't include the user's private code in the card. Public-safe data only.
