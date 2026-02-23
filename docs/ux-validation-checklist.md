# Frontend UX Validation Checklist

Use this checklist before release to validate critical user experience quality for the UX Reviewer app.

## 1) Core Journey

- Home page loads without console errors.
- User can switch between Single URL and Compare 2 URLs modes.
- Single URL flow shows loading state and then review result.
- Compare flow shows both result cards and score difference.
- Error states are user-readable (not raw stack traces).

## 2) Feedback & States

- Buttons are disabled during request in both flows.
- Loading text is visible (`Analyzing...`, `Comparing...`, `Checking services...`).
- Empty states are meaningful (`No reviews yet...`).
- Status page shows Backend, Database, and LLM values.

## 3) Readability & Hierarchy

- Main page title and section labels are clear.
- Issue cards show title, why, evidence, and severity.
- Top improvements are visible and easy to scan.
- Text wrapping works for long URLs in results/history.

## 4) Reliability Checks

- `/api/status` failure shows error message on status page.
- Analyze/compare API failure shows inline error on home page.
- History page still renders when DB is unavailable.

## 5) Accessibility Basics

- Inputs have labels (`Website URL`, `Left URL`, `Right URL`).
- Action buttons are keyboard focusable and actionable via Enter/Space.
- Important status/error text is visible without hover/tooltips.

## 6) Smoke Test Gate

- Run automated smoke tests before deploy:

```bash
npm run test:smoke
```

- Smoke suite should cover:
  - Home render + single analyze mocked success
  - Compare flow mocked success
  - Status page health payload rendering
