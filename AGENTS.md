# Project Notes

## Presentation and Provenance

- The canonical public application URL is `https://sudoku.slpixe.com`.
- The application was originally created by Tom Nick and is substantially modernized and maintained by Dean Quinney; preserve that attribution in public documentation and the MIT license.
- The imported upstream history through `165dcdb` is represented by a single attributed `init` baseline; Dean's work begins at the original commit `ace4f79`.
- Automatic container-image publishing is retired. Keep the Dockerfile for local or self-hosted builds, but do not restore registry publishing unless explicitly requested.

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

# Development Server Notes

- `pnpm start` runs Vite on port `3000` in host mode so devices on the local network can connect.
- Before starting a dev or preview server for browser/manual checks, check whether the user already has one running, commonly at `http://localhost:3000`, and reuse it when possible.
- Do not start a second Vite server on `5173` or another fallback port unless the user asks for it or the existing server is unavailable for the task; if a temporary server is necessary, stop it when finished.
- The exception is `pnpm run test:e2e`, which intentionally starts an isolated preview server on port `4179` through Playwright.
- After implementing a user-visible feature in a worktree, ask whether the user wants that worktree started on a host-mode web server for manual review before merge/push/cleanup.
- For a non-default manual-review port, prefer `pnpm exec vite --host 0.0.0.0 --port <port> --strictPort` from the target worktree. Do not rely on extra args passing through `pnpm start`.
- Verify manual-review servers with both `lsof -nP -iTCP:<port> -sTCP:LISTEN` and `curl -I --max-time 5 http://127.0.0.1:<port>/`; report the Vite network URL for phone/tablet testing.
- Stop any temporary manual-review server before removing its worktree.

# Testing Notes

- Playwright e2e is run with `pnpm run test:e2e` and starts the app through `pnpm exec vite preview` on isolated port `4179`.
- Keep Playwright `reuseExistingServer` disabled so tests do not accidentally run against another local app.
- For Playwright UI visual review, report the Playwright UI URL and app server URL, then let the user decide whether to open the UI. Do not repeatedly open or restart Playwright UI when one may already be open unless the user asks.
- When running Playwright UI for workspace-specific visual review, use distinct Playwright UI and app ports so multiple workspaces can run side by side.
- Run `pnpm run test:e2e` after changes that affect routing, game interactions, persistence, puzzle selection, sharing, or other user-visible app flows.
- Local artifact directories such as `.worktrees/` and `.pnpm-store/` can affect repo-wide commands. If `pnpm run lint` or `pnpm test` reports failures from those paths, first check tool ignore/discovery config before treating the output as a feature regression.
- `eslint.config.js` ignores `.worktrees/**` and `.pnpm-store/**`; keep that coverage if lint config is refactored. Vitest may still discover tests in those local artifact paths, so use or add explicit test exclude config if duplicate local test execution becomes noisy or slow.
- For touch or multi-finger behavior, do not rely only on Playwright `click()`. Add pointer-event coverage for the relevant touch path, including secondary touches when the feature depends on more than one finger.
- When touch hold state drops unexpectedly, investigate `pointercancel`, `pointerleave`, viewport scaling, and CSS `touch-action` before changing app state logic.
- For touch interactions that should not trigger browser gestures, assert the relevant `touch-action` behavior in e2e coverage.

# Git and Worktree Notes

- Git metadata writes may require sandbox escalation, including `git add`, `git commit`, `git merge`, `git push`, `git worktree remove`, `git branch -d`, and `git worktree prune`.
- When cleaning up a merged worktree, stop any dev server running from that worktree, remove the worktree, delete the merged local branch, prune worktree metadata, and verify `git worktree list` and `git status --short --branch`.

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
