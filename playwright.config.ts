import {defineConfig, devices} from "@playwright/test";

const e2ePort = 4179;
const e2eBaseURL = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", {open: "never", outputFolder: "playwright-report"}],
        ["json", {outputFile: "test-results/playwright-results.json"}],
      ]
    : "list",
  use: {
    baseURL: e2eBaseURL,
    colorScheme: "light",
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: process.env.CI ? "on" : "retain-on-failure",
    video: process.env.CI ? "on" : "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {...devices["Desktop Chrome"]},
    },
  ],
  webServer: {
    command: `pnpm run build && pnpm exec vite preview --host 127.0.0.1 --port ${e2ePort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: e2eBaseURL,
  },
});
