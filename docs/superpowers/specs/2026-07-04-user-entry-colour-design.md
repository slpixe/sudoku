# User Entry Colour Design

## Scope

This work implements GitHub issue #21. Editable filled numbers should no longer look confirmed by default. User-entered values and hint-filled values are both pending player-filled entries, so they should use Tailwind's amber/orange pending text class, `text-amber-600`, unless an error or conflict state overrides them.

In scope:

- Change editable non-conflicting filled numbers from green/teal text to `text-amber-600`.
- Keep given puzzle numbers black in light mode and white in dark mode.
- Keep wrong-entry and conflict text red when those highlights are active.
- Keep matching-number emphasis on the cell background so editable entries still read as pending.
- Add focused test coverage for the visual state classes exposed by the board digit component.

Out of scope:

- Tracking hinted cells separately from user-entered cells.
- Changing hint behavior, undo behavior, solution checking, persistence, or Sudoku rules.
- Redesigning the wider board, number pad, or app color palette.
- Adding a new user preference for entry colors.

## Architecture

The change stays in the existing Sudoku board rendering path. `GridCellNumber` already receives enough state to choose the displayed digit style:

- `initial` for givens.
- `highlight` for matching-number emphasis.
- `conflict` for wrong-entry or clash states.

No new board state is required. Hints currently write `number: cell.solution` to the editable cell, clear notes, and enter history; they should therefore share the same editable pending style as typed entries.

## UI Behavior

Normal editable filled cells use `text-amber-600`. This is the default player-fill signal and does not imply correctness.

Givens keep the current strong neutral text. Red conflict/wrong-entry styling remains the highest-priority digit color for editable cells. Matching-number highlighting should not turn editable digits green; the matching state is already visible through the cell background.

## Testing

Add or update component coverage around `GridCellNumber` so tests assert:

- Editable non-highlighted, non-conflicting numbers use `text-amber-600`.
- Editable matching-number highlights keep the same pending digit class.
- Editable conflict/wrong-entry numbers use the red class.
- Given numbers keep the neutral given class.

Run the focused component test first and watch it fail before changing production code. After implementation, run the relevant baseline checks: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, and `pnpm build`.
