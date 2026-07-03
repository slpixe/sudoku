import type {GameState} from "src/context/GameContext";
import type {SudokuState} from "src/context/SudokuContext";
import type {Cell} from "src/lib/engine/types";
import {stringifySudoku, cellsToSimpleSudoku} from "src/lib/engine/utility";

const STORAGE_PLAYED_SUDOKU_PREFIX = "sudoku-played-";
const STORAGE_CURRENTLY_PLAYING_SUDOKU_KEY = "sudoku-currently-playing-sudoku";

export interface StoredPlayedSudokuState {
  game: GameState;
  sudoku: Cell[];
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

  return undefined;
}

function createSudokuKey(stringifiedSudoku: string) {
  return STORAGE_PLAYED_SUDOKU_PREFIX + stringifiedSudoku;
}

const saveCurrentSudokuToLocalStorage = (game: GameState, sudoku: SudokuState) => {
  if (typeof localStorage === "undefined") {
    return;
  }

  const stringifiedSudoku = stringifySudoku(cellsToSimpleSudoku(sudoku.current));
  const sudokuKey = createSudokuKey(stringifiedSudoku);
  // Undo history is intentionally omitted to keep saved games small.
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

    return Object.keys(localStorage).filter((key) => key.startsWith(STORAGE_PLAYED_SUDOKU_PREFIX));
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
