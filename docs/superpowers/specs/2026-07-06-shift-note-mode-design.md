# Shift Note Mode Design

## Goal

Keyboard players can hold Shift to enter note mode, type or click digits as notes while Shift is held, and release Shift to leave note mode.

## Scope

In scope:

- Pressing either Shift key while the game shortcut scope is active turns on the existing notes mode.
- Releasing Shift turns notes mode off, even if notes mode was previously enabled with the Notes button or `N`.
- Existing `N` behavior remains a persistent notes-mode toggle.
- Existing Notes button behavior remains a persistent notes-mode toggle.
- Number-key entry and number-pad clicks continue to use the existing notes-mode path, so Shift-held note entry shares the same note add/remove behavior as manual notes mode.
- The Notes control uses the shorter label `Note` and shows compact keyboard hints for `N` and Shift on devices likely to have a keyboard.

Out of scope:

- Adding a separate temporary note-entry state.
- Changing mobile/touch number-pad behavior.
- Changing note persistence, auto-notes, conflicts, undo, redo, hints, or Sudoku rules.
- Detecting every possible external keyboard attached to a touch device. The hint is a progressive enhancement for desktop/fine-pointer layouts.

## Architecture

The implementation stays in the existing game shortcut and control-rendering paths.

`GridShortcuts` already owns game-scoped keyboard bindings and writes through `activateNotesMode` and `deactivateNotesMode`. Add Shift keydown and keyup bindings there. The keydown handler activates notes mode and the keyup handler deactivates it. Number input does not need a new branch because it already checks the current `notesMode` value before choosing between `setNotes` and `setNumber`.

`SudokuMenuControls` keeps receiving `notesMode` as the source of truth. The Notes button renders a compact label with the translated note text and small keycap-style `N` and `^` hints. CSS hides the hint on coarse-pointer or narrow touch-first layouts so the control remains readable.

## UI Behavior

The Notes button label changes from `Notes` to `Note` in English. It displays `Note` with small key hints for `N` and Shift on desktop-style layouts, and the existing `ON`/`OFF` status remains on the next line.

When Shift is held, the visible Notes button status and active cell note border turn on because the real notes mode is active. Releasing Shift turns those visuals off.

## Testing

Add failing coverage before production changes:

- Extend the existing Playwright keyboard shortcut flow so `Shift+number` writes a note, leaves the cell value empty, and Shift release leaves note mode off.
- Cover that releasing Shift disables notes mode even when it was manually enabled before Shift was pressed.
- Extend the Notes control render test so the compact `N` and `^` keyboard hints are present without replacing the `ON`/`OFF` status.

After implementation, run focused tests first, then the relevant project checks: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm build`, and `pnpm run test:e2e`.
