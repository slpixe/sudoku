import {afterEach, describe, expect, it, vi} from "vitest";

import {INITIAL_GAME_STATE} from "src/context/GameContext";
import {INITIAL_SUDOKU_STATE} from "src/context/SudokuContext";
import {cellsToSimpleSudoku, stringifySudoku} from "src/lib/engine/utility";
import {localStoragePlayedSudokuRepository, StoredPlayedSudokuState} from "./playedSudokus";

function createLocalStorageMock(initialValues: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initialValues));
  const storage = {} as Storage & Record<string, string>;

  const syncEnumerableKeys = () => {
    for (const key of Object.keys(storage)) {
      delete storage[key];
    }

    for (const [key, value] of store) {
      Object.defineProperty(storage, key, {
        configurable: true,
        enumerable: true,
        value,
      });
    }
  };

  Object.defineProperties(storage, {
    length: {
      get() {
        return store.size;
      },
    },
    clear: {
      value: vi.fn(() => {
        store.clear();
        syncEnumerableKeys();
      }),
    },
    getItem: {
      value: vi.fn((key: string) => store.get(key) ?? null),
    },
    key: {
      value: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    },
    removeItem: {
      value: vi.fn((key: string) => {
        store.delete(key);
        syncEnumerableKeys();
      }),
    },
    setItem: {
      value: vi.fn((key: string, value: string) => {
        store.set(key, value);
        syncEnumerableKeys();
      }),
    },
  });

  syncEnumerableKeys();
  return storage;
}

const sudokuKey = stringifySudoku(cellsToSimpleSudoku(INITIAL_SUDOKU_STATE.current));
const storageKey = `sudoku-played-${sudokuKey}`;

describe("localStoragePlayedSudokuRepository", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads valid current played sudoku state", () => {
    vi.stubGlobal("localStorage", createLocalStorageMock());

    localStoragePlayedSudokuRepository.saveSudokuState(INITIAL_GAME_STATE, INITIAL_SUDOKU_STATE);

    expect(localStoragePlayedSudokuRepository.getSudokuState(sudokuKey)).toEqual({
      game: INITIAL_GAME_STATE,
      sudoku: INITIAL_SUDOKU_STATE.current,
    });
  });

  it("returns empty values when played sudoku storage is missing", () => {
    vi.stubGlobal("localStorage", createLocalStorageMock());

    expect(localStoragePlayedSudokuRepository.getPlayedSudokus()).toEqual([]);
    expect(localStoragePlayedSudokuRepository.getCurrentSudokuKey()).toBeNull();
    expect(localStoragePlayedSudokuRepository.getSudokuState(sudokuKey)).toBeUndefined();
  });

  it("lists and removes only played sudoku storage entries", () => {
    vi.stubGlobal(
      "localStorage",
      createLocalStorageMock({
        [storageKey]: JSON.stringify({game: INITIAL_GAME_STATE, sudoku: INITIAL_SUDOKU_STATE.current}),
        "unrelated-key": "value",
      }),
    );

    expect(localStoragePlayedSudokuRepository.getPlayedSudokus()).toEqual([storageKey]);

    localStoragePlayedSudokuRepository.removeSudokuState(sudokuKey);
    expect(localStoragePlayedSudokuRepository.getPlayedSudokus()).toEqual([]);
  });

  it("loads migrated played sudoku states that stored difficulty instead of collection name", () => {
    const migratedGame: Record<string, unknown> = {...INITIAL_GAME_STATE, difficulty: "expert"};
    delete migratedGame.sudokuCollectionName;
    vi.stubGlobal(
      "localStorage",
      createLocalStorageMock({
        [storageKey]: JSON.stringify({game: migratedGame, sudoku: INITIAL_SUDOKU_STATE.current}),
      }),
    );

    expect(localStoragePlayedSudokuRepository.getSudokuState(sudokuKey)?.game.sudokuCollectionName).toBe("expert");
  });

  it("fails safely when current played sudoku storage contains corrupt JSON", () => {
    vi.stubGlobal("localStorage", createLocalStorageMock({[storageKey]: "{"}));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    let result: StoredPlayedSudokuState | undefined;
    expect(() => {
      result = localStoragePlayedSudokuRepository.getSudokuState(sudokuKey);
    }).not.toThrow();

    expect(result).toBeUndefined();
  });

  it("fails safely when current played sudoku storage is incomplete", () => {
    vi.stubGlobal(
      "localStorage",
      createLocalStorageMock({
        [storageKey]: JSON.stringify({
          game: INITIAL_GAME_STATE,
          sudoku: [],
        }),
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(localStoragePlayedSudokuRepository.getSudokuState(sudokuKey)).toBeUndefined();
  });
});
