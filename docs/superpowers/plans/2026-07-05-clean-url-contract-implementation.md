# Clean URL Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement compact built-in Sudoku URLs while preserving legacy and exact-puzzle payload links.

**Architecture:** Add a focused route-contract helper for parsing, normalizing, and building game route search params. Keep `useGameRouteSync` responsible for applying resolved puzzle intents to game state, but move URL naming and compatibility rules out of the hook. Update navigation call sites and tests so normal built-in flows use `collection` and `puzzle`, while legacy full-payload URLs remain covered.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Router, Vitest, Playwright, pnpm 11.9.0.

## Global Constraints

- Use `pnpm` commands only.
- Normal built-in puzzle links use `/#/?collection=<id>&puzzle=<1-basedIndex>`.
- Do not write the full `sudoku` parameter during ordinary built-in puzzle selection, next-puzzle navigation, active-game route replacement, or progress saves.
- Preserve existing full-code URL support for backwards compatibility and exact-puzzle links.
- Preserve old `sudokuIndex` and `sudokuCollectionName` query names as readable legacy aliases.
- Keep mutable game progress, timer state, notes, pause state, active ownership, preferences, and collections in localStorage, not in the URL.
- Do not add a visible Share button in this issue.
- Do not change the saved-game schema for issue #28.
- Do not change the strict one-playable-window active-game lock behavior from issue #29.

---

## File Structure

- Create `src/pages/Game/gameRouteContract.ts`: owns game URL parsing, compatibility aliases, compact/payload search builders, and search-key comparison helpers.
- Create `src/pages/Game/gameRouteContract.test.ts`: unit coverage for route intent parsing and search param builders.
- Modify `src/lib/game/sudokus.ts`: expose a pure `getCollection(collectionId)` helper that `useSudokuCollections` and route sync can share.
- Modify `src/pages/Game/useGameRouteSync.ts`: consume route intents, resolve collection/index puzzles, normalize legacy URLs, and stop writing payload URLs for known collection/index puzzles.
- Modify `src/pages/Game/GameSelect.tsx`: navigate with compact search params.
- Modify `src/pages/Game/GameCompletionPanel.tsx`: navigate with compact search params.
- Modify `e2e/sudoku.e2e.ts`, `e2e/completion-screen.e2e.ts`, and `e2e/select-game.e2e.ts`: update normal helpers to compact URLs and add legacy/payload compatibility coverage.

### Task 1: Route Contract Helper

**Files:**
- Create: `src/pages/Game/gameRouteContract.ts`
- Create: `src/pages/Game/gameRouteContract.test.ts`

**Interfaces:**
- Produces:
  - `type GameRouteSearch = {collection?: string; puzzle?: number; sudoku?: string; restart?: string}`
  - `type GameRouteIntent = {kind: "none"; forceRestart: boolean} | {kind: "invalid"; forceRestart: boolean} | {kind: "collection"; collectionId: string; puzzleNumber: number; forceRestart: boolean} | {kind: "payload"; sudoku: string; collectionId: string; puzzleNumber: number; hasPuzzleMetadata: boolean; forceRestart: boolean}`
  - `parseGameRouteIntent(search: Record<string, unknown>, rawSearch?: string): GameRouteIntent`
  - `createGameRouteSearchKey(search: GameRouteSearch): string`
  - `createCompactGameSearch(collectionId: string, puzzleNumber: number, restart?: boolean): GameRouteSearch`
  - `createPayloadGameSearch(sudoku: string, collectionId: string, puzzleNumber: number, restart?: boolean): GameRouteSearch`
  - `createGameRouteSudokuKey(params: {collectionId: string; puzzleNumber: number; sudoku: string}): string`

- [x] **Step 1: Write failing unit tests**

Create `src/pages/Game/gameRouteContract.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {
  createCompactGameSearch,
  createGameRouteSearchKey,
  createGameRouteSudokuKey,
  createPayloadGameSearch,
  parseGameRouteIntent,
} from "./gameRouteContract";

describe("game route contract", () => {
  it("parses an empty route as no explicit puzzle", () => {
    expect(parseGameRouteIntent({})).toEqual({kind: "none", forceRestart: false});
  });

  it("parses compact collection and puzzle params", () => {
    expect(parseGameRouteIntent({collection: "easy", puzzle: 2})).toEqual({
      kind: "collection",
      collectionId: "easy",
      puzzleNumber: 2,
      forceRestart: false,
    });
  });

  it("parses legacy collection and puzzle aliases", () => {
    expect(parseGameRouteIntent({sudokuCollectionName: "medium", sudokuIndex: "3"})).toEqual({
      kind: "collection",
      collectionId: "medium",
      puzzleNumber: 3,
      forceRestart: false,
    });
  });

  it("parses full payload params with metadata", () => {
    expect(parseGameRouteIntent({collection: "easy", puzzle: "1", sudoku: "123", restart: "1"})).toEqual({
      kind: "payload",
      sudoku: "123",
      collectionId: "easy",
      puzzleNumber: 1,
      hasPuzzleMetadata: true,
      forceRestart: true,
    });
  });

  it("parses full payload params without metadata as an exact custom puzzle", () => {
    expect(parseGameRouteIntent({sudoku: "123"})).toEqual({
      kind: "payload",
      sudoku: "123",
      collectionId: "custom",
      puzzleNumber: 1,
      hasPuzzleMetadata: false,
      forceRestart: false,
    });
  });

  it("treats incomplete compact params as invalid", () => {
    expect(parseGameRouteIntent({collection: "easy"})).toEqual({kind: "invalid", forceRestart: false});
    expect(parseGameRouteIntent({puzzle: 1})).toEqual({kind: "invalid", forceRestart: false});
    expect(parseGameRouteIntent({collection: "easy", puzzle: 0})).toEqual({kind: "invalid", forceRestart: false});
  });

  it("prefers raw hash/search values and strips tanstack wrapping quotes", () => {
    expect(parseGameRouteIntent({}, 'collection=%22easy%22&puzzle=4')).toEqual({
      kind: "collection",
      collectionId: "easy",
      puzzleNumber: 4,
      forceRestart: false,
    });
  });

  it("builds compact search without sudoku payload", () => {
    expect(createCompactGameSearch("easy", 1)).toEqual({collection: "easy", puzzle: 1});
    expect(createCompactGameSearch("easy", 1, true)).toEqual({collection: "easy", puzzle: 1, restart: "1"});
  });

  it("builds payload search with exact sudoku data", () => {
    expect(createPayloadGameSearch("123", "custom", 1)).toEqual({sudoku: "123", collection: "custom", puzzle: 1});
  });

  it("creates stable search and sudoku keys", () => {
    expect(createGameRouteSearchKey({puzzle: 1, collection: "easy"})).toBe(
      createGameRouteSearchKey({collection: "easy", puzzle: 1}),
    );
    expect(createGameRouteSudokuKey({collectionId: "easy", puzzleNumber: 1, sudoku: "123"})).toBe(
      JSON.stringify(["easy", 1, "123"]),
    );
  });
});
```

- [x] **Step 2: Run the new unit tests and verify they fail**

Run: `pnpm test -- src/pages/Game/gameRouteContract.test.ts`

Expected: FAIL with an import resolution error for `./gameRouteContract`.

- [x] **Step 3: Implement the helper**

Create `src/pages/Game/gameRouteContract.ts` with the exported types and functions named above. The implementation must:

- Read `collection` before legacy `sudokuCollectionName`.
- Read `puzzle` before legacy `sudokuIndex`.
- Accept positive safe-integer puzzle numbers only.
- Treat `restart=1`, `restart=true`, and `restart=yes` as force restart.
- Use `"custom"` and `1` as exact-payload fallback metadata.
- Sort search keys in `createGameRouteSearchKey()`.

- [x] **Step 4: Run the helper tests and verify they pass**

Run: `pnpm test -- src/pages/Game/gameRouteContract.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/pages/Game/gameRouteContract.ts src/pages/Game/gameRouteContract.test.ts
git commit -m "feat: add game route contract helper"
```

### Task 2: Route Sync And Navigation

**Files:**
- Modify: `src/lib/game/sudokus.ts`
- Modify: `src/pages/Game/useGameRouteSync.ts`
- Modify: `src/pages/Game/GameSelect.tsx`
- Modify: `src/pages/Game/GameCompletionPanel.tsx`

**Interfaces:**
- Consumes Task 1 helper exports.
- Produces compact normal navigation and route replacement for known collection/index puzzles.

- [x] **Step 1: Write focused failing route-sync tests where possible**

Extend `src/pages/Game/gameRouteContract.test.ts` with tests for known collection payload normalization decisions:

```ts
import {shouldUseCompactGameSearch} from "./gameRouteContract";

it("uses compact search when collection puzzle metadata matches the payload", () => {
  expect(shouldUseCompactGameSearch({sudoku: "123", collectionSudoku: "123", hasPuzzleMetadata: true})).toBe(true);
});

it("keeps payload search when collection puzzle metadata does not match the payload", () => {
  expect(shouldUseCompactGameSearch({sudoku: "123", collectionSudoku: "456", hasPuzzleMetadata: true})).toBe(false);
  expect(shouldUseCompactGameSearch({sudoku: "123", collectionSudoku: undefined, hasPuzzleMetadata: false})).toBe(false);
});
```

Run: `pnpm test -- src/pages/Game/gameRouteContract.test.ts`

Expected: FAIL because `shouldUseCompactGameSearch` is not exported yet.

- [x] **Step 2: Add `shouldUseCompactGameSearch`**

Update `src/pages/Game/gameRouteContract.ts`:

```ts
export function shouldUseCompactGameSearch({
  sudoku,
  collectionSudoku,
  hasPuzzleMetadata,
}: {
  sudoku: string;
  collectionSudoku: string | undefined;
  hasPuzzleMetadata: boolean;
}) {
  return hasPuzzleMetadata && collectionSudoku === sudoku;
}
```

- [x] **Step 3: Share collection lookup**

Update `src/lib/game/sudokus.ts` to export:

```ts
export function getCollection(collectionId: string) {
  if (isBaseCollectionId(collectionId)) {
    return {
      id: collectionId,
      name: collectionId,
      sudokusRaw: BASE_SUDOKU_COLLECTIONS[collectionId as BaseCollection],
    };
  }
  return appPersistence.collections.load(collectionId);
}
```

Then update `useSudokuCollections()` so its `getCollection` callback delegates to this exported function.

- [x] **Step 4: Update selection and completion navigation**

In `GameSelect`, replace the normal `nextSearch` shape with `createCompactGameSearch(sudokuCollectionName, index + 1, Boolean(finished))` and remove the no-longer-needed `stringifySudoku` import for navigation payloads.

In `GameCompletionPanel`, change `NextSudokuParams` to `{collection: string; puzzle: number}`, stop stringifying the next Sudoku in `useNextSudoku`, and navigate with compact params.

- [x] **Step 5: Update `useGameRouteSync`**

Update `useGameRouteSync` to:

- Parse route intent with `parseGameRouteIntent`.
- Resolve compact collection/index intents through `getCollection()` and `getSudokusPaginated(collection, puzzleNumber - 1, 1)`.
- Resolve payload intents by parsing and solving `intent.sudoku`.
- Show the existing invalid URL alert and restore the current game route for invalid intents or failed collection lookup.
- Replace legacy full payload links with compact search when metadata matches the resolved collection puzzle.
- Keep exact payload search when metadata is absent or mismatched.
- Build normal route replacement through `createCompactGameSearch()` when current game metadata still resolves to the current puzzle key.
- Fall back to `createPayloadGameSearch()` when the current game cannot be represented by collection/index.

- [x] **Step 6: Run unit tests**

Run: `pnpm test -- src/pages/Game/gameRouteContract.test.ts src/lib/game/SudokuGame.test.ts`

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/lib/game/sudokus.ts src/pages/Game/useGameRouteSync.ts src/pages/Game/GameSelect.tsx src/pages/Game/GameCompletionPanel.tsx src/pages/Game/gameRouteContract.ts src/pages/Game/gameRouteContract.test.ts
git commit -m "feat: use compact game URLs"
```

### Task 3: E2E Coverage And Compatibility

**Files:**
- Modify: `e2e/sudoku.e2e.ts`
- Modify: `e2e/completion-screen.e2e.ts`
- Modify: `e2e/select-game.e2e.ts`

**Interfaces:**
- Consumes compact URL route behavior from Task 2.
- Produces Playwright coverage for normal compact URLs, legacy URLs, exact payload links, and active-game locking.

- [x] **Step 1: Update e2e URL helpers**

In normal `gameUrl()` helpers, build `/#/?collection=<collection>&puzzle=<index>` by default. Add a separate `legacyGameUrl()` helper where full payload links are still required.

- [x] **Step 2: Update search assertions**

Update normal `expectGameSearch()` helpers to assert:

```ts
{
  collection: expectedCollection,
  puzzle: String(expectedPuzzle),
  sudoku: null,
  sudokuCollectionName: null,
  sudokuIndex: null,
}
```

Add a payload-specific assertion helper for exact-puzzle URLs.

- [x] **Step 3: Add compatibility tests**

Add Playwright coverage in `e2e/sudoku.e2e.ts`:

- Legacy `sudokuIndex` + `sudokuCollectionName` + `sudoku` URL loads and normalizes to compact params.
- Exact payload URL without metadata loads and keeps `sudoku`.
- Compact route still works with multi-tab active-game locking.

- [x] **Step 4: Run targeted Playwright specs**

Run: `pnpm exec playwright test e2e/sudoku.e2e.ts e2e/completion-screen.e2e.ts e2e/select-game.e2e.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add e2e/sudoku.e2e.ts e2e/completion-screen.e2e.ts e2e/select-game.e2e.ts
git commit -m "test: cover compact game URLs"
```

### Task 4: Final Verification And Issue Closeout

**Files:**
- Modify if needed: `docs/superpowers/plans/2026-07-05-clean-url-contract-implementation.md`
- Modify if needed: `AGENTS.md`

**Interfaces:**
- Consumes implementation from Tasks 1-3.
- Produces verified implementation and GitHub issue closeout comment.

- [x] **Step 1: Run full verification**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm build
pnpm run test:e2e
```

Expected: all commands pass.

- [x] **Step 2: Create follow-up issue for Share action**

Created follow-up issue: https://github.com/slpixe/sudoku/issues/36

Run:

```bash
gh issue create --title "Add explicit share URL action for exact puzzle links" --body "Follow-up from #35.\n\nThe clean URL contract keeps normal built-in puzzle URLs compact and preserves full sudoku payload URLs for backwards compatibility and explicit exact-puzzle links. A visible Share action is intentionally out of scope for #35.\n\nSuggested scope:\n- Add a user-facing Share action where it fits the game UI.\n- Generate an exact puzzle URL with the full sudoku payload for portable links.\n- Prefer compact collection/puzzle URLs when sharing built-in puzzles if exact payload is not needed.\n- Cover clipboard/share behavior with tests where practical.\n\nAcceptance criteria:\n- Users can intentionally create a share URL.\n- Normal navigation still omits the full sudoku payload.\n- Exact-puzzle sharing works for puzzles that are not available in the recipient's local collections."
```

Expected: GitHub CLI prints the new issue URL.

- [x] **Step 3: Comment on and close issue #35**

Run:

```bash
gh issue comment 35 --body "Implemented clean game URL contract.\n\nSummary:\n- Added compact normal puzzle URLs using collection and puzzle params.\n- Preserved legacy full sudoku payload URLs and normalized known built-in payload links to compact params.\n- Kept exact payload URLs for custom/external puzzle links.\n- Updated route sync, selection, completion, and e2e coverage.\n\nChecks run:\n- pnpm run typecheck\n- pnpm run lint\n- pnpm test\n- pnpm build\n- pnpm run test:e2e"
gh issue close 35
```

Expected: GitHub CLI prints the comment URL and closes the issue.
