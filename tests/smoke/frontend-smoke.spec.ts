import { expect, test } from "@playwright/test";

test("home single URL analyze flow renders result", async ({ page }) => {
  await page.route("**/api/analyze", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        url: "https://example.com",
        review: {
          score: 88,
          issues: [
            {
              category: "clarity",
              title: "Headline could be sharper",
              why: "Message is generic",
              evidence: "Welcome to our website",
              severity: "medium",
            },
          ],
          top_improvements: [
            {
              before: "Generic intro",
              after: "Clear value proposition",
            },
          ],
        },
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI UX Audit" })).toBeVisible();

  await page.getByLabel("Website URL").fill("example.com");
  await page.getByRole("button", { name: "Analyze" }).click();

  await expect(page.getByText("Review Result")).toBeVisible();
  await expect(page.getByText("Score: 88/100")).toBeVisible();
});

test("home compare flow renders score difference", async ({ page }) => {
  await page.route("**/api/compare", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        left: {
          url: "https://left.example.com",
          review: {
            score: 72,
            issues: [],
            top_improvements: [],
          },
        },
        right: {
          url: "https://right.example.com",
          review: {
            score: 81,
            issues: [],
            top_improvements: [],
          },
        },
        scoreDifference: 9,
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Compare 2 URLs" }).click();

  await page.getByLabel("Left URL").fill("left.example.com");
  await page.getByLabel("Right URL").fill("right.example.com");
  await page.getByRole("button", { name: /^Compare$/ }).click();

  await expect(page.getByText("Score difference (Right - Left):")).toBeVisible();
  await expect(page.getByText("Left Site")).toBeVisible();
  await expect(page.getByText("Right Site")).toBeVisible();
});

test("status page renders health payload", async ({ page }) => {
  await page.route("**/api/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        backend: "OK",
        database: "OK",
        llm: "OK",
      }),
    });
  });

  await page.goto("/status");

  await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
  await expect(page.getByText("Backend: OK")).toBeVisible();
  await expect(page.getByText("Database: OK")).toBeVisible();
  await expect(page.getByText("LLM: OK")).toBeVisible();
});
