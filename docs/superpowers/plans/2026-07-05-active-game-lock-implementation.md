# Active Game Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce one active playable Sudoku puzzle per browser profile by locking older tabs when another tab claims a different puzzle.

**Architecture:** Add a focused active-game persistence module for tab ownership and active puzzle metadata. Wire the existing game route/persistence flow to claim ownership after route synchronization, listen for `storage` events, and render a concealed locked state with switch/reclaim actions.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Router, Tailwind, Vitest, Playwright, pnpm 11.9.0.

## Global Constraints

- Use `pnpm` commands only.
- Keep durable per-puzzle progress in `sudoku-played-<sudokuKey>`.
- Store active ownership metadata under the existing `sudoku-currently-playing-sudoku` key.
- Use `sessionStorage` for the per-tab owner id and degrade safely if storage APIs are unavailable.
- Use `localStorage` `storage` events for cross-tab coordination.
- Hide locked puzzle contents with the existing paused blank-board presentation.
- Do not add `BroadcastChannel`, server sync, or cross-device locking.
- Preserve current behavior unless a change is required for strict active-game locking.

---

## File Structure

- Create `src/lib/database/activeGame.ts`: owns active-game parsing, tab owner ids, active-game claiming, and storage key constants.
- Create `src/lib/database/activeGame.test.ts`: unit coverage for active-game parsing, claiming, malformed data, and storage fallback.
- Modify `src/lib/database/playedSudokus.ts`: stop progress saves from rewriting active ownership; delegate current-key compatibility methods to the active-game module.
- Modify `src/lib/database/playedSudokus.test.ts`: cover the changed save/current-key behavior.
- Modify `src/lib/persistence/appPersistence.ts`: expose an `activeGame` persistence namespace and load current games through the active-game record.
- Modify `src/pages/Game/useGameRouteSync.ts`: return route initialization state, expose a stored-puzzle opener, and skip automatic saves while locked.
- Create `src/pages/Game/useActiveGameLock.ts`: owns active-game lock state and storage-event handling.
- Create `src/pages/Game/ActiveGameLockOverlay.tsx`: renders the lock overlay and two recovery actions.
- Modify `src/pages/Game.tsx`: connect route sync, lock hook, overlay, disabled controls, hidden board contents, and recovery handlers.
- Modify `src/pages/Game/GameHeader.tsx`: prevent pause/resume and clear actions while locked.
- Modify `src/locales/*.json`: add lock overlay strings.
- Modify `e2e/sudoku.e2e.ts`: add two-page cross-tab ownership coverage.

---

### Task 1: Active Game Persistence Module

**Files:**
- Create: `src/lib/database/activeGame.ts`
- Create: `src/lib/database/activeGame.test.ts`

**Interfaces:**
- Produces:
  - `STORAGE_ACTIVE_GAME_KEY: string`
  - `STORAGE_ACTIVE_GAME_OWNER_KEY: string`
  - `LEGACY_ACTIVE_GAME_OWNER_ID: string`
  - `type ActiveGameRecord = {sudokuKey: string; ownerId: string; updatedAt: number}`
  - `parseActiveGameRecord(text: string | null): ActiveGameRecord | undefined`
  - `getActiveGameOwnerId(): string`
  - `loadActiveGameRecord(): ActiveGameRecord | undefined`
  - `claimActiveGame(sudokuKey: string, ownerId?: string, now?: number): ActiveGameRecord | undefined`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/database/activeGame.test.ts`:

```ts
import {afterEach, describe, expect, it, vi} from "vitest";

import {
  claimActiveGame,
  getActiveGameOwnerId,
  LEGACY_ACTIVE_GAME_OWNER_ID,
  loadActiveGameRecord,
  parseActiveGameRecord,
  STORAGE_ACTIVE_GAME_KEY,
  STORAGE_ACTIVE_GAME_OWNER_KEY,
} from "./activeGame";

function createStorageMock(initialValues: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initialValues));

  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe("active game persistence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("parses a valid structured active game record", () => {
    expect(parseActiveGameRecord(JSON.stringify({sudokuKey: "123", ownerId: "tab-1", updatedAt: 42}))).toEqual({
      sudokuKey: "123",
      ownerId: "tab-1",
      updatedAt: 42,
    });
  });

  it("parses a legacy plain-string active game key", () => {
    expect(parseActiveGameRecord("123456789")).toEqual({
      sudokuKey: "123456789",
      ownerId: LEGACY_ACTIVE_GAME_OWNER_ID,
      updatedAt: 0,
    });
  });

  it("ignores malformed structured records", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(parseActiveGameRecord(JSON.stringify({sudokuKey: "123"}))).toBeUndefined();
    expect(parseActiveGameRecord("{")).toBeUndefined();
  });

  it("creates and reuses a tab owner id in sessionStorage", () => {
    vi.stubGlobal("sessionStorage", createStorageMock());

    const firstOwnerId = getActiveGameOwnerId();
    const secondOwnerId = getActiveGameOwnerId();

    expect(firstOwnerId).toMatch(/^sudoku-tab-/);
    expect(secondOwnerId).toBe(firstOwnerId);
    expect(sessionStorage.getItem(STORAGE_ACTIVE_GAME_OWNER_KEY)).toBe(firstOwnerId);
  });

  it("claims the active game with owner id and timestamp", () => {
    vi.stubGlobal("sessionStorage", createStorageMock({[STORAGE_ACTIVE_GAME_OWNER_KEY]: "tab-1"}));
    vi.stubGlobal("localStorage", createStorageMock());

    expect(claimActiveGame("123", undefined, 1000)).toEqual({
      sudokuKey: "123",
      ownerId: "tab-1",
      updatedAt: 1000,
    });
    expect(loadActiveGameRecord()).toEqual({
      sudokuKey: "123",
      ownerId: "tab-1",
      updatedAt: 1000,
    });
    expect(localStorage.getItem(STORAGE_ACTIVE_GAME_KEY)).toBe(
      JSON.stringify({sudokuKey: "123", ownerId: "tab-1", updatedAt: 1000}),
    );
  });

  it("returns safe defaults when storage APIs are unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("sessionStorage", undefined);

    expect(loadActiveGameRecord()).toBeUndefined();
    expect(claimActiveGame("123", undefined, 1000)).toBeUndefined();
    expect(getActiveGameOwnerId()).toMatch(/^sudoku-tab-/);
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `pnpm test -- src/lib/database/activeGame.test.ts`

Expected: FAIL with an import resolution error for `./activeGame`.

- [ ] **Step 3: Implement active-game persistence**

Create `src/lib/database/activeGame.ts`:

```ts
export const STORAGE_ACTIVE_GAME_KEY = "sudoku-currently-playing-sudoku";
export const STORAGE_ACTIVE_GAME_OWNER_KEY = "sudoku-tab-owner-id";
export const LEGACY_ACTIVE_GAME_OWNER_ID = "legacy-active-game-owner";

export type ActiveGameRecord = {
  sudokuKey: string;
  ownerId: string;
  updatedAt: number;
};

let fallbackOwnerId: string | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isActiveGameRecord(value: unknown): value is ActiveGameRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value.sudokuKey) &&
    isNonEmptyString(value.ownerId) &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}

function createOwnerId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `sudoku-tab-${crypto.randomUUID()}`;
  }

  return `sudoku-tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function parseActiveGameRecord(text: string | null): ActiveGameRecord | undefined {
  if (!text) {
    return undefined;
  }

  if (!text.trim().startsWith("{")) {
    return {
      sudokuKey: text,
      ownerId: LEGACY_ACTIVE_GAME_OWNER_ID,
      updatedAt: 0,
    };
  }

  try {
    const parsed = JSON.parse(text);
    if (isActiveGameRecord(parsed)) {
      return parsed;
    }

    console.warn("Ignoring invalid active sudoku record from localStorage.");
    return undefined;
  } catch (error) {
    console.warn("Failed to parse active sudoku record from localStorage:", error);
    return undefined;
  }
}

export function getActiveGameOwnerId() {
  if (typeof sessionStorage === "undefined") {
    fallbackOwnerId ??= createOwnerId();
    return fallbackOwnerId;
  }

  try {
    const storedOwnerId = sessionStorage.getItem(STORAGE_ACTIVE_GAME_OWNER_KEY);
    if (storedOwnerId) {
      return storedOwnerId;
    }

    const ownerId = createOwnerId();
    sessionStorage.setItem(STORAGE_ACTIVE_GAME_OWNER_KEY, ownerId);
    return ownerId;
  } catch (error) {
    console.warn("Failed to access active sudoku tab owner from sessionStorage:", error);
    fallbackOwnerId ??= createOwnerId();
    return fallbackOwnerId;
  }
}

export function loadActiveGameRecord(): ActiveGameRecord | undefined {
  if (typeof localStorage === "undefined") {
    return undefined;
  }

  try {
    return parseActiveGameRecord(localStorage.getItem(STORAGE_ACTIVE_GAME_KEY));
  } catch (error) {
    console.warn("Failed to load active sudoku record from localStorage:", error);
    return undefined;
  }
}

export function claimActiveGame(
  sudokuKey: string,
  ownerId = getActiveGameOwnerId(),
  now = Date.now(),
): ActiveGameRecord | undefined {
  if (typeof localStorage === "undefined") {
    return undefined;
  }

  const record: ActiveGameRecord = {
    sudokuKey,
    ownerId,
    updatedAt: now,
  };

  try {
    localStorage.setItem(STORAGE_ACTIVE_GAME_KEY, JSON.stringify(record));
    return record;
  } catch (error) {
    console.warn("Failed to claim active sudoku in localStorage:", error);
    return undefined;
  }
}
```

- [ ] **Step 4: Run the active-game unit tests**

Run: `pnpm test -- src/lib/database/activeGame.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/database/activeGame.ts src/lib/database/activeGame.test.ts
git commit -m "feat: add active game persistence"
```

---

### Task 2: Persistence Wiring And Current-Key Compatibility

**Files:**
- Modify: `src/lib/database/playedSudokus.ts`
- Modify: `src/lib/database/playedSudokus.test.ts`
- Modify: `src/lib/persistence/appPersistence.ts`

**Interfaces:**
- Consumes:
  - `claimActiveGame(sudokuKey: string, ownerId?: string, now?: number): ActiveGameRecord | undefined`
  - `loadActiveGameRecord(): ActiveGameRecord | undefined`
  - `getActiveGameOwnerId(): string`
  - `STORAGE_ACTIVE_GAME_KEY: string`
- Produces:
  - `appPersistence.activeGame.ownerId(): string`
  - `appPersistence.activeGame.load(): ActiveGameRecord | undefined`
  - `appPersistence.activeGame.claim(sudokuKey: string): ActiveGameRecord | undefined`
  - `appPersistence.activeGame.storageKey: string`

- [ ] **Step 1: Write failing compatibility tests**

Append these tests to `src/lib/database/playedSudokus.test.ts`:

```ts
  it("does not claim active ownership when saving per-puzzle progress", () => {
    vi.stubGlobal("localStorage", createLocalStorageMock());

    localStoragePlayedSudokuRepository.saveSudokuState(INITIAL_GAME_STATE, INITIAL_SUDOKU_STATE);

    expect(localStorage.getItem("sudoku-currently-playing-sudoku")).toBeNull();
    expect(localStoragePlayedSudokuRepository.getSudokuState(sudokuKey)).toEqual({
      game: INITIAL_GAME_STATE,
      sudoku: INITIAL_SUDOKU_STATE.current,
    });
  });

  it("delegates current sudoku key compatibility methods to the active-game record", () => {
    vi.stubGlobal("sessionStorage", createLocalStorageMock({"sudoku-tab-owner-id": "tab-1"}));
    vi.stubGlobal("localStorage", createLocalStorageMock());

    localStoragePlayedSudokuRepository.saveCurrentSudokuKey(sudokuKey);

    expect(localStoragePlayedSudokuRepository.getCurrentSudokuKey()).toBe(sudokuKey);
    expect(JSON.parse(localStorage.getItem("sudoku-currently-playing-sudoku") ?? "{}")).toMatchObject({
      sudokuKey,
      ownerId: "tab-1",
    });
  });
```

- [ ] **Step 2: Run the compatibility tests to verify they fail**

Run: `pnpm test -- src/lib/database/playedSudokus.test.ts`

Expected: FAIL because `saveSudokuState` still writes the current-game key as a plain string.

- [ ] **Step 3: Update `playedSudokus.ts`**

Modify the imports at the top of `src/lib/database/playedSudokus.ts`:

```ts
import {claimActiveGame, loadActiveGameRecord} from "src/lib/database/activeGame";
```

Remove the local active key constant:

```ts
const STORAGE_CURRENTLY_PLAYING_SUDOKU_KEY = "sudoku-currently-playing-sudoku";
```

In `saveCurrentSudokuToLocalStorage`, replace the body after `localStorage.setItem(sudokuKey, JSON.stringify({game, sudoku: sudoku.current}));` with no active-key write:

```ts
    localStorage.setItem(sudokuKey, JSON.stringify({game, sudoku: sudoku.current}));
```

Update `getCurrentSudokuFromStorage()`:

```ts
export function getCurrentSudokuFromStorage(): StoredPlayedSudokuState | undefined {
  const activeGame = loadActiveGameRecord();
  return activeGame ? getSudokuFromStorage(activeGame.sudokuKey) : undefined;
}
```

Update `getCurrentSudokuKey()`:

```ts
  getCurrentSudokuKey(): string | null {
    return loadActiveGameRecord()?.sudokuKey ?? null;
  },
```

Update `saveCurrentSudokuKey()`:

```ts
  saveCurrentSudokuKey(sudokuKey: string): void {
    claimActiveGame(sudokuKey);
  },
```

- [ ] **Step 4: Update app persistence**

Modify imports in `src/lib/persistence/appPersistence.ts`:

```ts
import type {ActiveGameRecord} from "src/lib/database/activeGame";
import {
  claimActiveGame,
  getActiveGameOwnerId,
  loadActiveGameRecord,
  STORAGE_ACTIVE_GAME_KEY,
} from "src/lib/database/activeGame";
```

Add this namespace to `AppPersistence`:

```ts
  activeGame: {
    storageKey: string;
    ownerId(): string;
    load(): ActiveGameRecord | undefined;
    claim(sudokuKey: string): ActiveGameRecord | undefined;
  };
```

Change `currentGame.load()`:

```ts
    load(): StoredPlayedSudokuState | undefined {
      const activeGame = loadActiveGameRecord();
      return activeGame ? localStoragePlayedSudokuRepository.getSudokuState(activeGame.sudokuKey) : undefined;
    },
```

Add the runtime implementation before `appearance`:

```ts
  activeGame: {
    storageKey: STORAGE_ACTIVE_GAME_KEY,
    ownerId(): string {
      return getActiveGameOwnerId();
    },
    load(): ActiveGameRecord | undefined {
      return loadActiveGameRecord();
    },
    claim(sudokuKey: string): ActiveGameRecord | undefined {
      return claimActiveGame(sudokuKey);
    },
  },
```

- [ ] **Step 5: Run persistence tests**

Run: `pnpm test -- src/lib/database/activeGame.test.ts src/lib/database/playedSudokus.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/lib/database/playedSudokus.ts src/lib/database/playedSudokus.test.ts src/lib/persistence/appPersistence.ts
git commit -m "refactor: separate active game ownership from progress saves"
```

---

### Task 3: Route Sync And Active Lock Hook

**Files:**
- Modify: `src/pages/Game/useGameRouteSync.ts`
- Create: `src/pages/Game/useActiveGameLock.ts`

**Interfaces:**
- Consumes:
  - `appPersistence.activeGame.storageKey`
  - `appPersistence.activeGame.ownerId()`
  - `appPersistence.activeGame.claim(sudokuKey)`
  - `appPersistence.activeGame.load()`
- Produces from `useGameRouteSync`:
  - `{initialized: boolean; openStoredSudoku(sudokuKey: string): boolean}`
- Produces from `useActiveGameLock`:
  - `shouldLockForActiveGame(activeGame: ActiveGameRecord | undefined, ownerId: string, currentSudokuKey: string): boolean`
  - `{locked: boolean; activeSudokuKey?: string; resumeThisPuzzleHere(): void; clearLock(): void}`

- [ ] **Step 1: Write failing lock-decision tests**

Create `src/pages/Game/useActiveGameLock.test.ts`:

```ts
import {afterEach, describe, expect, it, vi} from "vitest";

import {shouldLockForActiveGame} from "./useActiveGameLock";

describe("useActiveGameLock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("locks when another owner claims a different puzzle", () => {
    expect(
      shouldLockForActiveGame({sudokuKey: "puzzle-b", ownerId: "owner-b", updatedAt: 1}, "owner-a", "puzzle-a"),
    ).toBe(true);
  });

  it("does not lock when another owner claims the same puzzle", () => {
    expect(
      shouldLockForActiveGame({sudokuKey: "puzzle-a", ownerId: "owner-b", updatedAt: 1}, "owner-a", "puzzle-a"),
    ).toBe(false);
  });

  it("does not lock for this tab's own claim", () => {
    expect(
      shouldLockForActiveGame({sudokuKey: "puzzle-b", ownerId: "owner-a", updatedAt: 1}, "owner-a", "puzzle-a"),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the hook test to verify it fails**

Run: `pnpm test -- src/pages/Game/useActiveGameLock.test.ts`

Expected: FAIL with an import resolution error for `./useActiveGameLock`.

- [ ] **Step 3: Modify route sync return values and save disabling**

In `src/pages/Game/useGameRouteSync.ts`, add an optional prop:

```ts
  saveDisabled?: boolean;
```

Read it in the parameter list with a default:

```ts
  saveDisabled = false,
}: {
```

Update the save effect guard:

```ts
    if (!initialized || currentPath !== "/" || saveDisabled) {
      return;
    }
```

Add `saveDisabled` to that save effect dependency array:

```ts
  }, [gameState, sudokuState, initialized, currentPath, routeSudoku, navigate, saveDisabled]);
```

Add this callback before the final effect dependency list:

```ts
  const openStoredSudoku = React.useCallback(
    (sudokuKey: string) => {
      const storedSudoku = appPersistence.playedSudokus.load(sudokuKey);
      if (!storedSudoku) {
        return false;
      }

      setGameState({...storedSudoku.game});
      setSudokuState({
        current: storedSudoku.sudoku,
        history: [storedSudoku.sudoku],
        historyIndex: 0,
      });
      replaceRouteWithGameState(storedSudoku.game, {
        current: storedSudoku.sudoku,
        history: [storedSudoku.sudoku],
        historyIndex: 0,
      });
      continueGame();
      return true;
    },
    [continueGame, replaceRouteWithGameState, setGameState, setSudokuState],
  );
```

Return the public route-sync API at the end of the hook:

```ts
  return {initialized, openStoredSudoku};
```

- [ ] **Step 4: Implement `useActiveGameLock`**

Create `src/pages/Game/useActiveGameLock.ts`:

```ts
import * as React from "react";

import type {ActiveGameRecord} from "src/lib/database/activeGame";
import {parseActiveGameRecord} from "src/lib/database/activeGame";

type ActiveGameLockState =
  | {
      locked: false;
      activeSudokuKey?: undefined;
    }
  | {
      locked: true;
      activeSudokuKey: string;
    };

export function shouldLockForActiveGame(
  activeGame: ActiveGameRecord | undefined,
  ownerId: string,
  currentSudokuKey: string,
) {
  return Boolean(activeGame && activeGame.ownerId !== ownerId && activeGame.sudokuKey !== currentSudokuKey);
}

export function useActiveGameLock({
  currentSudokuKey,
  initialized,
  pauseGame,
  claimActiveGame,
  ownerId,
  storageKey,
}: {
  currentSudokuKey: string;
  initialized: boolean;
  pauseGame: () => void;
  claimActiveGame: (sudokuKey: string) => unknown;
  ownerId: string;
  storageKey: string;
}) {
  const [lockState, setLockState] = React.useState<ActiveGameLockState>({locked: false});

  React.useEffect(() => {
    if (!initialized || lockState.locked) {
      return;
    }

    claimActiveGame(currentSudokuKey);
  }, [claimActiveGame, currentSudokuKey, initialized, lockState.locked]);

  React.useEffect(() => {
    if (!initialized || typeof window === "undefined") {
      return;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }

      const activeGame = parseActiveGameRecord(event.newValue);
      if (!shouldLockForActiveGame(activeGame, ownerId, currentSudokuKey)) {
        return;
      }

      pauseGame();
      setLockState({locked: true, activeSudokuKey: activeGame.sudokuKey});
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [currentSudokuKey, initialized, ownerId, pauseGame, storageKey]);

  const resumeThisPuzzleHere = React.useCallback(() => {
    claimActiveGame(currentSudokuKey);
    setLockState({locked: false});
  }, [claimActiveGame, currentSudokuKey]);

  const clearLock = React.useCallback(() => {
    setLockState({locked: false});
  }, []);

  return {
    ...lockState,
    resumeThisPuzzleHere,
    clearLock,
  };
}
```

- [ ] **Step 5: Run hook and route-related unit tests**

Run: `pnpm test -- src/pages/Game/useActiveGameLock.test.ts src/lib/database/activeGame.test.ts src/lib/database/playedSudokus.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/pages/Game/useGameRouteSync.ts src/pages/Game/useActiveGameLock.ts src/pages/Game/useActiveGameLock.test.ts
git commit -m "feat: add active game lock hook"
```

---

### Task 4: Locked UI And Game Integration

**Files:**
- Create: `src/pages/Game/ActiveGameLockOverlay.tsx`
- Modify: `src/pages/Game.tsx`
- Modify: `src/pages/Game/GameHeader.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/de.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/fr.json`
- Modify: `src/locales/it.json`
- Modify: `src/locales/pt.json`
- Modify: `src/locales/zh.json`

**Interfaces:**
- Consumes:
  - `useActiveGameLock(...)`
  - `useGameRouteSync(...): {initialized; openStoredSudoku}`
- Produces:
  - `ActiveGameLockOverlay`
  - `data-testid="active-game-lock-overlay"`
  - `data-testid="active-game-lock-switch"`
  - `data-testid="active-game-lock-resume"`

- [ ] **Step 1: Create the lock overlay component**

Create `src/pages/Game/ActiveGameLockOverlay.tsx`:

```tsx
import * as React from "react";

import {useTranslation} from "react-i18next";
import Button from "src/components/Button";

export function ActiveGameLockOverlay({
  visible,
  onSwitchToActivePuzzle,
  onResumeThisPuzzleHere,
}: {
  visible: boolean;
  onSwitchToActivePuzzle: () => void;
  onResumeThisPuzzleHere: () => void;
}) {
  const {t} = useTranslation();

  if (!visible) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-gray-950/70 px-4 text-center"
      data-testid="active-game-lock-overlay"
      role="status"
    >
      <div className="flex max-w-xs flex-col items-center gap-3 rounded-sm bg-gray-900 p-4 text-white shadow-lg">
        <div className="text-base font-semibold">{t("active_game_locked_title")}</div>
        <div className="text-sm text-gray-200">{t("active_game_locked_message")}</div>
        <div className="flex w-full flex-col gap-2">
          <Button
            className="bg-teal-600 text-white dark:bg-teal-600"
            data-testid="active-game-lock-switch"
            onClick={onSwitchToActivePuzzle}
          >
            {t("active_game_switch")}
          </Button>
          <Button data-testid="active-game-lock-resume" onClick={onResumeThisPuzzleHere}>
            {t("active_game_resume_here")}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add locale keys**

Add these keys to every `src/locales/*.json` file, using the same English fallback text in each file:

```json
  "active_game_locked_title": "Game active in another tab",
  "active_game_locked_message": "This puzzle is paused here because another tab is playing a different puzzle.",
  "active_game_switch": "Switch to active puzzle",
  "active_game_resume_here": "Resume this puzzle here"
```

- [ ] **Step 3: Update `GameHeader` locked behavior**

In `src/pages/Game/GameHeader.tsx`, update `NewGameButton` props:

```tsx
const NewGameButton: React.FC<{pauseGame: () => void; disabled?: boolean}> = ({pauseGame, disabled}) => {
```

Add `disabled={disabled}` to the `Button`.

Add `locked: boolean` to `GameHeader` props and destructuring:

```tsx
  locked: boolean;
```

Use `locked` in action disabled states:

```tsx
          disabled={locked || game.won || game.state === GameStateMachine.paused}
```

```tsx
          disabled={locked || game.won}
```

```tsx
        <NewGameButton pauseGame={pauseGame} disabled={locked} />
```

- [ ] **Step 4: Connect lock state in `Game.tsx`**

Add imports:

```tsx
import {ActiveGameLockOverlay} from "./Game/ActiveGameLockOverlay";
import {useActiveGameLock} from "./Game/useActiveGameLock";
import {appPersistence} from "src/lib/persistence/appPersistence";
import {stringifySudoku, cellsToSimpleSudoku} from "src/lib/engine/utility";
```

Replace the existing `useGameRouteSync(...)` call in `GameWithRouteManagement` with:

```tsx
  const currentSudokuKey = React.useMemo(() => {
    return stringifySudoku(cellsToSimpleSudoku(sudokuState.current));
  }, [sudokuState.current]);
  const [activeGameLocked, setActiveGameLocked] = React.useState(false);
  const routeSync = useGameRouteSync({
    gameState,
    sudokuState,
    setGameState,
    setSudokuState,
    setSudoku,
    newGame,
    continueGame,
    userPreferencesState,
    saveDisabled: activeGameLocked,
  });
  const activeGameLock = useActiveGameLock({
    currentSudokuKey,
    initialized: routeSync.initialized,
    pauseGame,
    claimActiveGame: appPersistence.activeGame.claim,
    ownerId: appPersistence.activeGame.ownerId(),
    storageKey: appPersistence.activeGame.storageKey,
  });

  React.useEffect(() => {
    setActiveGameLocked(activeGameLock.locked);
  }, [activeGameLock.locked]);

  const switchToActivePuzzle = React.useCallback(() => {
    if (!activeGameLock.activeSudokuKey) {
      return;
    }

    if (routeSync.openStoredSudoku(activeGameLock.activeSudokuKey)) {
      appPersistence.activeGame.claim(activeGameLock.activeSudokuKey);
      activeGameLock.clearLock();
    }
  }, [activeGameLock, routeSync]);

  const resumeThisPuzzleHere = React.useCallback(() => {
    activeGameLock.resumeThisPuzzleHere();
    continueGame();
  }, [activeGameLock, continueGame]);
```

Pass these props into `GameInner`:

```tsx
      locked={activeGameLock.locked}
      switchToActivePuzzle={switchToActivePuzzle}
      resumeThisPuzzleHere={resumeThisPuzzleHere}
```

Add these props to `GameInner`:

```tsx
  locked: boolean;
  switchToActivePuzzle: () => void;
  resumeThisPuzzleHere: () => void;
```

Update the hidden-board and disabled-control logic:

```tsx
  const lockedGame = locked && !game.won;
  const hideBoardForPause = pausedGame && !game.won;
  const hideBoardForLock = lockedGame;
  const displayedSudoku = hideBoardForPause || hideBoardForLock ? emptyGrid : sudoku;
  const displayedBoardData = hideBoardForPause || hideBoardForLock ? emptyBoardData : boardData;
```

Pass `locked` into `GameHeader`:

```tsx
              locked={lockedGame}
```

Disable menu interactions while locked:

```tsx
                shouldShowMenu={
                  !lockedGame &&
                  game.showMenu &&
                  userPreferencesState.showCircleMenu &&
                  game.state === GameStateMachine.running
                }
```

Update overlays inside `<Sudoku>`:

```tsx
                <ContinueOverlay visible={!lockedGame && pausedGame && !game.won} onClick={continueGame} />
                <ActiveGameLockOverlay
                  visible={lockedGame}
                  onSwitchToActivePuzzle={switchToActivePuzzle}
                  onResumeThisPuzzleHere={resumeThisPuzzleHere}
                />
```

Update number and control disabled props:

```tsx
                    disabled={pausedGame || lockedGame}
```

- [ ] **Step 5: Run typecheck to catch integration errors**

Run: `pnpm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/pages/Game.tsx src/pages/Game/GameHeader.tsx src/pages/Game/ActiveGameLockOverlay.tsx src/locales/en.json src/locales/de.json src/locales/es.json src/locales/fr.json src/locales/it.json src/locales/pt.json src/locales/zh.json
git commit -m "feat: show locked state for inactive game tabs"
```

---

### Task 5: Cross-Tab End-to-End Coverage

**Files:**
- Modify: `e2e/sudoku.e2e.ts`

**Interfaces:**
- Consumes:
  - `data-testid="active-game-lock-overlay"`
  - `data-testid="active-game-lock-switch"`
  - `data-testid="active-game-lock-resume"`

- [ ] **Step 1: Add the e2e test**

Append this test to `e2e/sudoku.e2e.ts` after `changes games through the selection screen`:

```ts
test("locks older tabs when another tab claims a different active puzzle", async ({context, page}) => {
  const pageA = page;
  const pageB = await context.newPage();

  await openGame(pageA, FIRST_PUZZLE, 1, "easy", "Easy");
  await openGame(pageB, MEDIUM_FIRST_PUZZLE, 1, "medium", "Medium");

  await expect(pageA.getByTestId("active-game-lock-overlay")).toBeVisible();
  await expect(cellValue(pageA, 0, 0)).toHaveText("");
  await expect(pageA.getByTestId("sudoku-number-1")).toBeDisabled();

  await pageA.getByTestId("active-game-lock-switch").click();
  await expect(pageA.getByTestId("active-game-lock-overlay")).toHaveCount(0);
  await expect(pageA.getByTestId("current-game-label")).toHaveText("Medium #1");
  await expectGameSearch(pageA, MEDIUM_FIRST_PUZZLE, 1, "medium");

  await pageA.goto(gameUrl(FIRST_PUZZLE, 1, "easy"));
  await expect(pageA.getByTestId("current-game-label")).toHaveText("Easy #1");
  await expect(pageB.getByTestId("active-game-lock-overlay")).toBeVisible();

  await pageB.getByTestId("active-game-lock-resume").click();
  await expect(pageB.getByTestId("active-game-lock-overlay")).toHaveCount(0);
  await expect(pageB.getByTestId("current-game-label")).toHaveText("Medium #1");
  await expect(pageA.getByTestId("active-game-lock-overlay")).toBeVisible();

  await pageB.close();
});
```

- [ ] **Step 2: Run the focused e2e test**

Run: `pnpm run test:e2e -- e2e/sudoku.e2e.ts -g "locks older tabs"`

Expected: PASS.

- [ ] **Step 3: Commit Task 5**

```bash
git add e2e/sudoku.e2e.ts
git commit -m "test: cover active game tab locking"
```

---

### Task 6: Full Verification And Issue Closeout

**Files:**
- No source files.

**Interfaces:**
- Consumes all prior tasks.
- Produces final verification evidence and GitHub issue update.

- [ ] **Step 1: Run typecheck**

Run: `pnpm run typecheck`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`

Expected: PASS.

- [ ] **Step 3: Run unit tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 4: Run production build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 5: Run e2e tests**

Run: `pnpm run test:e2e`

Expected: PASS.

- [ ] **Step 6: Inspect git status**

Run: `git status --short`

Expected: no unstaged or uncommitted source changes.

- [ ] **Step 7: Comment on issue 29**

Run:

```bash
gh issue comment 29 --body "Implemented active-game locking for multi-tab puzzle ownership.

Summary:
- Added structured active-game ownership under sudoku-currently-playing-sudoku.
- Preserved per-puzzle progress under sudoku-played-<sudokuKey>.
- Locked inactive tabs when another tab claims a different puzzle.
- Hid locked board contents and added switch/reclaim actions.
- Added unit and Playwright coverage.

Checks:
- pnpm run typecheck
- pnpm run lint
- pnpm test
- pnpm build
- pnpm run test:e2e"
```

Expected: GitHub CLI prints the created issue comment URL.

- [ ] **Step 8: Close issue 29**

Run: `gh issue close 29 --comment "Closing as complete. Active-game locking now prevents two different puzzles from being played at the same time across tabs/windows."`

Expected: GitHub CLI reports issue 29 closed.
