import {defineConfig, devices} from "@playwright/test";

const portRangeSize = 200;
const pathHash = [...process.cwd()].reduce((hash, character) => {
  return (hash * 31 + character.charCodeAt(0)) >>> 0;
}, 0);
const portOffset = pathHash % portRangeSize;
const appPort = 4_600 + portOffset;
const multiplayerPort = 4_900 + portOffset;
const appBaseURL = `http://127.0.0.1:${appPort}`;
const multiplayerBaseURL = `http://127.0.0.1:${multiplayerPort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/multiplayer.e2e.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", {open: "never", outputFolder: "playwright-report"}],
        ["json", {outputFile: "test-results/playwright-results.json"}],
      ]
    : "list",
  use: {
    baseURL: appBaseURL,
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: process.env.CI ? "on" : "retain-on-failure",
    video: process.env.CI ? "on" : "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-multiplayer",
      use: {...devices["Desktop Chrome"], colorScheme: "light"},
    },
  ],
  webServer: [
    {
      command: `NODE_ENV=test PORT=${multiplayerPort} RECONNECT_GRACE_SECONDS=1 pnpm --filter @sudoku/multiplayer-server start:test`,
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${multiplayerBaseURL}/ready`,
    },
    {
      command: `VITE_MULTIPLAYER_URL=${multiplayerBaseURL} pnpm run build && pnpm exec vite preview --host 127.0.0.1 --port ${appPort} --strictPort`,
      reuseExistingServer: false,
      timeout: 120_000,
      url: appBaseURL,
    },
  ],
});
