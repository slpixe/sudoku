import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import {VitePWA} from "vite-plugin-pwa";
import {configDefaults, defineConfig} from "vitest/config";

import {pwaManifest} from "./src/pwa/manifest";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [
    react(),
    tsconfigPaths(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
      },
      manifest: pwaManifest,
    }),
  ],
  // define:
  //   command === "build"
  //     ? {
  //         "global.": "({}).",
  //       }
  //     : {global: {}},
  server: {
    open: true,
    port: 3000,
  },
  preview: {
    port: 3000,
  },
  test: {
    exclude: [...configDefaults.exclude, ".pnpm-store/**", ".worktrees/**", "packages/**", "server/**"],
  },
}));
