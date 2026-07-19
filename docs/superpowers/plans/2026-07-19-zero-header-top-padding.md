# Zero Header Top Padding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the shared top padding from the Sudoku game header in every solo and multiplayer layout.

**Architecture:** Keep the change inside the existing `GameHeader` presentation component by removing its `pt-2` utility. Preserve the responsive CSS overrides and all component structure, then protect the zero-padding contract with the focused component test and existing end-to-end layout coverage.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library, Playwright, pnpm

## Global Constraints

- Do not replace `pt-2` with `pt-0`; zero top padding must come from the absence of a padding utility.
- Apply the zero-padding behavior to solo and multiplayer games in portrait and landscape layouts.
- Do not change multiplayer state, component structure, controls, grid placement, or any other spacing.
- Keep the existing short-landscape `.sudoku-game-header { padding-top: 0; }` rule unchanged.

---

### Task 1: Remove Shared Header Top Padding

**Files:**
- Modify: `src/pages/Game/GameHeader.test.tsx:74-82`
- Modify: `src/pages/Game/GameHeader.tsx:161-164`

**Interfaces:**
- Consumes: `GameHeader`'s existing `className` string and `data-testid="sudoku-game-header"` test contract.
- Produces: A `GameHeader` whose shared class list contains neither `pt-2` nor `pt-4`, without changing its props or rendered children.

- [x] **Step 1: Change the focused test to require zero shared top padding**

Replace the current compact-padding test with:

```tsx
it("uses no shared top padding", () => {
  renderHeader();
  const headerClasses = screen.getByTestId("sudoku-game-header").className.split(/\s+/);

  expect(headerClasses).not.toContain("pt-2");
  expect(headerClasses).not.toContain("pt-4");
});
```

- [x] **Step 2: Run the focused test and verify the new assertion fails**

Run:

```bash
pnpm exec vitest run src/pages/Game/GameHeader.test.tsx
```

Expected: FAIL because the rendered header still contains `pt-2`.

- [x] **Step 3: Remove the padding utility from `GameHeader`**

Change the opening header element to:

```tsx
<header
  className="sudoku-game-header flex items-center justify-between gap-2 text-sm sm:text-base"
  data-testid="sudoku-game-header"
>
```

Do not change the existing short-landscape CSS rule.

- [x] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run src/pages/Game/GameHeader.test.tsx
```

Expected: PASS.

- [x] **Step 5: Run static verification**

Run:

```bash
pnpm run typecheck
pnpm run lint
```

Expected: both commands pass.

- [x] **Step 6: Run user-visible layout coverage**

Run:

```bash
pnpm run test:e2e
pnpm run test:e2e:multiplayer
```

Expected: both Playwright suites pass, including the shared header-height and multiplayer responsive-grid assertions.

- [x] **Step 7: Commit the implementation**

```bash
git add docs/superpowers/plans/2026-07-19-zero-header-top-padding.md src/pages/Game/GameHeader.test.tsx src/pages/Game/GameHeader.tsx
git commit -m "style: remove game header top padding"
```
