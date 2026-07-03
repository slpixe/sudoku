import {afterEach, describe, expect, it, vi} from "vitest";

import {INITIAL_GAME_STATE} from "src/context/GameContext";
import {INITIAL_SUDOKU_STATE} from "src/context/SudokuContext";
import {cellsToSimpleSudoku, stringifySudoku} from "src/lib/engine/utility";
import {localStoragePlayedSudokuRepository, StoredPlayedSudokuState} from "./playedSudokus";

function createLocalStorageMock(initialValues: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initialValues));

  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => {
      store.clear();
    }),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  } as unknown as Storage;
}

const sudokuKey = stringifySudoku(cellsToSimpleSudoku(INITIAL_SUDOKU_STATE.current));
const storageKey = `super_sudoku_1_6_${sudokuKey}`;

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
