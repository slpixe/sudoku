# Clean URL Contract Design

## Context

Issue: https://github.com/slpixe/sudoku/issues/35

The game route currently writes `sudokuIndex`, `sudokuCollectionName`, and the full 81-character `sudoku` puzzle string into normal game URLs. That made sense when the URL was the strongest game identity, but the app now has clearer persistence boundaries:

- Durable per-puzzle progress is stored in `localStorage` under `sudoku-played-<sudokuKey>`.
- Active playable ownership is stored under `sudoku-currently-playing-sudoku` with a per-tab owner id.
- The game provider already restores the active game from storage when the route does not identify another puzzle.

Normal app navigation does not need to expose the full puzzle payload. The URL identifies intentional puzzle navigation, while mutable game progress remains storage state.

## Decision

Use clean built-in puzzle URLs plus legacy and share-payload support.

Normal built-in puzzle links use collection and 1-based puzzle index only:

```text
/#/?collection=easy&puzzle=1
```

Full puzzle payload URLs remain supported for backwards compatibility and explicit exact-puzzle links:

```text
/#/?sudoku=534920700060007309900000010008700000496803002721594806000200940800046100003000000&collection=easy&puzzle=1
```

The full `sudoku` parameter is not written during ordinary built-in puzzle selection, next-puzzle navigation, active-game route replacement, or progress saves.

## Goals

- Make ordinary app URLs shorter and easier to inspect.
- Keep direct links to built-in puzzles.
- Preserve existing full-code links.
- Keep reload, PWA launch, browser history, and multi-window behavior aligned with the active-game lock model.
- Avoid coupling mutable game progress to the URL.
- Leave room for an explicit share action that can generate an exact-puzzle payload URL later.

## Non-Goals

- Do not add a visible Share button in this issue.
- Do not remove support for old `sudokuIndex` and `sudokuCollectionName` query names.
- Do not change the saved-game schema; that belongs to issue #28.
- Do not change the strict one-playable-window active-game lock behavior from issue #29.
- Do not add server-side IDs, cloud sync, or cross-device sharing.

## URL Contract

### No Puzzle Params

`/#/` loads the active game from localStorage. If no active game exists, or the active pointer cannot load a valid saved puzzle, it falls back to the default start puzzle.

This is the PWA launch and normal reload fallback.

### Built-In Puzzle Params

`/#/?collection=<baseCollectionId>&puzzle=<1-basedIndex>` loads that built-in puzzle.

Valid base collection ids are the current base collection ids: `easy`, `medium`, `hard`, `expert`, and `evil`.

Behavior:

- Resolve the puzzle from bundled collection data by 1-based index.
- If saved progress exists for the resolved puzzle key and the link is not a forced restart, load that saved progress.
- If no saved progress exists, start a fresh game for that built-in puzzle.
- After route sync, keep or replace the URL in the compact shape.

### Custom Local Collection Params

`/#/?collection=<customCollectionId>&puzzle=<1-basedIndex>` loads a puzzle from a custom collection only when that collection exists in the current browser profile.

Behavior:

- Resolve the collection through the existing collection repository.
- If the collection or index is missing, show the existing invalid-sudoku URL dialog and restore the current game route.
- Do not put the full puzzle string into normal custom-collection navigation.

This means custom collection links are local-profile links, not portable share links.

### Full Puzzle Payload Params

`/#/?sudoku=<81-charPuzzle>` loads the exact puzzle payload after parsing and solving it.

Optional metadata may be present:

- `collection=<id>`
- `puzzle=<1-basedIndex>`
- legacy `sudokuCollectionName=<id>`
- legacy `sudokuIndex=<1-basedIndex>`
- `restart=1`

Behavior:

- Parse and solve the `sudoku` payload as the source of truth.
- Use collection and puzzle metadata for labels, saved progress lookup context, and possible normalization, but do not trust metadata over the payload.
- If the payload matches the puzzle at a known collection/index, replace the route with the compact URL.
- If the payload does not match a known collection/index, preserve the full `sudoku` payload in the URL because it is the only portable identity for that puzzle.

### Legacy Params

Existing URLs with:

```text
/#/?sudokuIndex=1&sudokuCollectionName=easy&sudoku=<81-charPuzzle>
```

continue to load.

Normalization rules:

- Treat `sudokuCollectionName` as `collection`.
- Treat `sudokuIndex` as `puzzle`.
- If the payload matches the resolved collection/index, replace to `collection` and `puzzle`.
- If the payload does not match, keep the payload URL and prefer the payload for the playable board.

## Storage Contract

Mutable state stays out of the route:

- Current cell values, notes, timer, won state, previous solve times, and pause state stay in `sudoku-played-<sudokuKey>`.
- The active playable puzzle and tab owner stay in `sudoku-currently-playing-sudoku`.
- User preferences and collections stay in their existing localStorage repositories.

The URL identifies which puzzle to open. It does not serialize progress.

## Multi-Window Behavior

The active-game lock remains authoritative.

- Opening a compact built-in URL claims that puzzle after route sync succeeds.
- Opening a full payload URL claims the payload puzzle after validation succeeds.
- Opening `/#/` without puzzle params loads the active stored puzzle for this profile.
- If another tab claims any puzzle, older tabs lock according to the existing owner-id rule, even when the puzzle key is the same.
- A locked tab's recovery actions continue to use stored puzzle keys, then route replacement uses the cleanest available URL for the loaded puzzle.

## Error Handling

- Invalid `collection` or `puzzle` params show the existing invalid URL dialog and restore the current game route.
- Invalid `sudoku` payloads keep the existing invalid URL dialog and restore the current game route.
- Custom collection links that cannot resolve in this browser profile are invalid local links, not exact share links.
- If compact route replacement fails for any reason, the game remains playable after route sync.

## Implementation Shape

Add a small route-contract helper instead of expanding `useGameRouteSync`.

Route-contract helper responsibilities:

- Read current and legacy query names.
- Normalize route params into one internal route intent:
  - no explicit puzzle
  - collection/index puzzle
  - exact payload puzzle
- Resolve collection/index intents through existing collection APIs.
- Decide whether a resolved puzzle can be represented by a compact URL.
- Build replacement search params.

Update current call sites:

- `GameSelect` navigates with `collection` and `puzzle` for normal puzzle selection.
- `GameCompletionPanel` navigates with `collection` and `puzzle` for next puzzle.
- `useGameRouteSync` consumes normalized route intents and stops writing full puzzle payloads for known collection/index puzzles.
- Tests use compact URLs for normal built-in flows and keep dedicated coverage for legacy full-payload URLs.

## Testing

Unit tests:

- Parse no-params route intent.
- Parse compact collection/index route intent.
- Parse legacy `sudokuIndex` and `sudokuCollectionName` route intent.
- Parse full payload route intent.
- Build compact replacement params for known collection/index puzzles.
- Preserve full payload params when no collection/index match exists.

Playwright e2e:

- Selecting a built-in puzzle writes `collection=<id>&puzzle=<index>` and omits `sudoku`.
- Completion "next puzzle" writes compact params.
- Legacy full payload URL still loads.
- Legacy full payload URL that matches a built-in puzzle normalizes to compact params.
- Full payload URL for an external/custom puzzle remains loadable.
- Multi-tab active-game lock still works after compact URL navigation.

Verification commands:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm build`
- `pnpm run test:e2e`

## Follow-Up Issues

Create follow-up implementation issues if the change is split:

- Implement compact built-in route contract and legacy normalization.
- Add explicit Share action for exact puzzle URLs, if product scope is desired.
- Coordinate saved-game schema changes with issue #28 if future route metadata needs persisted origin data.
