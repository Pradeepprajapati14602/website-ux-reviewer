# AI Notes

## What AI Generated

- Initial project scaffolding strategy
- API route structure for analysis, comparison, and status
- Playwright extraction logic for UX-relevant content
- OpenAI integration and JSON output handling
- Base UI for Home, History, and Status pages
- Draft technical documentation

## What Was Reviewed Manually

- Prisma schema and PostgreSQL configuration
- API error handling paths
- Data retention logic (last 5 reviews)
- Prompt compliance with required JSON output
- Environment variable usage (no hard-coded secrets)

## Why `gpt-4o-mini`

- Strong structured JSON output capability
- Lower latency than larger models
- Lower cost for repeated analyses
- Good fit for MVP reviewer demo constraints

## What Was Validated

- Build and lint checks
- Route-level error handling behavior
- URL normalization and validation flow
- History limit pruning behavior

## Honesty Statement

AI assistance was used to accelerate implementation, but all generated code and docs were reviewed and adjusted to match required scope, stack, and output format.
