# Website UX Reviewer

AI-powered UX review tool that analyzes website content, returns UX issues with evidence, gives a score out of 100, stores recent results, and supports side-by-side URL comparison.

## Stack

- Next.js (App Router, full-stack)
- Prisma + PostgreSQL
- Playwright (page content extraction)
- OpenAI `gpt-4o-mini`

## Features

- Analyze one URL and generate 8-12 UX issues with evidence
- Score the website out of 100
- Show top 3 UX improvements
- Compare two URLs side-by-side with score difference
- Persist and show last 5 reviews
- Status page for backend, database, and LLM checks

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment:

   ```bash
   cp .env.example .env
   ```

   Update `.env`:

   - `DATABASE_URL="postgresql://postgres:root@localhost:5432/postgres"`
   - `OPENAI_API_KEY="your_key_here"`
   - `ALLOW_LLM_FALLBACK="true"` (optional: returns heuristic UX output when OpenAI quota is exceeded)

3. Ensure PostgreSQL is running (local):

   ```sql
   -- optional if you want a separate DB
   CREATE DATABASE ux_reviewer;
   ```

4. Generate Prisma client and migrate:

   ```bash
   npx prisma generate
   npx prisma migrate dev --name init_review
   ```

5. Install Playwright browser binaries (first time only):

   ```bash
   npx playwright install chromium
   ```

6. Run app:

   ```bash
   npm run dev
   ```

## API Endpoints

- `POST /api/analyze` → analyze one URL
- `POST /api/compare` → analyze two URLs, return score difference
- `GET /api/status` → service health check

## Architecture

User → Frontend → API Route → Playwright Extraction → LLM Review → Prisma Save → JSON Response

## How LLM Works

1. Playwright extracts title, headings, buttons, forms, and main text (trimmed to 4000 chars).
2. Extracted content is sent to OpenAI using a fixed UX-auditor prompt.
3. Model returns strict JSON with score, issues, and improvements.
4. Response is parsed and sanitized before storage.

## Limitations

- Dynamic sites requiring login may not extract useful content.
- LLM outputs may vary between requests.
- Evidence quality depends on extracted text availability.
- Status LLM check requires valid `OPENAI_API_KEY`.
- If OpenAI returns `429 insufficient_quota`, analyze endpoint can return fallback output when `ALLOW_LLM_FALLBACK` is enabled.

## Deployment (Railway)

1. Push repository to GitHub.
2. Create Railway project and connect repo.
3. Set env vars in Railway:
   - `DATABASE_URL`
   - `OPENAI_API_KEY`
4. Deploy.
