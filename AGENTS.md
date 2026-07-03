# Project Notes

This project is a React, TypeScript, Vite, and Tailwind Sudoku web app based on `TN1ck/super-sudoku`. It includes a Sudoku game UI, puzzle collections, solver/generator logic, local progress persistence, internationalization, PWA support, unit tests, and Playwright e2e coverage.

# Current Goals

- Refactor the codebase to make it easier to maintain and extend.
- Keep the app fast, lightweight, and optimized.
- Improve tablet support and make the UI feel polished on touch devices.
- Update the styling and interface to match the user's preferences.
- Use pnpm consistently for local development, CI, Docker, and Playwright web-server commands.

# Package Manager Notes

- pnpm is the active package manager, pinned as `pnpm@11.9.0` via `packageManager` in `package.json`.
- Use `pnpm install --frozen-lockfile` for verification/CI installs and keep `pnpm-lock.yaml` committed instead of `package-lock.json`.
- `pnpm-workspace.yaml` currently approves `esbuild` builds with `allowBuilds: esbuild: true`; keep it with the lockfile and Docker install layer.
- pnpm's strict dependency layout exposed previously hoisted imports. Prefer explicit direct dependencies and imports from declared packages, for example `lodash-es/*` instead of undeclared `lodash`.
- The current baseline checks after the pnpm migration are `pnpm run typecheck`, `pnpm test`, and `pnpm build`.
- Docker uses Node 24 and Corepack. If testing Docker locally, the container engine must be running; this workspace may report Docker through Podman.

# Testing Notes

- Playwright e2e is run with `pnpm run test:e2e` and starts the app through `pnpm exec vite preview` on isolated port `4179`.
- Keep Playwright `reuseExistingServer` disabled so tests do not accidentally run against another local app.
- Run `pnpm run test:e2e` after changes that affect routing, game interactions, persistence, puzzle selection, or sharing.

# Sudoku Data Notes

- Built-in puzzle collections are loaded from `sudokus/easy.txt`, `sudokus/medium.txt`, `sudokus/hard.txt`, `sudokus/expert.txt`, and `sudokus/evil.txt` using Vite raw imports.
- `scripts/generate_sudokus.ts` appends generated puzzles directly to `sudokus/<difficulty>.txt`; review generated data before committing it.
- `scripts/fetch_sudokus.ts` writes root-level `sudokus-*.json` files for fetched puzzle batches; those are local artifacts and should stay ignored.
- TS scripts run through `scripts/register_ts_node.mjs` because this ESM project uses extensionless TypeScript imports.

# Agent Instructions

- Keep this `AGENTS.md` file up to date as goals, objectives, and important project decisions change.
- Inspect the existing code before making assumptions or broad changes.
- Prefer small, safe refactors over large rewrites unless a larger change is explicitly needed.
- Preserve current behavior unless the task explicitly asks to change it.
- Run relevant checks after changes when practical, especially build, typecheck, tests, and UI smoke checks.
