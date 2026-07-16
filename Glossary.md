# Glossary

This glossary defines the shared vocabulary for the Sudoku app. Use these terms when discussing product behavior, UI changes, tests, and refactors.

## Board

The playable 9x9 Sudoku area as a whole, including its cells, selected cell, entries, notes, and highlights.

Current code words: `sudoku`, `boardData`.

## Grid

The visual 9x9 structure of the board, including rows, columns, grid lines, cells, and layout.

Use this when discussing rendering, sizing, spacing, or visual structure.

## Cell

One square position in the board.

Current code words: `Cell`, `CellCoordinates`.

## Given

A starting number that came with the puzzle data and cannot be edited by the player.

Current code words: `initial`.

## Entry

A main number the player places in an editable cell.

Use this for player input, not for givens or notes.

## Notes

Small numbers the player adds inside an editable empty cell.

Current UI words: Notes, Notes mode.
Current code words: `notes`.

## Notes Mode

The input mode where number input adds or removes notes instead of placing a main entry.

Current code words: `notesMode`.

## Hint Button

The action button that fills the selected editable cell with its correct answer.

Current UI words: Hint.
Current code words: `getHint`.

## Hint Answer

The answer inserted into a selected editable cell by the Hint button.

## Number Pad

The digit input control group for numbers 1-9, regardless of whether it is laid out as a row or a 3x3 grid.

Current code words: `SudokuMenuNumbers`.

## Action Buttons

The controls for game actions and display toggles, currently Undo, Erase, Notes, Hint, Clash, Count, and Match.

Current code words: `SudokuMenuControls`.

## Circle Menu

Legacy desktop-only cell menu code. It is not part of the current active UI.

Current code words: `SudokuMenuCircle`, `showCircleMenu`.

## Selected Cell

The cell the player has currently clicked, tapped, or moved to, and the cell that actions apply to.

Current UI words: Active cell.
Current code words: `activeCell`, `activeCellCoordinates`.

## Related Cells

Cells in the same row, column, or block as the selected cell.

Current code words: `friendCellIndexes`, `sameSquareColumnRow`.

## Block

One of the nine 3x3 Sudoku regions.

Avoid: square, because that can be confused with a cell.

## Clash

Two or more matching numbers that break Sudoku rules because they share a row, column, or block.

Current UI words: Clash.
Current code words: `conflict`, `conflicting`, `showConflicts`.

## Wrong Entry

A player-entered number that does not match the puzzle solution, even if it does not currently clash with another visible number.

Current code words: `showWrongEntries`.

## Matching Numbers

The feature that highlights filled cells containing the same number as the selected cell.

Current UI words: Match.
Current code words: `showMatchingNumbers`.

## Occurrences

The count shown on number pad buttons for how many times each number currently appears on the board.

Current UI words: Count.
Current code words: `occurrences`, `showOccurrences`.

## Select Game Page

The page where the player chooses a game from a difficulty.

Current route: `/select-game`.
Current code words: `SelectGame`, `GameSelect`.

## Difficulty

A group of games in the Easy, Medium, Hard, Fiendish, or Diabolical ladder.

Current code words: `Collection`, `BaseCollection`, `sudokuCollectionName`.
Decision note: use Difficulty for the current product vocabulary. Collection remains useful as an internal/general code term.

## Puzzle Code

The stable, language-independent identifier for a built-in puzzle. It combines
the difficulty prefix (`E`, `M`, `H`, `F`, or `D`) with the one-based puzzle
number, for example `E-1`, `F-27`, or `D-500`.

Current code words: `getBaseCollectionPuzzleCode`, `getSudokuPuzzleDisplayLabel`.

## Game

One playable Sudoku instance selected from a difficulty, including its puzzle data, progress, timer, and completion state.

## Puzzle Data

The static starting grid and solution for a game, before player progress is applied.

Current code words: `SudokuRaw`, `sudoku`, `solution`.

## Saved Game

Persisted state for a game the player has started, including entries, notes, timer, and completion state.

Current code words: `StoredPlayedSudokuState`, `playedSudokus`.

## Stats

Status or metrics shown for a game, such as play time, best time, solved count, continue state, or restart state.

Use this for the status content on game cards and the metrics in the completion panel.

## Completion Panel

The post-solve area shown after completing a game, with stats and next/new game actions.

Current code words: `GameCompletionPanel`.

## Top Bar

The top area during a game that shows the difficulty/game number, timer, theme toggle, undo, clear, pause, and new game actions.

Current code words: `GameHeader`.

## Timer

The displayed time/count for the current game.

Current code words: `secondsPlayed`, `GameTimer`.

## Pause Overlay

The overlay shown when a game is paused, hiding the board and allowing the player to continue.

Current code words: `ContinueOverlay`.

## History

The saved sequence of board states that allows Undo and Redo.

Current code words: `history`, `historyIndex`.

## Notes Clipboard

The keyboard-only notes buffer used to copy notes from one selected cell and paste them into another.

Current shortcut: `Ctrl/Cmd+C` copies notes, `Ctrl/Cmd+V` pastes notes.
Decision note: there are no visible copy/paste notes buttons in the current UI.

## Erase

The selected-cell action that removes the selected cell's entry and notes.

Current UI words: Erase.
Current code words: `clearCell`.

## Clear Game

The top-bar action that restarts the current game and loses current progress.

Current UI words: Clear.
Current code words: `resetGame`, `clearGame`.

## Start Game

The action of beginning another game after selecting it from the Select game page or choosing the next game.

## New Game Button

The top-bar button that pauses the current game and sends the player to the Select game page.

Current UI words: New game.

## Completed Game

A game that has been solved at least once and can be restarted from the Select game page.

Current code words: `won`.

## In-Progress Game

A started game that has not been completed and can be continued.

Current code words: `unfinished`.

## Game Card

A clickable item on the Select game page that represents one game.

## Puzzle Preview

The small Sudoku image inside a game card.

Current code words: `SudokuPreview`.
