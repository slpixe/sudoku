# Project Notes

## Presentation and Provenance

- The canonical public application URL is `https://sudoku.slpixe.com`.
- The application was originally created by Tom Nick and is substantially modernized and maintained by Dean Quinney; preserve that attribution in public documentation and the MIT license.
- The imported upstream history through `165dcdb` is represented by a single attributed `init` baseline; Dean's work begins at the original commit `ace4f79`.
- Automatic container-image publishing is retired. Keep the Dockerfile for local or self-hosted builds, but do not restore registry publishing unless explicitly requested.

This project is a React, TypeScript, Vite, and Tailwind Sudoku web app based on an upstream Sudoku app by TN1ck. It includes a Sudoku game UI, puzzle collections, solver/generator logic, local progress persistence, internationalization, PWA support, unit tests, and Playwright e2e coverage.

# Multiplayer Architecture and Operations

- Netlify continues to serve the static PWA at `https://sudoku.slpixe.com`; it connects directly to the Fly Socket.IO service at `https://multi.sudoku.slpixe.com`. Netlify does not proxy multiplayer traffic.
- Production uses exactly one 512 MB Fly Machine in `lhr` and a pooled Neon Postgres `DATABASE_URL` in AWS London (`eu-west-2`). Presence, reconnect reservations, and per-room queues are process-local, so do not scale past one Machine until cross-instance Socket.IO fan-out, distributed presence/reservations, command serialization, and multi-instance tests exist.
- `pnpm run deploy:multiplayer` is the required deployment entry point: it disables Fly HA creation and resets the app to one Machine. `server/fly.toml` uses the `immediate` strategy so process-local presence and room queues never overlap on two serving Machines. The release command runs `node server/dist/db/migrate.js` before the serving Machine is replaced. Do not add automated deployment or registry publishing to CI.
- Production allows only the exact browser origin `https://sudoku.slpixe.com`. Configure `VITE_MULTIPLAYER_URL=https://multi.sudoku.slpixe.com` in Netlify's Production build context. Never commit or log `DATABASE_URL`.
- Treat migrations as forward-only and use expand/contract changes. Take a Neon snapshot before schema releases; prefer a forward fix, and restore a database snapshot only as a last resort because it discards newer room activity.
- `/health` reports process liveness, `/ready` checks Postgres, and `/metrics` exposes process-local aggregate operational counts. Logs and metrics must not contain database URLs, secrets, room codes, guest/connection IDs, snapshots, or command payloads.
- The full production setup, DNS/certificate, monitoring, redaction, backup, rollback, and local runbook is in `docs/multiplayer-operations.md`.

# Multiplayer Product Contracts

- Multiplayer is guest-first: each browser profile keeps an opaque UUID in local storage under `sudoku-multiplayer-guest-id`; there are no accounts, names, or host privileges.
- A room has two seats for two distinct guest IDs. Extra tabs in the same browser profile reuse that guest's seat. The final disconnect reserves the guest's seat for 60 seconds before a different guest may take it.
- Values, notes, hint, room-wide undo, timer, pause/resume, completion, and confirmed Clear are authoritative shared state. Clear removes entered values and shared notes, resets timer/completion, resumes the room, and clears undo history; it is not undoable.
- Active connections protect rooms from cleanup. Creation, join, accepted commands, and final disconnect refresh the 24-hour inactive TTL. Cleanup runs at startup and every 15 minutes.
- Built-in puzzle files are the static multiplayer catalog. The collection, one-based line number, and 81-character givens line are the creation fingerprint. Never reorder, replace, or remove deployed lines; append only, and deploy frontend/backend with compatible catalogs.

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
- Multiplayer changes additionally require `pnpm run test:e2e:multiplayer`; the dedicated suite starts an isolated frontend and real Socket.IO backend using the in-memory room repository on worktree-derived ports.
- Verify the production backend image with `docker build -f server/Dockerfile -t sudoku-multiplayer:verify .` when a local container engine is running. If it is unavailable, record that limitation and rely on the non-publishing CI image-build job; never claim a local pass.
- Docker uses Node 24 and Corepack. If testing Docker locally, the container engine must be running; this workspace may report Docker through Podman.
- `pnpm-workspace.yaml` includes targeted security `overrides` for vulnerable transitive dependency ranges; review them during dependency upgrades and remove any that upstream packages no longer need.

# Development Server Notes

- `pnpm start` runs Vite on port `3000` in host mode so devices on the local network can connect.
- Before starting a dev or preview server for browser/manual checks, check whether the user already has one running, commonly at `http://localhost:3000`, and reuse it when possible.
- Do not start a second Vite server on `5173` or another fallback port unless the user asks for it or the existing server is unavailable for the task; if a temporary server is necessary, stop it when finished.
- The exception is `pnpm run test:e2e`, which intentionally starts an isolated preview server on port `4179` through Playwright.
- `pnpm run test:e2e:multiplayer` intentionally starts a disposable in-memory/Socket.IO backend with `RECONNECT_GRACE_SECONDS=1` and an isolated preview frontend on separate worktree-derived ports with `reuseExistingServer` disabled. The accelerated test harness accepts a reconnect grace no greater than 5 seconds; production remains 60 seconds.
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
- Run both `pnpm run test:e2e` and `pnpm run test:e2e:multiplayer` after changes to online selection, room routing, guest identity, shared gameplay, reconnect behavior, presence, server persistence, protocol, or multiplayer deployment configuration.
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
