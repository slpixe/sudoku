# Touch-Held Note Input Design

## Goal

Touchscreen players can hold the `Note` control with one finger, tap a digit with another finger, and enter that digit as a note without leaving persistent notes mode on.

## Scope

In scope:

- Holding the `Note` control with touch or pen input enables a transient note-entry modifier.
- While the transient modifier is held, the board, number pad, and note button use note-mode visuals.
- Tapping a number while the transient modifier is held writes a note through the existing note-entry path.
- Releasing the `Note` control after a transient note entry leaves persistent notes mode off.
- A normal tap on the `Note` control keeps the existing persistent notes-mode toggle behavior.
- Existing keyboard `N` and Shift behavior remains unchanged.

Out of scope:

- Changing note persistence, auto-notes, conflicts, undo, redo, hints, or Sudoku rules.
- Adding new visible instructions or mobile-only tutorial text.
- Supporting mouse-only simulated multi-touch as a product feature. Tests may use pointer events to cover the behavior.

## Architecture

The implementation keeps persistent `game.notesMode` as stored game state and adds transient held-note state inside `GameInner`. The effective note mode for rendering and number entry is `game.notesMode || notesHeld`.

`SudokuMenuControls` receives callbacks for note-control pointer start and end. Touch or pen pointer down starts the transient modifier. Pointer up, pointer cancel, and pointer leave end it. If a number is entered while the modifier is held, the next synthesized click on the note button is suppressed so releasing the held finger does not toggle persistent notes mode.

`SudokuMenuNumbers` receives `effectiveNotesMode` through its existing `notesMode` prop and an optional callback that marks transient note usage. The digit action itself stays on the existing `setNotes` / `setNumber` path.

## UI Behavior

When a player holds `Note`, note-mode visuals turn on immediately. Number buttons show note selection states using the same styling as persistent notes mode.

If the player holds `Note`, taps `1`, releases `1`, then releases `Note`, the active cell has note `1`, the cell value remains empty, and note mode is off.

If the player simply taps `Note`, persistent note mode still toggles on or off.

## Testing

Add failing coverage before production changes:

- Extend Playwright coverage with a touch-held note interaction: dispatch touch pointer down on `Note`, tap a digit, release `Note`, dispatch the synthesized note-button click, then assert note mode remains off and the digit was written as a note.
- Assert a subsequent digit tap writes a normal value, proving the held interaction did not leave persistent note mode on.

After implementation, run focused e2e coverage first, then the relevant project checks: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm build`, and `pnpm run test:e2e`.
