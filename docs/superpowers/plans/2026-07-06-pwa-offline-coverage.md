# PWA Offline Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-build e2e coverage proving warmed-cache offline Sudoku usage works after one online load.

**Architecture:** Keep the existing Workbox-generated service worker and bundled puzzle data. Add focused Playwright coverage that waits for service-worker control, verifies precache coverage, switches offline, and exercises the game and Select Game flows.

**Tech Stack:** React 18, Vite 7, vite-plugin-pwa, Workbox, Playwright, pnpm.

## Global Constraints

- Use pnpm consistently for local development, CI, Docker, and Playwright web-server commands.
- Preserve the current `autoUpdate` service-worker behavior for this issue.
- First-ever cold offline load is unsupported and should be asserted as such.
- Run `pnpm run test:e2e` for user-visible app flow changes.

---

### Task 1: Add PWA Offline E2E Coverage

**Files:**
- Create: `e2e/pwa-offline.e2e.ts`

**Interfaces:**
- Consumes: Playwright `page`, `context`, `browser`, and `baseURL` fixtures.
- Produces: regression coverage for warmed-cache offline reload, offline Select Game navigation, offline built-in puzzle start, service-worker cache coverage, and cold offline failure.

- [ ] **Step 1: Add the test file**

Create `e2e/pwa-offline.e2e.ts` with helpers that wait for `navigator.serviceWorker.ready`, assert `navigator.serviceWorker.controller`, read `caches.keys()`, and exercise the offline flow.

- [ ] **Step 2: Run the focused test**

Run: `pnpm exec playwright test e2e/pwa-offline.e2e.ts --project=chromium-light`

Expected: PASS after the current production build is served through Playwright's web server.

### Task 2: Keep E2E Server Isolation

**Files:**
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: existing hashed Playwright port logic.
- Produces: `reuseExistingServer: false` for all e2e runs, matching project notes and keeping PWA tests away from unrelated local servers.

- [ ] **Step 1: Update web-server reuse setting**

Change `reuseExistingServer` from the environment-dependent value to `false`.

- [ ] **Step 2: Run full checks**

Run: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm build`, and `pnpm run test:e2e`.

Expected: all commands pass.
