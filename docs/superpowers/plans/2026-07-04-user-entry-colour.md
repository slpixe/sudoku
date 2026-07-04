# User Entry Colour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editable filled Sudoku numbers use a pending orange/amber color instead of green/teal.

**Architecture:** Keep the change inside the existing Sudoku board rendering path. Add a focused server-rendered component test for `GridCellNumber`, then change its class selection so editable non-conflicting digits use `text-amber-600` whether or not they are matching-number highlights.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Vitest, React DOM server rendering.

## Global Constraints

- Use pnpm for all commands.
- Do not add new runtime dependencies.
- Preserve current hint behavior, undo behavior, persistence, Sudoku rules, and conflict/wrong-entry semantics.
- Keep given puzzle numbers black in light mode and white in dark mode.
- Keep conflict/wrong-entry text red when those highlights are active.
- Use `text-amber-600` for normal editable filled numbers.

---

### Task 1: Grid Digit Pending Colour

**Files:**

- Create: `src/components/sudoku/SudokuGrid.test.tsx`
- Modify: `src/components/sudoku/SudokuGrid.tsx`

**Interfaces:**

- Consumes: `GridCellNumber({initial, highlight, conflict, left, top, children, testId})` exported from `src/components/sudoku/SudokuGrid.tsx`.
- Produces: `GridCellNumber` renders the correct Tailwind text color classes for editable, matching, conflict, and given digit states.

- [ ] **Step 1: Write the failing component test**

Create `src/components/sudoku/SudokuGrid.test.tsx` with this content:

```tsx
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import {load} from "cheerio";

import {GridCellNumber} from "./SudokuGrid";

function renderCellNumber({
  initial = false,
  highlight = false,
  conflict = false,
}: {
  initial?: boolean;
  highlight?: boolean;
  conflict?: boolean;
}) {
  return load(
    renderToStaticMarkup(
      <GridCellNumber initial={initial} highlight={highlight} conflict={conflict} left={50} top={50} testId="cell-value">
        5
      </GridCellNumber>,
    ),
  )('[data-testid="cell-value"]').attr("class");
}

describe("GridCellNumber", () => {
  it("uses pending amber text for editable entries", () => {
    const className = renderCellNumber({});

    expect(className).toContain("text-amber-600");
    expect(className).not.toContain("text-teal-600");
  });

  it("keeps pending amber text when an editable entry matches the active number", () => {
    const className = renderCellNumber({highlight: true});

    expect(className).toContain("text-amber-600");
    expect(className).not.toContain("text-teal-600");
  });

  it("uses red text for editable entries in conflict or wrong-entry states", () => {
    const className = renderCellNumber({conflict: true});

    expect(className).toContain("text-red-600");
    expect(className).not.toContain("text-amber-600");
    expect(className).not.toContain("text-teal-600");
  });

  it("uses neutral text for given entries", () => {
    const className = renderCellNumber({initial: true});

    expect(className).toContain("text-black");
    expect(className).toContain("dark:text-white");
    expect(className).not.toContain("text-amber-600");
    expect(className).not.toContain("text-teal-600");
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the expected reason**

Run:

```bash
pnpm exec vitest run src/components/sudoku/SudokuGrid.test.tsx
```

Expected: `GridCellNumber > uses pending amber text for editable entries` fails because the class contains `text-teal-600` instead of `text-amber-600`.

- [ ] **Step 3: Implement the minimal production change**

In `src/components/sudoku/SudokuGrid.tsx`, update only the `GridCellNumber` class map:

```tsx
className={clsx(
  "sudoku-cell-number pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 font-bold leading-none",
  {
    "text-black dark:text-white": initial,
    "text-amber-600": !initial && !conflict,
    "text-red-600 dark:text-red-300": conflict && !initial,
  },
)}
```

This removes the separate green/teal default path and lets matching-number highlighted editable digits keep the same pending class.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run src/components/sudoku/SudokuGrid.test.tsx
```

Expected: all `GridCellNumber` tests pass.

- [ ] **Step 5: Run baseline checks**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm build
```

Expected: all commands complete successfully.

- [ ] **Step 6: Update issue #21**

After checks pass, comment on issue #21 with the implementation summary and checks run. Close the issue because the acceptance criteria are satisfied.
