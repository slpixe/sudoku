import {defineConfig, devices} from "@playwright/test";

const defaultPwaUpdatePort = 4390;
const pwaUpdatePortRangeSize = 100;
const pathHash = [...process.cwd()].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
const pwaUpdatePort = defaultPwaUpdatePort + (pathHash % pwaUpdatePortRangeSize);
const pwaUpdateBaseURL = `http://127.0.0.1:${pwaUpdatePort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/pwa-update.e2e.ts",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", {open: "never", outputFolder: "playwright-report-pwa-update"}],
        ["json", {outputFile: "test-results/pwa-update-results.json"}],
      ]
    : "list",
  use: {
    baseURL: pwaUpdateBaseURL,
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: process.env.CI ? "on" : "retain-on-failure",
    video: process.env.CI ? "on" : "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-pwa-update",
      use: {...devices["Desktop Chrome"], colorScheme: "light"},
    },
  ],
  webServer: {
    command: "node scripts/pwa_update_fixture_server.mjs",
    env: {PWA_UPDATE_PORT: String(pwaUpdatePort)},
    reuseExistingServer: false,
    timeout: 180_000,
    url: pwaUpdateBaseURL,
  },
});
