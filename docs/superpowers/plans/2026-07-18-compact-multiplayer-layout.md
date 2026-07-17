# Compact Multiplayer Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce vertical space above and within the Sudoku game so multiplayer controls remain visible on shorter viewports.

**Architecture:** Keep the existing component structure and change only Tailwind utility classes. `MultiplayerStatus` owns the bar-specific compaction, while `GameView` owns the smaller shared spacing between the header, board, number pad, and control pad.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3, Vitest, Testing Library, Playwright, pnpm 11.9.0

## Global Constraints

- Apply the compact status-card styling only in `MultiplayerStatus`.
- Apply the game-grid spacing change to both single-player and multiplayer through `GameView`.
- Do not change `GameHeader` internals, multiplayer state, protocol behavior, puzzle sizing, translations, or control behavior.
- Preserve flex wrapping, connection recovery, retry behavior, accessible names, visible focus treatment, and live-region announcements.
- Use pnpm for all checks.

---

### Task 1: Lock in compact layout classes

**Files:**
- Modify: `src/pages/Game/MultiplayerStatus.test.tsx`
- Modify: `src/pages/Game/GameView.test.tsx`
- Modify: `src/pages/Game/MultiplayerStatus.tsx:63-97`
- Modify: `src/pages/Game/GameView.tsx:172-174`

**Interfaces:**
- Consumes: Existing `MultiplayerStatusProps` and `GameViewProps` without changes.
- Produces: The same rendered component interfaces with more compact CSS classes; no new exported types, props, or functions.

- [ ] **Step 1: Add failing assertions for the multiplayer card classes**

In the existing `renders the compact room status with in-button copy feedback` test, add these assertions after rendering and before the existing content assertions:

```tsx
const status = screen.getByTestId("multiplayer-status");
const copyButton = screen.getByTestId("multiplayer-copy-button");

expect(status.className).toContain("p-1");
expect(status.className).not.toContain("p-2");
expect(status.className).not.toContain("mt-3");
expect(copyButton.className).toContain("min-h-5");
expect(copyButton.className).not.toContain("min-h-9");
```

- [ ] **Step 2: Add a failing shared-grid spacing test**

Add this test near the start of the `GameView` describe block:

```tsx
it("uses compact shared spacing around the game grid", () => {
  const {container} = renderView();
  const layout = container.querySelector("main.sudoku-game-layout");

  expect(layout).not.toBeNull();
  expect(layout?.className).toContain("gap-1");
  expect(layout?.className).not.toContain("gap-3");
  expect(layout?.className).not.toContain("mt-3");
});
```

- [ ] **Step 3: Run the focused tests and verify the new assertions fail**

Run:

```bash
pnpm exec vitest run src/pages/Game/MultiplayerStatus.test.tsx src/pages/Game/GameView.test.tsx
```

Expected: FAIL because `MultiplayerStatus` still renders `mt-3 p-2`, its Copy button still renders `min-h-9`, and the shared game grid still renders `mt-3 gap-3`.

- [ ] **Step 4: Apply the compact component classes**

In `MultiplayerStatus.tsx`, replace the status section and Copy button class strings with:

```tsx
className="multiplayer-status mx-auto grid gap-2 rounded-sm bg-gray-700/70 p-1 text-sm text-white"
```

```tsx
className="ml-auto min-h-5 bg-teal-700 text-white dark:bg-teal-600"
```

In `GameView.tsx`, replace the shared game-grid class expression with:

```tsx
<main className={`sudoku-game-layout${won ? " sudoku-game-layout-complete" : ""} grid w-full gap-1`}>
```

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```bash
pnpm exec vitest run src/pages/Game/MultiplayerStatus.test.tsx src/pages/Game/GameView.test.tsx
```

Expected: both test files PASS, including the existing accessibility and command-delegation coverage.

- [ ] **Step 6: Commit the compact layout implementation**

```bash
git add src/pages/Game/MultiplayerStatus.test.tsx src/pages/Game/GameView.test.tsx src/pages/Game/MultiplayerStatus.tsx src/pages/Game/GameView.tsx
git commit -m "style: compact multiplayer game layout"
```

### Task 2: Verify the complete user-visible flow

**Files:**
- Verify only: no expected file changes.

**Interfaces:**
- Consumes: The compact styling produced by Task 1.
- Produces: Verification evidence for the shared single-player layout and multiplayer room layout.

- [ ] **Step 1: Run static and full unit checks**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
```

Expected: every command exits with status 0 and reports no TypeScript, ESLint, unit-test, or build failures.

- [ ] **Step 2: Run the single-player Playwright suite**

Run:

```bash
pnpm run test:e2e
```

Expected: PASS. The isolated preview starts on port 4179, game interactions remain usable, and the shared compact grid does not regress single-player flows.

- [ ] **Step 3: Run the multiplayer Playwright suite**

Run:

```bash
pnpm run test:e2e:multiplayer
```

Expected: PASS. Room creation, joining, presence, shared actions, reconnect behavior, and multiplayer layout remain functional.

- [ ] **Step 4: Record verification without changing behavior**

If all checks pass, report their exact commands in the implementation handoff. If a check fails, diagnose whether it is caused by these class changes before modifying any file; do not expand the implementation beyond this design without approval.

