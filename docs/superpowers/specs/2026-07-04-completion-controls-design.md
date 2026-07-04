# Completion Controls Design

## Scope

This work implements GitHub issue #16. It replaces the current full-board win overlay with a completion panel that keeps the solved Sudoku grid visible.

In scope:

- Keep the completed board unobscured after a win.
- Replace now-irrelevant number and control buttons with completion information.
- Provide a primary action for the next puzzle in the current collection.
- Provide a secondary New game action that opens the existing game-selection flow.
- Account for portrait, desktop, compact landscape, and tablet layouts.
- Update e2e coverage for completing a puzzle and choosing the next game from the new panel.

Out of scope:

- Adding sharing, score history, animations, or a broader post-game statistics system.
- Changing Sudoku solving, persistence, collection routing, or puzzle data.
- Redesigning the header, board rendering, or active in-game controls beyond their completed-state replacement.

## Approaches Considered

### Compact dismissible success panel

A small success panel above or below the board would announce the win and include Next and Hide actions. This keeps the board visible and makes dismissal explicit, but it introduces a state that must be recoverable because hiding the panel could also hide the next-puzzle action. It also leaves the disabled number and action controls visible unless they are handled separately.

### Replace completed controls

The selected approach replaces the number pad and lower game controls with a completion panel. The board stays in the same position, the no-longer-useful controls disappear, and the completed state gets enough space for stats plus clear actions. This works especially well in compact landscape layouts because the existing right-side control column can become the completion area.

### Tiny persistent banner

A small banner below the board would be the least intrusive option. It is also the least celebratory and does not solve the problem of disabled controls remaining in the interface. This was not selected.

## Chosen Design

When `game.won` is true, the game screen renders the Sudoku board normally and swaps the number pad plus control pad for a completion panel.

The panel contains two areas:

- Completion copy: a concise "Solved" heading, solved count, current time, and best time when available.
- Actions: a primary Next button and a secondary New game button.

The panel is not dismissible. Dismissal is unnecessary because it does not cover the board, and the in-game number, note, hint, clear, undo, and pause controls are no longer useful after the puzzle is solved. The header remains visible, including the current game label, timer, dark-mode toggle, and existing New game path.

## Responsive Layout

Portrait and normal desktop widths use a compact panel below the board. The copy sits on the left and the two action buttons sit on the right when space allows. On narrow phones, the panel stacks the copy above a two-button row so text and tap targets keep stable widths.

Compact landscape and tablet layouts replace the right-side number/control column with the completion panel. In this mode, the completion copy is centered within the panel so the solved state feels intentional and does not leave awkward empty space to the right of left-aligned text. The actions sit below the centered copy.

The board itself must not move between the running and completed states. The implementation keeps the existing header and board grid areas stable and only replaces the controls area.

## Actions

The primary action is Next `<collection>` `#<index>`, for example `Next Easy #2`. It uses the existing next-puzzle lookup behavior from `GameWonOverlay`.

If there is no next puzzle in the current collection, the panel shows collection-finished copy and provides a New game action instead of a duplicate or impossible Next action.

The secondary New game action uses the same route behavior as the header New game button and takes the user to the selection screen. This gives users an obvious path from Easy #1 to another collection such as Medium #1 without needing to use the header.

## Data Flow

The game already records a win through `wonGame()` when `SudokuGame.isSolved(sudoku)` becomes true. That state remains the source of truth.

Rendering changes stay localized to the game page:

- Continue rendering `Sudoku` without a win overlay child.
- Render `GameCompletionPanel` when `game.won` is true.
- Render `SudokuMenuNumbers` and `SudokuMenuControls` only while `game.won` is false.
- Reuse the current next-puzzle calculation and collection-finished handling without changing route parameters.

The timer and current game label remain visible in the header. Pause, clear, undo, hint, notes, and number entry controls are removed from the completed state because they are no longer actionable. Current preference toggles remain persisted but are not shown in the completed controls area.

## Accessibility

The completion panel is a non-modal region, not a dialog. It does not trap focus or obscure the board.

Use an accessible heading for the solved state and expose the completion update through a `role="status"` region. When keyboard focus was on a number or control button that is replaced by the panel, move focus to the primary action: Next when a next puzzle exists, otherwise New game.

Buttons must retain visible focus states, minimum practical touch targets, and accessible labels that include the destination puzzle where applicable.

## Testing

Update the existing Playwright win-flow test to assert that:

- Completing the puzzle shows the completion panel.
- The solved board remains visible and is not covered by a win overlay.
- The old win overlay text is no longer rendered over the board.
- The Next action starts the next puzzle and updates the route as before.
- The New game action opens the selection screen.

Add a compact landscape/tablet e2e viewport assertion that the completion panel is visible while the board remains visible and unobscured. Run the standard checks after implementation: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm build`, and `pnpm run test:e2e`.
