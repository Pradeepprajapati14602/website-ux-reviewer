# Website UX Reviewer - Detailed Project Guide

Ye document project ke har major part ko detail me explain karta hai: frontend, backend APIs, AI pipeline, database flow, testing setup, deployment behavior, aur debugging points.

## 1) Project ka high-level purpose

App ka kaam:

1. Kisi website URL ka UX audit karna
2. Score (0-100) dena
3. Issues + evidence + severity return karna
4. Top improvements suggest karna
5. Last 5 reviews store karna
6. Health status dikhana (backend, DB, LLM)

## 2) Request flow (end-to-end)

Single analyze flow:

1. User home page par URL deta hai
2. Frontend POST request bhejta hai /api/analyze par
3. API URL normalize karti hai
4. Review service extraction + LLM audit run karti hai
5. Result Prisma se DB me save hota hai
6. Response frontend ko milta hai aur UI cards render hote hain

Compare flow:

1. User 2 URLs deta hai
2. /api/compare endpoint dono URLs normalize karta hai
3. Dono URLs par parallel analyzeAndSave call hoti hai
4. Left/Right reviews + score difference return hota hai

Status flow:

1. /api/status DB ping karta hai
2. OpenAI health ping run hota hai
3. Backend/DB/LLM status JSON return hota hai

## 3) App routes and pages

### src/app/layout.tsx

- Global shell + header navigation.
- Links: Home, History, Status.

### src/app/page.tsx (Home)

- 2 modes support karta hai:
  - Single URL
  - Compare 2 URLs
- API responses ke basis par review cards render karta hai.
- Error handling UI me inline text se hoti hai.

### src/app/history/page.tsx

- Server component.
- Last 5 reviews DB se fetch karta hai.
- DB unavailable ho to fallback message show karta hai.

### src/app/status/page.tsx

- Client page jo /api/status call karti hai.
- Backend, Database, LLM states display karti hai.

## 4) API routes (backend)

### src/app/api/analyze/route.ts

- Input: { url }
- URL normalize karta hai.
- analyzeAndSave run karta hai.
- Success: { ok: true, url, review }
- Failure: { ok: false, error } status 400
- Observability: request, success, error logs with requestId + duration.

### src/app/api/compare/route.ts

- Input: { leftUrl, rightUrl }
- Dono URLs normalize karta hai.
- Dono analyses parallel run.
- Success me left/right review + scoreDifference return.
- Failure par status 400.
- Observability logs included.

### src/app/api/status/route.ts

- DB ping via Prisma raw query.
- LLM health check via runOpenAIHealthCheck.
- Always JSON status object return karta hai.

## 5) Core business logic

### src/lib/review-service.ts

- Main orchestrator function: analyzeAndSave(url, context)
- Steps:
  1. extractWebsiteContent
  2. runUxAudit
  3. prisma.review.create
  4. keepLastFiveReviews cleanup
- Logs:
  - review.analyze.start
  - review.analyze.success
  - review.analyze.error

### src/lib/extractor.ts

- Playwright se page scrape karta hai.
- Extracted fields:
  - title
  - headings
  - buttons
  - forms
  - mainText
- Main text truncate hota hai (4000 chars).
- Payload structured text format me AI ko diya jata hai.

Vercel behavior:

- Vercel par playwright-core + @sparticuz/chromium use hota hai.
- Local par normal playwright chromium launch hota hai.

### src/lib/analysis.ts

- OpenAI audit call yahan hoti hai.
- Prompt source: src/lib/prompt.ts
- Major safeguards:
  - input trim/budget
  - max completion tokens
  - JSON extraction/sanitization
  - retry with backoff for retryable errors
  - quota fallback mode
- Output sanitize karke strict UXReview format me convert hota hai.

### src/lib/url.ts

- URL validation + normalization helper.
- Missing, invalid, unsupported protocol ke liye clear errors throw karta hai.

### src/lib/prisma.ts

- PrismaPg adapter based Prisma client initialize karta hai.
- DATABASE_URL se connection use karta hai.
- Dev mode me singleton client reuse hota hai.

### src/lib/logger.ts

- Structured JSON logger utility.
- Levels: info, warn, error.
- Error object ko safe metadata format me normalize karta hai.

## 6) Database layer

### prisma/schema.prisma

Model Review fields:

- id (uuid)
- url (string)
- score (int)
- result (json)
- createdAt (datetime)

Migration pipeline:

- prisma generate
- prisma migrate dev
- prisma validate

Config note:

- prisma.config.ts CLI datasource ke liye DIRECT_URL prefer karta hai, fallback DATABASE_URL.

## 7) Environment variables

Required:

- DATABASE_URL
- OPENAI_API_KEY

Recommended:

- DIRECT_URL (migrations/direct use)
- ALLOW_LLM_FALLBACK (default true behavior)
- OPENAI_AUDIT_MODEL (optional override)
- OPENAI_HEALTH_MODEL (optional override)

Supabase SSL note:

- Connection string me sslmode aur compatibility params sahi hone chahiye.
- Password special characters URL encoded hone chahiye.

## 8) Build and deployment behavior

### package.json scripts

- dev: next dev
- build: prisma generate and next build
- test: vitest run
- test:smoke: playwright smoke suite
- postinstall: prisma generate

Why postinstall/build me prisma generate hai:

- CI/Vercel me Prisma client missing export errors avoid karne ke liye.

### next.config.ts

- outputFileTracingIncludes me @sparticuz/chromium include hai.
- Ye Vercel bundle me required chromium binaries lane ke liye important hai.

## 9) Test strategy (Phase 2 + Phase 4)

### Unit/route tests (Vitest)

Files:

- src/app/api/analyze/route.test.ts
- src/app/api/compare/route.test.ts
- src/app/api/status/route.test.ts

Coverage:

- Success and failure branches for analyze and compare.
- DB ok/fail behavior for status endpoint.

### Smoke e2e tests (Playwright)

Config:

- playwright.smoke.config.ts

Specs:

- tests/smoke/frontend-smoke.spec.ts

Coverage:

- Home single analyze render
- Compare render + score difference
- Status payload render

Smoke tests mocked API routes use karti hain for deterministic frontend checks.

## 10) Observability events reference

Common events:

- api.analyze.request/success/error
- api.compare.request/success/error
- api.status.request/response
- review.analyze.start/success/error
- llm.audit.success/retry/fallback_quota/error
- llm.health.success/error

Common fields:

- requestId
- path
- method
- durationMs
- model
- token usage

## 11) Known constraints

- Dynamic/login-protected sites ka extraction weak ho sakta hai.
- AI output variability natural hai.
- Quota/network condition me fallback behavior depend karta hai env flags par.
- History currently max 5 records maintain karti hai.

## 12) Daily dev checklist

1. npm install
2. npx prisma migrate dev --name some_change
3. npm test
4. npm run test:smoke
5. npm run build
6. Deploy

## 13) Quick troubleshooting map

Prisma auth fail:

- Check DB URL credentials + encoding.
- Check DIRECT_URL and DATABASE_URL mismatch.

PrismaClient export missing in CI:

- Ensure prisma generate runs in build/postinstall.

Playwright executable missing on Vercel:

- Ensure @sparticuz/chromium trace include active in next.config.ts.

TLS self-signed certificate chain:

- Verify SSL and compatibility params in DB URL.

Smoke test timeout/port issue:

- Ensure dedicated smoke port config (4100) is available.

---

Ye guide project onboarding, handoff, interview discussion, aur production hardening roadmap ke liye primary reference ke taur par use ki ja sakti hai.
