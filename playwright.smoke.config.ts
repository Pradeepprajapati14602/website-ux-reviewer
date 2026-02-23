import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: "http://127.0.0.1:4100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run start -- --port 4100",
    url: "http://127.0.0.1:4100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
