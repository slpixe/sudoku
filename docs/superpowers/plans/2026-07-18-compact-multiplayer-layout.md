# Compact Multiplayer Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce vertical space above and within the Sudoku game so multiplayer controls remain visible on shorter viewports.

**Architecture:** `GameView` owns one shared grid containing optional multiplayer status, header, board, numbers, and controls. `MultiplayerStatus` owns its internal compact styling, while `main.css` assigns responsive grid areas: stacked by default, status over the right column on wider short-landscape viewports, and status spanning both columns on narrow short-landscape viewports.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3, Vitest, Testing Library, Playwright, pnpm 11.9.0

## Global Constraints

- Apply the compact status-card styling only in `MultiplayerStatus`.
- Apply the game-grid spacing change to both single-player and multiplayer through `GameView`.
- Reduce only the shared `GameHeader` top padding from `pt-4` to `pt-2`; retain the existing short-landscape zero-padding override.
- Do not change other `GameHeader` dimensions, multiplayer state, protocol behavior, puzzle sizing, translations, or control behavior.
- Render optional multiplayer status as the first child of the shared `<main>` grid and stretch it to the grid width.
- Keep short-landscape mode restricted to landscape viewports no taller than 520px, with no maximum viewport width.
- At 700px wide and above, place status over the right column; below 700px, span status across both columns.
- Use 0.25rem vertical gaps in short-landscape mode while retaining the existing 0.75rem column gap.
- Preserve flex wrapping, connection recovery, retry behavior, accessible names, visible focus treatment, and live-region announcements.
- Use pnpm for all checks.

---

### Task 1: Lock in compact layout classes (completed in `aa2c607`)

**Files:**
- Modify: `src/pages/Game/MultiplayerStatus.test.tsx`
- Modify: `src/pages/Game/GameView.test.tsx`
- Modify: `src/pages/Game/MultiplayerStatus.tsx:63-97`
- Modify: `src/pages/Game/GameView.tsx:172-174`

**Interfaces:**
- Consumes: Existing `MultiplayerStatusProps` and `GameViewProps` without changes.
- Produces: The same rendered component interfaces with more compact CSS classes; no new exported types, props, or functions.

- [x] **Step 1: Add failing assertions for the multiplayer card classes**

In the existing `renders the compact room status with in-button copy feedback` test, add these assertions after rendering and before the existing content assertions:

```tsx
const status = screen.getByTestId("multiplayer-status");
const copyButton = screen.getByTestId("multiplayer-copy-button");
const statusClasses = status.className.split(/\s+/);
const copyButtonClasses = copyButton.className.split(/\s+/);

expect(statusClasses).toContain("p-1");
expect(statusClasses).not.toContain("p-2");
expect(statusClasses).not.toContain("mt-3");
expect(copyButtonClasses).toContain("min-h-5");
expect(copyButtonClasses).not.toContain("min-h-9");
```

- [x] **Step 2: Add a failing shared-grid spacing test**

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

- [x] **Step 3: Run the focused tests and verify the new assertions fail**

Run:

```bash
pnpm exec vitest run src/pages/Game/MultiplayerStatus.test.tsx src/pages/Game/GameView.test.tsx
```

Expected: FAIL because `MultiplayerStatus` still renders `mt-3 p-2`, its Copy button still renders `min-h-9`, and the shared game grid still renders `mt-3 gap-3`.

- [x] **Step 4: Apply the compact component classes**

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

- [x] **Step 5: Run the focused tests and verify they pass**

Run:

```bash
pnpm exec vitest run src/pages/Game/MultiplayerStatus.test.tsx src/pages/Game/GameView.test.tsx
```

Expected: both test files PASS, including the existing accessibility and command-delegation coverage.

- [x] **Step 6: Commit the compact layout implementation**

```bash
git add src/pages/Game/MultiplayerStatus.test.tsx src/pages/Game/GameView.test.tsx src/pages/Game/MultiplayerStatus.tsx src/pages/Game/GameView.tsx
git commit -m "style: compact multiplayer game layout"
```

### Task 2: Reduce shared game-header top padding (completed in `da8af92`)

**Files:**
- Modify: `src/pages/Game/GameHeader.test.tsx`
- Modify: `src/pages/Game/GameHeader.tsx:160-164`

**Interfaces:**
- Consumes: Existing `GameHeader` props and short-landscape `.sudoku-game-header` CSS override without changes.
- Produces: The same rendered `GameHeader` interface with `pt-2` instead of `pt-4`; no new props, types, or behavior.

- [x] **Step 1: Add a failing header-padding assertion**

Add this test near the start of the `GameHeader` describe block:

```tsx
it("uses compact shared top padding", () => {
  renderHeader();
  const headerClasses = screen.getByTestId("sudoku-game-header").className.split(/\s+/);

  expect(headerClasses).toContain("pt-2");
  expect(headerClasses).not.toContain("pt-4");
});
```

- [x] **Step 2: Run the focused test and verify the new assertion fails**

Run:

```bash
pnpm exec vitest run src/pages/Game/GameHeader.test.tsx
```

Expected: FAIL because `GameHeader` still renders `pt-4` and does not render `pt-2`.

- [x] **Step 3: Reduce the header top padding**

In `GameHeader.tsx`, replace the header class string with:

```tsx
className="sudoku-game-header flex items-center justify-between gap-2 pt-2 text-sm sm:text-base"
```

- [x] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run src/pages/Game/GameHeader.test.tsx
```

Expected: all `GameHeader` tests PASS, including the compact padding assertion and existing command-behavior coverage.

- [x] **Step 5: Commit the compact header implementation**

```bash
git add src/pages/Game/GameHeader.test.tsx src/pages/Game/GameHeader.tsx
git commit -m "style: reduce game header top padding"
```

### Task 3: Move multiplayer status into the shared game grid (completed in `a1c077d`)

**Files:**
- Modify: `src/pages/Game/GameView.test.tsx`
- Modify: `src/pages/Game/MultiplayerStatus.test.tsx`
- Modify: `src/pages/Game/GameView.tsx:145-176`
- Modify: `src/pages/Game/MultiplayerStatus.tsx:63-67`

**Interfaces:**
- Consumes: Existing optional `GameViewProps.statusContent: React.ReactNode` and `MultiplayerStatus` markup.
- Produces: A `sudoku-game-layout-multiplayer` modifier class whenever status content exists, with that content rendered as the main grid's first child; no prop or state changes.

- [x] **Step 1: Add failing component assertions for grid ownership and width**

Add this test near the start of the `GameView` describe block:

```tsx
it("places status content first inside the shared game grid", () => {
  const {container} = renderView({statusContent: <section data-testid="test-status-content">Status</section>});
  const layout = container.querySelector("main.sudoku-game-layout");
  const status = screen.getByTestId("test-status-content");
  const header = screen.getByTestId("sudoku-game-header");

  expect(layout).not.toBeNull();
  expect(layout?.className.split(/\s+/)).toContain("sudoku-game-layout-multiplayer");
  expect(layout?.firstElementChild).toBe(status);
  expect(status.nextElementSibling).toBe(header);
});
```

In `MultiplayerStatus.test.tsx`, add this assertion to the existing compact-room-status test:

```tsx
expect(statusClasses).toContain("w-full");
```

- [x] **Step 2: Run the focused component tests and verify they fail**

Run:

```bash
pnpm exec vitest run src/pages/Game/GameView.test.tsx src/pages/Game/MultiplayerStatus.test.tsx
```

Expected: FAIL because status content is still outside `<main>`, the modifier class is absent, and the multiplayer status lacks `w-full`.

- [x] **Step 3: Move status content and add the multiplayer modifier**

Remove `{statusContent}` from above `Shortcuts`, then update the main element and its first child to:

```tsx
<main
  className={`sudoku-game-layout${won ? " sudoku-game-layout-complete" : ""}${statusContent ? " sudoku-game-layout-multiplayer" : ""} grid w-full gap-1`}
>
  {statusContent}
  <GameHeader
```

Update the multiplayer status section class to:

```tsx
className="multiplayer-status mx-auto grid w-full gap-2 rounded-sm bg-gray-700/70 p-1 text-sm text-white"
```

- [x] **Step 4: Run the focused component tests and verify they pass**

Run:

```bash
pnpm exec vitest run src/pages/Game/GameView.test.tsx src/pages/Game/MultiplayerStatus.test.tsx
```

Expected: both files PASS, including DOM-order, compact-class, accessibility, and interaction coverage.

- [x] **Step 5: Commit shared grid ownership**

```bash
git add src/pages/Game/GameView.test.tsx src/pages/Game/MultiplayerStatus.test.tsx src/pages/Game/GameView.tsx src/pages/Game/MultiplayerStatus.tsx
git commit -m "refactor: place multiplayer status in game grid"
```

### Task 4: Extend short-landscape layout across wide viewports (completed in `611f038`)

**Files:**
- Modify: `src/main.css:45-307`
- Modify: `e2e/multiplayer.e2e.ts`

**Interfaces:**
- Consumes: The `sudoku-game-layout-multiplayer` class and first-child status structure produced by Task 3.
- Produces: Responsive CSS grid areas for stacked, narrow short-landscape, wide short-landscape, and completed multiplayer layouts.

- [x] **Step 1: Add a failing responsive multiplayer-grid test**

Add this test after the Fiendish room-creation test in `e2e/multiplayer.e2e.ts`:

```ts
test("places multiplayer status responsively across landscape breakpoints", async ({page}) => {
  await createEasyRoom(page);
  const viewports = [
    {width: 699, height: 500, mode: "spanning"},
    {width: 700, height: 500, mode: "right-column"},
    {width: 844, height: 390, mode: "right-column"},
    {width: 900, height: 500, mode: "right-column"},
    {width: 901, height: 500, mode: "right-column"},
    {width: 2_000, height: 500, mode: "right-column"},
    {width: 1_024, height: 600, mode: "stacked"},
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    const layout = await page.locator("main.sudoku-game-layout").evaluate((main) => {
      const status = main.querySelector<HTMLElement>("[data-testid='multiplayer-status']");
      const header = main.querySelector<HTMLElement>("[data-testid='sudoku-game-header']");
      const board = main.querySelector<HTMLElement>("[data-testid='sudoku-board']");
      const numbers = main.querySelector<HTMLElement>(".sudoku-number-pad");
      const controls = main.querySelector<HTMLElement>(".sudoku-control-pad");
      if (!status || !header || !board || !numbers || !controls) {
        throw new Error("Expected the complete multiplayer game grid");
      }
      const box = (element: HTMLElement) => element.getBoundingClientRect();
      const statusBox = box(status);
      const headerBox = box(header);
      const boardBox = box(board);
      const numbersBox = box(numbers);
      const controlsBox = box(controls);
      return {
        controlsBottom: controlsBox.bottom,
        gridAreas: getComputedStyle(main).gridTemplateAreas,
        statusBeforeHeader: status.nextElementSibling === header,
        statusBottom: statusBox.bottom,
        statusLeft: statusBox.left,
        headerTop: headerBox.top,
        boardTop: boardBox.top,
        boardRight: boardBox.right,
        numbersTop: numbersBox.top,
        controlsTop: controlsBox.top,
      };
    });

    expect(layout.statusBeforeHeader).toBe(true);
    expect(layout.controlsBottom).toBeLessThanOrEqual(viewport.height + 1);
    if (viewport.mode === "stacked") {
      expect(layout.gridAreas).toBe("none");
      expect(layout.statusBottom).toBeLessThanOrEqual(layout.headerTop);
      expect(layout.headerTop).toBeLessThan(layout.boardTop);
      expect(layout.boardTop).toBeLessThan(layout.numbersTop);
      expect(layout.numbersTop).toBeLessThan(layout.controlsTop);
    } else if (viewport.mode === "spanning") {
      expect(layout.gridAreas).toContain('"status status"');
      expect(layout.statusBottom).toBeLessThanOrEqual(layout.boardTop);
    } else {
      expect(layout.gridAreas).toContain('"board status"');
      expect(layout.statusLeft).toBeGreaterThanOrEqual(layout.boardRight);
    }
  }
});
```

In the existing `"synchronizes the complete two-player room flow in both directions"` test, add this assertion after the completion UI is visible so the completed multiplayer grid keeps the same status placement:

```ts
await creator.setViewportSize({width: 900, height: 500});
const completedGridAreas = await creator
  .locator("main.sudoku-game-layout")
  .evaluate((main) => getComputedStyle(main).gridTemplateAreas);
expect(completedGridAreas).toContain('"board status"');
expect(completedGridAreas).toContain('"board completion"');
```

- [x] **Step 2: Run the focused Playwright test and verify it fails**

Run:

```bash
pnpm exec playwright test --config playwright.multiplayer.config.ts -g "places multiplayer status responsively|synchronizes the complete"
```

Expected: FAIL because the responsive multiplayer grid areas are not implemented yet: 699×500 does not span the status across both columns, 901×500 and 2000×500 remain stacked, and the completed 900×500 grid has no status area.

- [x] **Step 3: Remove the short-landscape maximum-width ceiling**

Apply these exact media-query changes in `src/main.css`:

```diff
-@media (orientation: landscape) and (max-height: 520px) and (max-width: 900px) {
+@media (orientation: landscape) and (max-height: 520px) {
```

```diff
-  @media (orientation: landscape) and (max-height: 520px) and (max-width: 900px) {
+  @media (orientation: landscape) and (max-height: 520px) {
```

```diff
-@media (orientation: landscape) and (min-width: 720px) and (max-width: 900px) and (max-height: 520px) {
+@media (orientation: landscape) and (min-width: 720px) and (max-height: 520px) {
```

In the primary short-landscape `.sudoku-game-layout` rule, retain `column-gap: 0.75rem` and change the vertical gap to:

```css
row-gap: 0.25rem;
```

- [x] **Step 4: Add multiplayer status grid areas**

Inside the primary short-landscape media query, directly after `.sudoku-game-layout`, add:

```css
.sudoku-game-layout-multiplayer {
  grid-template-areas:
    "board status"
    "board header"
    "board numbers"
    "board controls";
  grid-template-rows: auto auto minmax(0, 1fr) auto;
}

.sudoku-game-layout-multiplayer > .multiplayer-status {
  grid-area: status;
}
```

Directly after the existing `.sudoku-game-layout-complete` short-landscape rule, add:

```css
.sudoku-game-layout-complete.sudoku-game-layout-multiplayer {
  grid-template-areas:
    "board status"
    "board header"
    "board completion";
  grid-template-rows: auto auto minmax(0, 1fr);
}
```

After the primary short-landscape media query, add the narrow fallback:

```css
@media (orientation: landscape) and (max-height: 520px) and (max-width: 699px) {
  .sudoku-game-layout-multiplayer {
    grid-template-areas:
      "status status"
      "board header"
      "board numbers"
      "board controls";
  }

  .sudoku-game-layout-complete.sudoku-game-layout-multiplayer {
    grid-template-areas:
      "status status"
      "board header"
      "board completion";
  }
}
```

- [x] **Step 5: Run focused component and responsive tests**

Run:

```bash
pnpm exec vitest run src/pages/Game/GameView.test.tsx src/pages/Game/MultiplayerStatus.test.tsx
pnpm exec playwright test --config playwright.multiplayer.config.ts -g "places multiplayer status responsively|synchronizes the complete"
```

Expected: component tests PASS, the responsive test passes at all seven viewports with controls inside the viewport, and the completed 900×500 layout keeps status above the right-column completion content.

- [x] **Step 6: Commit the responsive grid**

```bash
git add src/main.css e2e/multiplayer.e2e.ts
git commit -m "style: improve responsive multiplayer layout"
```

### Task 5: Verify the complete user-visible flow (completed)

**Files:**
- Verify only: no expected file changes.

**Interfaces:**
- Consumes: The compact styling and responsive grid produced by Tasks 1 through 4.
- Produces: Verification evidence for the shared single-player layout and multiplayer room layout.

- [x] **Step 1: Run static and full unit checks**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
```

Expected: every command exits with status 0 and reports no TypeScript, ESLint, unit-test, or build failures.

- [x] **Step 2: Run the single-player Playwright suite**

Run:

```bash
pnpm run test:e2e
```

Expected: PASS. The isolated preview starts on port 4179, game interactions remain usable, and the shared compact grid does not regress single-player flows.

- [x] **Step 3: Run the multiplayer Playwright suite**

Run:

```bash
pnpm run test:e2e:multiplayer
```

Expected: PASS. Room creation, joining, presence, shared actions, reconnect behavior, and multiplayer layout remain functional.

- [x] **Step 4: Record verification without changing behavior**

If all checks pass, report their exact commands in the implementation handoff. If a check fails, diagnose whether it is caused by these class changes before modifying any file; do not expand the implementation beyond this design without approval.
