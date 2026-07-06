# Shift Note Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Shift-held note mode for keyboard players and expose compact `N`/Shift hints on the Notes control.

**Architecture:** Reuse the existing `notesMode` state instead of adding transient input state. Game-scoped shortcut handlers activate notes mode on Shift keydown and deactivate it on Shift keyup, while the Notes button renders the current mode plus compact keyboard hints.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, hotkeys-js, Vitest, Playwright, pnpm.

## Global Constraints

- Use pnpm consistently for local development, CI, Docker, and Playwright web-server commands.
- Keep `N` as a persistent notes-mode toggle.
- Releasing Shift turns notes mode off, even when notes mode was manually enabled first.
- Keep number-key and number-pad note entry on the existing notes-mode path.
- Hide the extra keyboard hint on touch-first layouts.

---

### Task 1: Shift-Held Notes Mode

**Files:**
- Modify: `src/pages/Game/shortcuts/GridShortcuts.tsx`
- Test: `e2e/sudoku.e2e.ts`

**Interfaces:**
- Consumes: `activateNotesMode: () => void`, `deactivateNotesMode: () => void`, existing number-key bindings, and Playwright `page.keyboard`.
- Produces: real `notesMode` activation while Shift is held, and deactivation after Shift is released.

- [ ] **Step 1: Write the failing Playwright coverage**

Extend `test("supports number entry, erase, undo, redo, notes, hints, and keyboard shortcuts", ...)` in `e2e/sudoku.e2e.ts` after the existing manual note copy/paste assertions:

```ts
  await selectCell(page, 1, 1);
  await page.keyboard.down("Shift");
  await expect(cell(page, 1, 1)).toHaveAttribute("data-cell-notes-mode", "true");
  await page.keyboard.press("1");
  await expect(cellValue(page, 1, 1)).toHaveText("");
  await expect(cellNotes(page, 1, 1)).toContainText("1");
  await page.keyboard.up("Shift");
  await expect(cell(page, 1, 1)).toHaveAttribute("data-cell-notes-mode", "false");

  await page.keyboard.press("n");
  await expect(cell(page, 1, 1)).toHaveAttribute("data-cell-notes-mode", "true");
  await page.keyboard.down("Shift");
  await page.keyboard.up("Shift");
  await expect(cell(page, 1, 1)).toHaveAttribute("data-cell-notes-mode", "false");
```

- [ ] **Step 2: Run the focused failing e2e test**

Run: `pnpm exec playwright test e2e/sudoku.e2e.ts --grep "supports number entry" --project=chromium-light`

Expected before implementation: FAIL because Shift does not activate notes mode.

- [ ] **Step 3: Implement Shift key bindings**

In `src/pages/Game/shortcuts/GridShortcuts.tsx`, add game-scoped Shift handlers next to the `n` note-mode shortcut:

```ts
    hotkeys("shift", ShortcutScope.Game, () => {
      stateRef.current.activateNotesMode();
      return false;
    });

    hotkeys("shift", {keyup: true, keydown: false, scope: ShortcutScope.Game}, () => {
      stateRef.current.deactivateNotesMode();
      return false;
    });
```

- [ ] **Step 4: Run the focused e2e test again**

Run: `pnpm exec playwright test e2e/sudoku.e2e.ts --grep "supports number entry" --project=chromium-light`

Expected after implementation: PASS.

### Task 2: Notes Button Keyboard Hint

**Files:**
- Modify: `src/components/sudoku/SudokuMenuControls.tsx`
- Modify: `src/components/sudoku/SudokuMenuControls.test.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/main.css`

**Interfaces:**
- Consumes: existing `notesMode` prop and `note_btn` translation.
- Produces: Notes control label `Note`, visible keycap-style `N` and `^` hints on desktop-style layouts, and unchanged `ON`/`OFF` status.

- [ ] **Step 1: Write the failing render test**

Add a test to `src/components/sudoku/SudokuMenuControls.test.tsx`:

```tsx
  it("shows compact keyboard hints on the note control without replacing status", () => {
    const html = renderControls({notesMode: false});
    const notes = renderedButton(html, "note_btn");

    expect(notes.text()).toContain("note_btn");
    expect(notes.text()).toContain("N");
    expect(notes.text()).toContain("^");
    expect(notes.find('[data-testid="sudoku-control-notes-key-hints"]').length).toBe(1);
    expect(notes.find("div").last().text()).toBe("OFF");
  });
```

- [ ] **Step 2: Run the focused failing unit test**

Run: `pnpm exec vitest run src/components/sudoku/SudokuMenuControls.test.tsx`

Expected before implementation: FAIL because the key hints are absent.

- [ ] **Step 3: Implement the button markup and copy**

In `src/components/sudoku/SudokuMenuControls.tsx`, render the Notes button label as `Note` plus key hints:

```tsx
      <div className="flex items-center justify-center gap-1 leading-4">
        <span>{t("note_btn")}</span>
        <span
          aria-hidden="true"
          className="sudoku-notes-key-hints hidden items-center gap-0.5 text-[0.55rem] font-bold leading-none opacity-80 sm:inline-flex"
          data-testid="sudoku-control-notes-key-hints"
        >
          <span className="rounded-sm bg-gray-200 px-1 py-0.5 text-gray-800 dark:bg-gray-700 dark:text-gray-100">N</span>
          <span className="rounded-sm bg-gray-200 px-1 py-0.5 text-gray-800 dark:bg-gray-700 dark:text-gray-100">^</span>
        </span>
      </div>
```

Change `src/locales/en.json` from `"note_btn": "Notes"` to `"note_btn": "Note"`.

Add CSS in `src/main.css`:

```css
@media (pointer: coarse), (max-width: 640px) {
  .sudoku-notes-key-hints {
    display: none;
  }
}
```

- [ ] **Step 4: Run the focused unit test again**

Run: `pnpm exec vitest run src/components/sudoku/SudokuMenuControls.test.tsx`

Expected after implementation: PASS.

### Task 3: Verification

**Files:**
- Verify: `src/pages/Game/shortcuts/GridShortcuts.tsx`
- Verify: `src/components/sudoku/SudokuMenuControls.tsx`
- Verify: `src/locales/en.json`
- Verify: `src/main.css`
- Verify: `e2e/sudoku.e2e.ts`

**Interfaces:**
- Consumes: completed Task 1 and Task 2 behavior.
- Produces: checked feature branch ready for user review.

- [ ] **Step 1: Run static and unit checks**

Run: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, and `pnpm build`.

Expected: all commands pass.

- [ ] **Step 2: Run e2e checks**

Run: `pnpm run test:e2e`.

Expected: all Playwright tests pass.

- [ ] **Step 3: Review final diff**

Run: `git diff --stat` and `git diff --check`.

Expected: no whitespace errors and only scoped files changed.
