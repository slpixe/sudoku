# Active Game Lock Design

## Context

Issue: https://github.com/slpixe/sudoku/issues/29

The app stores durable per-puzzle progress under `sudoku-played-<sudokuKey>`, but the currently active puzzle is tracked through one global `localStorage` key, `sudoku-currently-playing-sudoku`. That global pointer can be overwritten by another browser tab or installed PWA window. On reload, a tab can then unexpectedly open the puzzle claimed by another window.

The product rule for this issue is stricter than per-tab reload stability: one browser profile should have only one active playable puzzle at a time.

## Goals

- Enforce a strict single active puzzle across tabs and PWA windows that share the same browser storage.
- Preserve existing per-puzzle progress storage.
- Prevent inactive tabs from continuing play, saving edits, or advancing timers.
- Hide the puzzle board contents when a tab loses ownership, matching the paused-board concealment behavior.
- Let the user either switch to the active puzzle or reclaim the current tab's puzzle.
- Cover the cross-tab behavior with automated tests or documented manual checks.

## Non-Goals

- Do not introduce server-side sync or cross-device locking.
- Do not rewrite the saved game schema beyond the current active-game pointer.
- Do not add `BroadcastChannel` unless storage events prove insufficient.
- Do not change puzzle selection, completion, or restart behavior except where needed to claim active ownership.

## Chosen Approach

Use a structured active-game record in `localStorage`, plus `storage` events for cross-tab coordination.

Each tab/window receives a stable owner id stored in `sessionStorage`. The shared active-game record is written to `localStorage` when a tab starts, resumes, or explicitly reclaims a puzzle.

```ts
type ActiveGameRecord = {
  sudokuKey: string;
  ownerId: string;
  updatedAt: number;
};
```

The record should continue to use the existing `sudoku-currently-playing-sudoku` storage key so the scope remains tied to the current bug. Existing plain-string values are treated as legacy active puzzle keys and migrated when the next claim is written.

## Architecture

Add an active-game persistence layer near `playedSudokus`.

Responsibilities:

- Create or read this tab's session owner id.
- Parse the active-game record from `localStorage`.
- Accept legacy plain-string active values as `{sudokuKey}` data.
- Ignore malformed active records without crashing.
- Claim a puzzle by writing `{sudokuKey, ownerId, updatedAt}`.
- Expose the active-game storage key for event filtering.

Add a focused game hook named `useActiveGameLock`, connected from the game route management layer.

Responsibilities:

- Know the current tab owner id.
- Know the current rendered puzzle key.
- Claim the puzzle when the tab starts or resumes it.
- Listen for `storage` events from other tabs.
- Enter locked state when another owner claims a different puzzle.
- Expose `switchToActivePuzzle()` and `resumeThisPuzzleHere()` actions to the UI.

Keep durable progress in `sudoku-played-<sudokuKey>`. The active-game record is only an ownership pointer.

## User Flow

When tab A is playing puzzle 1 and tab B starts or resumes puzzle 2:

1. Tab B saves or loads puzzle 2 as normal.
2. Tab B claims puzzle 2 by writing the active-game record with tab B's owner id.
3. Tab A receives the `storage` event.
4. If tab A is showing puzzle 1, tab A pauses and enters locked state.
5. Tab A hides puzzle contents by rendering the same blank board used for paused games.
6. Tab A shows a lock overlay with two actions:
   - Primary: Switch to active puzzle.
   - Secondary: Resume this puzzle here.

Switching to the active puzzle loads the active puzzle's stored state, updates the route, and claims that puzzle for the current tab.

Resuming this puzzle here writes a new active-game record for the current tab's puzzle and owner id. Other tabs then lock if they are showing a different puzzle.

## Initial Load Behavior

- If the URL identifies a puzzle, load that puzzle and claim it after route synchronization succeeds.
- If the URL does not identify a puzzle, load the active-game record's puzzle.
- If the active-game record is missing, legacy-invalid, or points to missing/corrupt progress, fall back to the current default start puzzle behavior.
- If `sudoku-currently-playing-sudoku` contains a legacy plain string, use it as the active puzzle key and migrate to the structured record on the next claim.

## Locked State Rules

- A tab locks only when another owner claims a different puzzle.
- A tab does not lock merely because another owner claims the same puzzle.
- While locked, the board contents are concealed with the paused blank-board presentation.
- While locked, board input, keypad input, timer updates, and throttled progress saves are disabled.
- The existing paused overlay remains for normal pause state.
- A separate lock overlay appears for ownership loss and contains both lock recovery actions.
- Won games should not be reactivated by lock recovery in a way that bypasses existing finished-puzzle restart rules.

## Error Handling

- Malformed active-game records should be ignored with a warning and should not crash the app.
- Missing or corrupt per-puzzle progress for the active key should fall back to default startup behavior.
- `localStorage` or `sessionStorage` unavailability should degrade to the current single-tab behavior without throwing.
- Save failures should keep the existing console-warning/error pattern and should not leave the UI in a locked state caused by this tab's own failed claim.

## Testing

Unit tests:

- Parse a valid active-game record.
- Parse a legacy plain-string active puzzle key.
- Ignore malformed active records.
- Claim writes a structured active-game record with an owner id and timestamp.
- Missing storage APIs return safe defaults.

Integration or hook-level tests where practical:

- Same puzzle claimed by another owner does not lock the tab.
- Different puzzle claimed by another owner locks the tab.
- `resumeThisPuzzleHere()` reclaims ownership.
- `switchToActivePuzzle()` loads the active puzzle and clears locked state.

Playwright e2e:

- Use two pages in the same browser context.
- Page A opens puzzle 1.
- Page B opens puzzle 2.
- Page A locks, hides the puzzle board contents, and shows the lock overlay.
- Page A can switch to puzzle 2.
- Page A can reclaim puzzle 1, and page B then locks.

Verification commands:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm build`
- `pnpm run test:e2e`

## Acceptance Criteria

- Opening two tabs or PWA windows on different puzzles does not allow both puzzles to remain playable.
- A tab that loses ownership stops interaction and timer progress.
- A locked tab hides puzzle contents rather than displaying the old puzzle.
- A locked tab can switch to the active puzzle or reclaim its own puzzle.
- Reloading a tab does not unexpectedly switch to another puzzle unless the user chooses the active-puzzle action or the URL intentionally identifies that puzzle.
- Behavior is covered by tests or documented manual checks.
