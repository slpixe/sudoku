import {defineConfig} from "@playwright/test";

// Manual design previews use the already-running Vite server for live reload.
// Keep this separate from the isolated production-build e2e suites.
export default defineConfig({
  testDir: "./e2e/visual",
  testMatch: "**/*.preview.ts",
  outputDir: "./artifacts/visual",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  snapshotPathTemplate: "{testDir}/baselines/{projectName}/{testName}-{platform}{ext}",
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    locale: "en-US",
  },
  projects: ["desktop", "tablet", "phone"].flatMap((size) =>
    (["light", "dark"] as const).map((colorScheme) => ({
      name: `${size}-${colorScheme}`,
      use: {
        browserName: "chromium" as const,
        colorScheme,
        viewport:
          size === "desktop"
            ? {width: 1440, height: 1000}
            : size === "tablet"
              ? {width: 820, height: 1180}
              : {width: 390, height: 844},
        hasTouch: size !== "desktop",
        isMobile: size !== "desktop",
      },
    })),
  ),
});
