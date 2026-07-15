import {defineConfig, devices} from "@playwright/test";

const defaultE2ePort = 4179;
const e2ePortRangeSize = 200;

function getE2ePort() {
  const overridePort =
    typeof process.env.PLAYWRIGHT_PORT === "string" && /^\d+$/.test(process.env.PLAYWRIGHT_PORT.trim())
      ? Number(process.env.PLAYWRIGHT_PORT.trim())
      : null;

  if (overridePort && overridePort > 1024 && overridePort < 65535) {
    return overridePort;
  }

  const pathHash = [...process.cwd()].reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) >>> 0;
  }, 0);

  return defaultE2ePort + (pathHash % e2ePortRangeSize);
}

const e2ePort = getE2ePort();
const e2eBaseURL = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  testIgnore: "**/multiplayer.e2e.ts",
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
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: process.env.CI ? "on" : "retain-on-failure",
    video: process.env.CI ? "on" : "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-light",
      use: {...devices["Desktop Chrome"], colorScheme: "light"},
    },
    {
      name: "chromium-dark",
      use: {...devices["Desktop Chrome"], colorScheme: "dark"},
    },
  ],
  webServer: {
    command: `pnpm run build && pnpm exec vite preview --host 127.0.0.1 --port ${e2ePort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: e2eBaseURL,
  },
});
