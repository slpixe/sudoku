# Project Notes

This project is a React, TypeScript, Vite, and Tailwind Sudoku web app based on an upstream Sudoku app by TN1ck. It includes a Sudoku game UI, puzzle collections, solver/generator logic, local progress persistence, internationalization, PWA support, unit tests, and Playwright e2e coverage.

# Current Goals

- Refactor the codebase to make it easier to maintain and extend.
- Keep the app fast, lightweight, and optimized.
- Improve tablet support and make the UI feel polished on touch devices.
- Update the styling and interface to match the user's preferences.
- Use pnpm consistently for local development, CI, Docker, and Playwright web-server commands.

# GitHub Issue Workflow

- GitHub Issues are the source of truth for the current improvement backlog; Beads is not used for this project right now.
- At the start of a new OpenCode session focused on backlog work, run `gh issue list --state open --limit 30` and inspect any relevant issue details with `gh issue view <number> --comments`.
- Ask the user which issue to work on before making changes. Do not silently choose an issue unless the user explicitly asks you to pick.
- Once the user chooses an issue, comment on that issue with `Claiming this for the current OpenCode session.` and focus only on that issue unless the user expands scope.
- If a selected issue is broad, ambiguous, or likely to collide with active work, clarify scope and coordination with the user before editing.
- When follow-up work is discovered, create or suggest a new GitHub issue linked to the selected issue instead of expanding scope unexpectedly.
- When issue work is complete, comment with the implementation summary, commit reference if available, and checks run; close the issue when the acceptance criteria are satisfied.

# Package Manager Notes

- pnpm is the active package manager, pinned as `pnpm@11.9.0` via `packageManager` in `package.json`.
- Use `pnpm install --frozen-lockfile` for verification/CI installs and keep `pnpm-lock.yaml` committed instead of `package-lock.json`.
- `pnpm-workspace.yaml` currently approves `esbuild` builds with `allowBuilds: esbuild: true`; keep it with the lockfile and Docker install layer.
- pnpm's strict dependency layout exposed previously hoisted imports. Prefer explicit direct dependencies and imports from declared packages, for example `lodash-es/*` instead of undeclared `lodash`.
- The current baseline checks after the pnpm migration are `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, and `pnpm build`; include `pnpm run test:e2e` before reporting full checks passed for app behavior changes.
- Docker uses Node 24 and Corepack. If testing Docker locally, the container engine must be running; this workspace may report Docker through Podman.
- `pnpm-workspace.yaml` includes targeted security `overrides` for vulnerable transitive dependency ranges; review them during dependency upgrades and remove any that upstream packages no longer need.

# Testing Notes

- Playwright e2e is run with `pnpm run test:e2e` and starts the app through `pnpm exec vite preview` on isolated port `4179`.
- Keep Playwright `reuseExistingServer` disabled so tests do not accidentally run against another local app.
- Run `pnpm run test:e2e` after changes that affect routing, game interactions, persistence, puzzle selection, sharing, or other user-visible app flows.

# Sudoku Data Notes

- Runtime puzzle collections are loaded from `sudokus/easy.txt`, `medium.txt`, `hard.txt`, `expert.txt`, and `evil.txt` using Vite raw imports.
- `scripts/generate_sudokus.ts` uses the local generator and appends directly usable puzzles to `sudokus/<difficulty>.txt`; review generated data before committing it.
- `scripts/fetch_sudokus.ts` can fetch from WebSudoku or Sudoku.com, but writes intermediate root-level `sudokus-*.json` artifacts that are not loaded by the app.
- TS scripts run through `scripts/register_ts_node.mjs` because this ESM project uses extensionless TypeScript imports.

# Agent Instructions

- Keep this `AGENTS.md` file up to date as goals, objectives, and important project decisions change.
- Inspect the existing code before making assumptions or broad changes.
- Prefer small, safe refactors over large rewrites unless a larger change is explicitly needed.
- Preserve current behavior unless the task explicitly asks to change it.
- Run relevant checks after changes when practical, especially typecheck, lint, unit tests, build, and Playwright e2e for user-visible app flows.
