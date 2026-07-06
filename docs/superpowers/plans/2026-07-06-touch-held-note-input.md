# Touch-Held Note Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let touchscreen players hold `Note`, tap a digit as a note, and release without toggling persistent notes mode on.

**Architecture:** Keep persistent notes mode in `game.notesMode` and add transient held-note state in `GameInner`. Pass `effectiveNotesMode = game.notesMode || notesHeld` to board and number inputs, and suppress the note button's synthesized click only after a held-note digit was entered.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Playwright, Vitest, pnpm.

## Global Constraints

- Use pnpm consistently for local development, CI, Docker, and Playwright web-server commands.
- Normal `Note` button taps keep toggling persistent notes mode.
- Keyboard `N` and Shift behavior remains unchanged.
- Do not add visible instructional copy.
- Run `pnpm run test:e2e` for user-visible app flow changes.

---

### Task 1: Touch-Held Note Behavior Coverage

**Files:**
- Modify: `e2e/sudoku.e2e.ts`

**Interfaces:**
- Consumes: existing `openGame`, `selectCell`, `cell`, `cellValue`, and `cellNotes` e2e helpers.
- Produces: failing Playwright coverage for touch pointer hold on the note button plus digit tap.

- [ ] **Step 1: Add the failing e2e test**

Add this test after `test("supports number entry, erase, undo, redo, notes, hints, and keyboard shortcuts", ...)` in `e2e/sudoku.e2e.ts`:

```ts
test("supports touch-held note entry without toggling persistent note mode", async ({page}) => {
  await openGame(page);

  await selectCell(page, 5, 0);
  const notesButton = page.getByTestId("sudoku-control-notes");

  await notesButton.dispatchEvent("pointerdown", {pointerId: 11, pointerType: "touch", isPrimary: true});
  await expect(cell(page, 5, 0)).toHaveAttribute("data-cell-notes-mode", "true");
  await page.getByTestId("sudoku-number-1").click();
  await expect(cellValue(page, 5, 0)).toHaveText("");
  await expect(cellNotes(page, 5, 0)).toContainText("1");

  await notesButton.dispatchEvent("pointerup", {pointerId: 11, pointerType: "touch", isPrimary: true});
  await notesButton.click();
  await expect(cell(page, 5, 0)).toHaveAttribute("data-cell-notes-mode", "false");

  await page.getByTestId("sudoku-number-2").click();
  await expect(cellValue(page, 5, 0)).toHaveText("2");
  await expect(cellNotes(page, 5, 0)).toHaveText("");
});
```

- [ ] **Step 2: Run the focused failing e2e test**

Run: `pnpm exec playwright test e2e/sudoku.e2e.ts --grep "touch-held note entry" --project=chromium-light`

Expected before implementation: FAIL because holding the note button does not enable note-mode visuals or note entry.

### Task 2: Transient Held Note State

**Files:**
- Modify: `src/pages/Game.tsx`
- Modify: `src/components/sudoku/SudokuMenuControls.tsx`
- Modify: `src/components/sudoku/SudokuMenuNumbers.tsx`

**Interfaces:**
- Consumes: existing `game.notesMode`, `activateNotesMode`, `deactivateNotesMode`, number-pad `setNumber` and `setNotes` callbacks.
- Produces: `effectiveNotesMode` for visuals/input and note-button touch handlers that do not persist state after a held-note digit.

- [ ] **Step 1: Add transient state in `GameInner`**

In `src/pages/Game.tsx`, add refs and callbacks after `lockedGameRef`:

```tsx
  const [notesHeld, setNotesHeld] = React.useState(false);
  const noteHoldUsedRef = React.useRef(false);
  const effectiveNotesMode = game.notesMode || notesHeld;

  const startNoteHold = React.useCallback(() => {
    noteHoldUsedRef.current = false;
    setNotesHeld(true);
  }, []);

  const stopNoteHold = React.useCallback(() => {
    setNotesHeld(false);
  }, []);

  const markNoteHoldUsed = React.useCallback(() => {
    if (notesHeld && !game.notesMode) {
      noteHoldUsedRef.current = true;
    }
  }, [notesHeld, game.notesMode]);

  const consumeNoteHoldClick = React.useCallback(() => {
    if (!noteHoldUsedRef.current) {
      return false;
    }
    noteHoldUsedRef.current = false;
    return true;
  }, []);
```

Then pass `effectiveNotesMode` instead of `game.notesMode` to `<Sudoku>` and `<SudokuMenuNumbers>`, pass `notesMode={effectiveNotesMode}` plus hold props to `<SudokuMenuControls>`, and pass `onNoteInput={markNoteHoldUsed}` to `<SudokuMenuNumbers>`.

- [ ] **Step 2: Add hold props to `SudokuMenuControls`**

In `src/components/sudoku/SudokuMenuControls.tsx`, add these optional props to `NotesButton`:

```tsx
  onNoteHoldStart?: () => void;
  onNoteHoldEnd?: () => void;
  shouldSuppressToggleClick?: () => boolean;
```

Add this helper above `NotesButton`:

```tsx
function isHoldPointer(event: React.PointerEvent<HTMLButtonElement>) {
  return event.pointerType === "touch" || event.pointerType === "pen";
}
```

Update the note button event handlers:

```tsx
      onClick={() => {
        if (shouldSuppressToggleClick?.()) {
          return;
        }
        if (notesMode) {
          deactivateNotesMode();
        } else {
          activateNotesMode();
        }
      }}
      onPointerCancel={(event) => {
        if (isHoldPointer(event)) {
          onNoteHoldEnd?.();
        }
      }}
      onPointerDown={(event) => {
        if (isHoldPointer(event)) {
          onNoteHoldStart?.();
        }
      }}
      onPointerLeave={(event) => {
        if (isHoldPointer(event)) {
          onNoteHoldEnd?.();
        }
      }}
      onPointerUp={(event) => {
        if (isHoldPointer(event)) {
          onNoteHoldEnd?.();
        }
      }}
```

Thread the same optional props through `SudokuMenuControls` to `NotesButton`.

- [ ] **Step 3: Mark note hold usage from `SudokuMenuNumbers`**

In `src/components/sudoku/SudokuMenuNumbers.tsx`, add an optional prop:

```ts
  onNoteInput?: () => void;
```

Inside `setNumberOrNote`, call it only when the action writes notes:

```ts
            setNotes(activeCell, newNotes);
            onNoteInput?.();
```

- [ ] **Step 4: Run the focused e2e test again**

Run: `pnpm exec playwright test e2e/sudoku.e2e.ts --grep "touch-held note entry" --project=chromium-light`

Expected after implementation: PASS.

### Task 3: Verification

**Files:**
- Verify: `src/pages/Game.tsx`
- Verify: `src/components/sudoku/SudokuMenuControls.tsx`
- Verify: `src/components/sudoku/SudokuMenuNumbers.tsx`
- Verify: `e2e/sudoku.e2e.ts`

**Interfaces:**
- Consumes: completed Task 1 and Task 2 behavior.
- Produces: checked feature branch ready for phone testing and user review.

- [ ] **Step 1: Run project checks**

Run: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, and `pnpm build`.

Expected: all commands pass.

- [ ] **Step 2: Run full e2e checks**

Run: `pnpm run test:e2e`.

Expected: all Playwright tests pass.

- [ ] **Step 3: Review final diff**

Run: `git diff --stat` and `git diff --check`.

Expected: no whitespace errors and only scoped files changed.
