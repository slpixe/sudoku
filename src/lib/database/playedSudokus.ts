import type {GameState} from "src/context/GameContext";
import type {SudokuState} from "src/context/SudokuContext";
import type {Cell} from "src/lib/engine/types";
import {stringifySudoku, cellsToSimpleSudoku} from "src/lib/engine/utility";

const STORAGE_KEY_V_1_4 = "super_sudoku_1_4_use_this_file_if_you_want_to_cheat";
const STORAGE_KEY_V_1_5 = "super_sudoku_1_5_use_this_file_if_you_want_to_cheat";
const STORAGE_KEY_V_1_6_PREFIX = "super_sudoku_1_6_";
const STORAGE_CURRENTLY_PLAYING_SUDOKU_KEY = "super_sudoku_currently_playing_sudoku";

export interface StoredPlayedSudokuState {
  game: GameState;
  sudoku: Cell[];
}

interface StoredPlayedSudokusState {
  active: string | number;
  sudokus: {
    [key: string]: StoredPlayedSudokuState;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function isCellCoordinates(value: unknown): value is {x: number; y: number} {
  return isRecord(value) && isIntegerInRange(value.x, 0, 8) && isIntegerInRange(value.y, 0, 8);
}

function isCell(value: unknown): value is Cell {
  return (
    isRecord(value) &&
    isIntegerInRange(value.x, 0, 8) &&
    isIntegerInRange(value.y, 0, 8) &&
    isIntegerInRange(value.number, 0, 9) &&
    typeof value.initial === "boolean" &&
    Array.isArray(value.notes) &&
    value.notes.every((note) => isIntegerInRange(note, 1, 9)) &&
    isIntegerInRange(value.solution, 0, 9)
  );
}

function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) {
    return false;
  }

  const hasCollectionName = typeof value.sudokuCollectionName === "string" || typeof value.difficulty === "string";
  const hasActiveCell = value.activeCellCoordinates === undefined || isCellCoordinates(value.activeCellCoordinates);
  const hasClipboardNotes = value.clipboardNotes === null || isNumberArray(value.clipboardNotes);

  return (
    hasCollectionName &&
    hasActiveCell &&
    typeof value.notesMode === "boolean" &&
    typeof value.showNotes === "boolean" &&
    typeof value.showMenu === "boolean" &&
    (value.state === "RUNNING" || value.state === "PAUSED") &&
    typeof value.sudokuIndex === "number" &&
    typeof value.won === "boolean" &&
    typeof value.timesSolved === "number" &&
    isNumberArray(value.previousTimes) &&
    typeof value.secondsPlayed === "number" &&
    hasClipboardNotes
  );
}

function isStoredPlayedSudokuState(value: unknown): value is StoredPlayedSudokuState {
  return (
    isRecord(value) &&
    isGameState(value.game) &&
    Array.isArray(value.sudoku) &&
    value.sudoku.length === 81 &&
    value.sudoku.every(isCell)
  );
}

function isStoredPlayedSudokusState(value: unknown): value is StoredPlayedSudokusState {
  if (!isRecord(value) || (typeof value.active !== "string" && typeof value.active !== "number") || !isRecord(value.sudokus)) {
    return false;
  }

  const sudokus = value.sudokus;
  return Object.keys(sudokus).every((key) => isStoredPlayedSudokuState(sudokus[key]));
}

function parseJson(text: string, description: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn(`Failed to parse ${description} from localStorage:`, error);
    return undefined;
  }
}

function parseStoredPlayedSudokuState(text: string): StoredPlayedSudokuState | undefined {
  const parsed = parseJson(text, "played sudoku state");
  if (parsed === undefined) {
    return undefined;
  }

  if (!isStoredPlayedSudokuState(parsed)) {
    console.warn("Ignoring invalid played sudoku state from localStorage.");
    return undefined;
  }

  return parsed;
}

function parseStoredPlayedSudokusState(text: string): StoredPlayedSudokusState | undefined {
  const parsed = parseJson(text, "played sudokus state");
  if (parsed === undefined) {
    return undefined;
  }

  if (!isStoredPlayedSudokusState(parsed)) {
    console.warn("Ignoring invalid played sudokus state from localStorage.");
    return undefined;
  }

  return parsed;
}

// Before version 1.6, we had one storage key for all sudokus.
// Now we have one storage key for each sudoku.
// This function loads the sudokus from the old storage key.
const legacyLoadPlayedSudokusFromLocalStorage = (): StoredPlayedSudokusState => {
  const empty = {
    active: "",
    sudokus: {},
    application: undefined,
  };
  if (typeof localStorage === "undefined") {
    return empty;
  }
  let usedKey = STORAGE_KEY_V_1_5;
  let text = localStorage.getItem(STORAGE_KEY_V_1_5);
  // Try older versions.
  if (text === null) {
    usedKey = STORAGE_KEY_V_1_4;
    text = localStorage.getItem(STORAGE_KEY_V_1_4);
    console.log("using v1.4", text);
  }
  if (text !== null) {
    const result = parseStoredPlayedSudokusState(text);

    if (!result) {
      // delete entry but save it as corrupted, so one might be able to restore it
      console.error("File corrupted: will delete and save as corrupted.");
      localStorage.setItem(STORAGE_KEY_V_1_5 + "_corrupted_" + new Date().toISOString(), text);
      localStorage.removeItem(STORAGE_KEY_V_1_5);
      return empty;
    }

    // Migrate from numeric IDs to stringified sudoku keys
    if (usedKey === STORAGE_KEY_V_1_4) {
      const migratedSudokus: {[key: string]: StoredPlayedSudokuState} = {};
      const keys = Object.keys(result.sudokus);
      console.log("keys", keys);

      for (const key of keys) {
        const numberKey = parseInt(key, 10);
        if (isNaN(numberKey)) {
          continue;
        }
        const sudoku = result.sudokus[numberKey];

        // Convert numeric ID to stringified sudoku key
        const sudokuKey = stringifySudoku(cellsToSimpleSudoku(sudoku.sudoku));
        console.log("migrated sudoku:", numberKey, "to", sudokuKey);

        migratedSudokus[sudokuKey] = sudoku;
      }

      result.sudokus = migratedSudokus;
      result.active =
        typeof result.active === "number" && result.active !== -1
          ? stringifySudoku(cellsToSimpleSudoku(result.sudokus[result.active]?.sudoku || []))
          : "";
    }

    return result;
  }
  return empty;
};

export function getCurrentSudokuFromStorage(): StoredPlayedSudokuState | undefined {
  if (typeof localStorage === "undefined") {
    return undefined;
  }

  const sudokuKey = localStorage.getItem(STORAGE_CURRENTLY_PLAYING_SUDOKU_KEY);
  if (sudokuKey) {
    return getSudokuFromStorage(sudokuKey);
  }
  return undefined;
}

function getSudokuFromStorage(sudokuKey: string): StoredPlayedSudokuState | undefined {
  if (typeof localStorage === "undefined") {
    return undefined;
  }

  // V1.6
  const sudokuFromStorage = localStorage.getItem(createSudokuKey(sudokuKey));
  if (sudokuFromStorage) {
    const sudoku = parseStoredPlayedSudokuState(sudokuFromStorage);
    if (!sudoku) {
      return undefined;
    }

    // There is a bug that the collection name might not be set, then we just use the difficulty.
    const difficulty = (sudoku.game as any).difficulty;
    if (!sudoku.game.sudokuCollectionName && difficulty) {
      sudoku.game.sudokuCollectionName = difficulty;
    }
    return sudoku;
  }

  // TODO: Remove after a year (today is 2025-06-28).
  // No old storage found.
  if (localStorage.getItem(STORAGE_KEY_V_1_5) === null && localStorage.getItem(STORAGE_KEY_V_1_4) === null) {
    return undefined;
  }

  // V1.5
  const sudokusFromStorage = legacyLoadPlayedSudokusFromLocalStorage();
  // Migrate to V1.6
  for (const sudokuKey of Object.keys(sudokusFromStorage.sudokus)) {
    const sudoku = sudokusFromStorage.sudokus[sudokuKey];
    const stringifiedSudoku = stringifySudoku(cellsToSimpleSudoku(sudoku.sudoku));
    localStorage.setItem(createSudokuKey(stringifiedSudoku), JSON.stringify(sudoku));
  }
  // Delete old storage.
  localStorage.removeItem(STORAGE_KEY_V_1_5);
  localStorage.removeItem(STORAGE_KEY_V_1_4);

  // Try again, as now we have the new storage key.
  return getSudokuFromStorage(sudokuKey);
}

function createSudokuKey(stringifiedSudoku: string) {
  return STORAGE_KEY_V_1_6_PREFIX + stringifiedSudoku;
}

const saveCurrentSudokuToLocalStorage = (game: GameState, sudoku: SudokuState) => {
  if (typeof localStorage === "undefined") {
    return;
  }

  const stringifiedSudoku = stringifySudoku(cellsToSimpleSudoku(sudoku.current));
  const sudokuKey = createSudokuKey(stringifiedSudoku);
  // We do not save the history as it would take too much space.
  // Also we don't need to to migrate the existing data.
  try {
    localStorage.setItem(sudokuKey, JSON.stringify({game, sudoku: sudoku.current}));
    // TODO: this is problematic with multiple open windows, as the .active gets overwritten.
    // We should have a tab based storage for that stuff as well, so a reload does not open the other sudoku.
    localStorage.setItem(STORAGE_CURRENTLY_PLAYING_SUDOKU_KEY, stringifiedSudoku);
  } catch (e) {
    console.error("LocalStorage is not supported! No Saving possible.", e);
  }
};

interface PlayedSudokuRepository {
  getPlayedSudokus(): string[];
  getCurrentSudokuKey(): string | null;
  saveCurrentSudokuKey(sudokuKey: string): void;
  getSudokuState(sudokuKey: string): StoredPlayedSudokuState | undefined;
  saveSudokuState(game: GameState, sudoku: SudokuState): void;
  removeSudokuState(sudokuKey: string): void;
}

export const localStoragePlayedSudokuRepository: PlayedSudokuRepository = {
  getPlayedSudokus(): string[] {
    if (typeof localStorage === "undefined") {
      return [];
    }

    return Object.keys(localStorage).filter((key) => key.startsWith(STORAGE_KEY_V_1_6_PREFIX));
  },
  getCurrentSudokuKey(): string | null {
    if (typeof localStorage === "undefined") {
      return null;
    }

    return localStorage.getItem(STORAGE_CURRENTLY_PLAYING_SUDOKU_KEY);
  },
  saveCurrentSudokuKey(sudokuKey: string): void {
    if (typeof localStorage === "undefined") {
      return;
    }

    localStorage.setItem(STORAGE_CURRENTLY_PLAYING_SUDOKU_KEY, sudokuKey);
  },
  getSudokuState(sudokuKey: string): StoredPlayedSudokuState | undefined {
    return getSudokuFromStorage(sudokuKey);
  },
  saveSudokuState(game: GameState, sudoku: SudokuState): void {
    saveCurrentSudokuToLocalStorage(game, sudoku);
  },
  removeSudokuState(sudokuKey: string): void {
    if (typeof localStorage === "undefined") {
      return;
    }

    localStorage.removeItem(createSudokuKey(sudokuKey));
  },
};
