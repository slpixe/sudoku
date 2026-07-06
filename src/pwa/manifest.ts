import type {ManifestOptions} from "vite-plugin-pwa";

export const pwaManifest = {
  name: "Sudoku",
  short_name: "Sudoku",
  description: "Play over 3,000 Sudoku puzzles from easy to evil. Open source and free with no tracking.",
  theme_color: "#1F2937",
  background_color: "#1F2937",
  display: "standalone",
  display_override: ["standalone", "minimal-ui", "browser"],
  start_url: "/",
  scope: "/",
  categories: ["games", "entertainment"],
  icons: [
    {
      src: "/android-chrome-192x192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any maskable",
    },
    {
      src: "/android-chrome-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable",
    },
  ],
  screenshots: [
    {
      src: "/screenshots/sudoku-desktop.png",
      sizes: "2360x1834",
      type: "image/png",
      form_factor: "wide",
      label: "Sudoku game board on desktop",
    },
    {
      src: "/screenshots/sudoku-mobile.png",
      sizes: "910x1540",
      type: "image/png",
      form_factor: "narrow",
      label: "Sudoku game board on mobile",
    },
  ],
} satisfies Partial<ManifestOptions>;
