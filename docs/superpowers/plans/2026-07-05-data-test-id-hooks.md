# Data Test ID Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable `data-testid` hooks for high-priority Sudoku UI flows and update Playwright tests to use those hooks where selectors are currently brittle.

**Architecture:** Keep selector hooks close to existing UI components and preserve current visible labels and accessibility semantics. Use stable kebab-case names with the existing `sudoku-*` prefix for game/select-game surfaces and `app-dialog-*` for shared dialog controls.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Cheerio, Playwright, pnpm.

## Global Constraints

- Use `pnpm` for all local verification commands.
- Preserve behavior and visible copy unless the ticket explicitly requires copy changes.
- Prefer accessible-role selectors when the test verifies accessibility; prefer `data-testid` for operational clicks, dynamic layout regions, dialogs, and localization-sensitive controls.
- Do not add dependencies.

---

### Task 1: Record Selector Hooks In Component Tests

**Files:**

- Modify: `src/components/sudoku/SudokuMenuControls.test.tsx`

**Interfaces:**

- Consumes: `SudokuMenuControls` rendered with Cheerio.
- Produces: coverage for `sudoku-control-undo`, `sudoku-control-erase`, `sudoku-control-notes`, and `sudoku-control-hint`.

- [ ] **Step 1: Write the failing test**

Add this assertion to the existing visible controls test:

```ts
expect(html).toContain('data-testid="sudoku-control-undo"');
expect(html).toContain('data-testid="sudoku-control-erase"');
expect(html).toContain('data-testid="sudoku-control-notes"');
expect(html).toContain('data-testid="sudoku-control-hint"');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/sudoku/SudokuMenuControls.test.tsx`
Expected: FAIL because the four control `data-testid` attributes do not exist yet.

- [ ] **Step 3: Add minimal hooks**

Add the matching `data-testid` attributes to `UndoButton`, `EraseButton`, `NotesButton`, and `HintButton` in `src/components/sudoku/SudokuMenuControls.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/sudoku/SudokuMenuControls.test.tsx`
Expected: PASS.

### Task 2: Stabilize App Chrome And Dialog Selectors

**Files:**

- Modify: `src/components/DarkModeButton.tsx`
- Modify: `src/pages/Game/GameHeader.tsx`
- Modify: `src/components/AppDialog.tsx`
- Modify: `src/pages/SelectGame.tsx`

**Interfaces:**

- Produces: `sudoku-action-theme`, `sudoku-action-undo`, `sudoku-action-clear`, `sudoku-action-pause`, `sudoku-action-new-game`, `select-game-back`, `app-dialog`, `app-dialog-message`, `app-dialog-cancel`, and `app-dialog-confirm`.

- [ ] **Step 1: Update Playwright selectors first**

In `e2e/sudoku.e2e.ts`, replace operational clicks and viewport checks for theme, clear, pause, and new game actions with `page.getByTestId(...)`. Replace dialog panel/action selectors with `app-dialog`, `app-dialog-cancel`, and `app-dialog-confirm`.

- [ ] **Step 2: Run e2e to verify it fails**

Run: `pnpm run test:e2e -- e2e/sudoku.e2e.ts`
Expected: FAIL because the new action/dialog hooks do not exist yet.

- [ ] **Step 3: Add minimal hooks**

Add the matching `data-testid` attributes to the relevant buttons and dialog elements without changing labels, focus order, or event handlers.

- [ ] **Step 4: Run e2e to verify it passes**

Run: `pnpm run test:e2e -- e2e/sudoku.e2e.ts`
Expected: PASS.

### Task 3: Stabilize Select-Game And Completion Layout Selectors

**Files:**

- Modify: `src/pages/Game/GameSelect.tsx`
- Modify: `src/pages/Game/GameCompletionPanel.tsx`
- Modify: `e2e/select-game.e2e.ts`
- Modify: `e2e/completion-screen.e2e.ts`

**Interfaces:**

- Produces: `select-game-collection-<id>`, `select-game-card-<id>`, `select-game-card-status-<id>`, `select-game-pagination-prev`, `select-game-pagination-next`, `select-game-pagination-page-<n>`, `sudoku-completion-copy`, and `sudoku-completion-actions`.

- [ ] **Step 1: Update Playwright selectors first**

Replace XPath parent traversal from previews with `select-game-card-<id>`. Replace completion CSS class locators with the new completion test IDs. Use collection test IDs for operational collection tab clicks while leaving visible heading assertions in place.

- [ ] **Step 2: Run e2e to verify it fails**

Run: `pnpm run test:e2e -- e2e/select-game.e2e.ts e2e/completion-screen.e2e.ts`
Expected: FAIL because the new select-game card/status and completion region hooks do not exist yet.

- [ ] **Step 3: Add minimal hooks**

Add the matching `data-testid` attributes to select-game cards, status overlays, collection tabs, pagination buttons, and completion panel regions.

- [ ] **Step 4: Run e2e to verify it passes**

Run: `pnpm run test:e2e -- e2e/select-game.e2e.ts e2e/completion-screen.e2e.ts`
Expected: PASS.

### Task 4: Final Verification And Issue Update

**Files:**

- No additional source files.

**Interfaces:**

- Produces: issue comment with audit findings, implemented selectors, and checks.

- [ ] **Step 1: Run code-quality checks**

Run: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, and `pnpm run test:e2e`.
Expected: all commands exit 0.

- [ ] **Step 2: Review selector audit**

Confirm the implemented hooks cover game board/cells, controls, settings toggles, difficulty selection, dialogs, navigation, completion, and select-game saved-state cards.

- [ ] **Step 3: Comment on GitHub issue #34**

Post a summary with implemented selector IDs, Playwright updates, and verification commands.
