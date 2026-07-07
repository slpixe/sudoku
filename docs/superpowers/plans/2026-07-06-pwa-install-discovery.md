# PWA Install Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact browser-native PWA install toast and richer install metadata for the Sudoku app.

**Architecture:** Keep `vite-plugin-pwa` as the single PWA manifest and service-worker source. Add a small React controller/component for a dismissible `beforeinstallprompt` toast, and enrich manifest metadata for install surfaces.

**Tech Stack:** React 18, TypeScript, Vite 7, vite-plugin-pwa, Workbox, Vitest, React Testing Library, Playwright, pnpm.

## Global Constraints

- Use pnpm consistently for local development, CI, Docker, and Playwright web-server commands.
- Preserve current behavior unless the task explicitly asks to change it.
- Keep the app fast, lightweight, and optimized.
- Run `pnpm run test:e2e` after user-visible app flow changes.
- Do not add browser-specific install instruction banners in this change.

---

### Task 1: Add Install Prompt UI Behavior

**Files:**
- Create: `src/components/pwa/InstallAppPrompt.tsx`
- Create: `src/components/pwa/InstallAppPrompt.test.tsx`
- Modify: `src/Root.tsx`

**Interfaces:**
- Produces: `InstallAppPrompt`, a compact React component that renders nothing until `beforeinstallprompt` is available.
- Consumes: browser `beforeinstallprompt` and `appinstalled` events.

- [ ] **Step 1: Write failing tests**

Add tests in `src/components/pwa/InstallAppPrompt.test.tsx` that dispatch a cancelable `beforeinstallprompt` event with a mock `prompt` method, assert the toast appears, invoke install, and assert `prompt` was called. Add separate assertions for the no-event state, persisted close dismissal, previously dismissed state, and `appinstalled` hidden state.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/pwa/InstallAppPrompt.test.tsx`

Expected: FAIL because `InstallAppPrompt` does not exist.

- [ ] **Step 3: Implement minimal component**

Create `InstallAppPrompt` with local state for the deferred event, `beforeinstallprompt` and `appinstalled` listeners, a branded prompt with the app icon, a green install action, a close button that persists dismissal, a 15 second auto-hide timeout, and an install action that calls `prompt()` from a user click. Use bottom-sheet placement on phones and floating placement above the input controls on larger viewports.

- [ ] **Step 4: Place component in the app root**

Render `InstallAppPrompt` in `src/Root.tsx` so it overlays routes without competing with header controls or changing game state.

- [ ] **Step 5: Run focused test**

Run: `pnpm exec vitest run src/components/pwa/InstallAppPrompt.test.tsx`

Expected: PASS.

### Task 2: Enrich and Deduplicate Manifest Metadata

**Files:**
- Modify: `vite.config.ts`
- Modify: `index.html`

**Interfaces:**
- Produces: one generated manifest link in production HTML from `vite-plugin-pwa`.
- Produces: manifest fields for install UI polish: `display_override`, `categories`, `screenshots`, and maskable icon purpose.

- [ ] **Step 1: Write failing metadata assertions**

Add assertions to `src/components/pwa/InstallAppPrompt.test.tsx` or a focused config test if the project has an established config-test pattern. The assertions should verify the PWA manifest config includes screenshots, categories, display overrides, and maskable icon purpose.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/pwa/InstallAppPrompt.test.tsx`

Expected: FAIL because the manifest metadata has not been enriched yet.

- [ ] **Step 3: Update manifest config and HTML**

Update `vite.config.ts` manifest options with richer metadata and remove the manual `/site.webmanifest` link from `index.html`.

- [ ] **Step 4: Run build check**

Run: `pnpm run build`

Expected: PASS and built `dist/index.html` contains one manifest link.

### Task 3: Full Verification

**Files:**
- No new files.

**Interfaces:**
- Consumes: all changes from Tasks 1 and 2.
- Produces: verified install behavior, type safety, lint compliance, production build, and e2e coverage.

- [ ] **Step 1: Run checks**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm run test:e2e
```

Expected: all commands pass.
