import type {GameState} from "src/context/GameContext";
import type {SudokuState} from "src/context/SudokuContext";
import type {ActiveGameRecord} from "src/lib/database/activeGame";
import {
  claimActiveGame,
  getActiveGameOwnerId,
  loadActiveGameRecord,
  STORAGE_ACTIVE_GAME_KEY,
} from "src/lib/database/activeGame";
import type {Collection, CollectionIndex} from "src/lib/database/collections";
import {localStorageCollectionRepository} from "src/lib/database/collections";
import type {StoredPlayedSudokuState} from "src/lib/database/playedSudokus";
import {localStoragePlayedSudokuRepository} from "src/lib/database/playedSudokus";
import type {UserPreferences} from "src/lib/database/userPreferences";
import {localStorageUserPreferencesRepository} from "src/lib/database/userPreferences";

export type {StoredPlayedSudokuState};

const STORAGE_KEY_DARK_MODE = "sudoku-dark-mode";

export interface AppPersistence {
  activeGame: {
    storageKey: string;
    ownerId(): string;
    load(): ActiveGameRecord | undefined;
    claim(sudokuKey: string): ActiveGameRecord | undefined;
  };
  appearance: {
    loadDarkModePreference(): boolean | undefined;
    saveDarkModePreference(darkMode: boolean): void;
    getSystemDarkModePreference(): boolean;
  };
  collections: {
    loadIndex(): CollectionIndex[];
    load(collectionId: string): Collection;
  };
  currentGame: {
    load(): StoredPlayedSudokuState | undefined;
    save(game: GameState, sudoku: SudokuState): void;
  };
  playedSudokus: {
    loadKeys(): string[];
    loadCurrentKey(): string | null;
    saveCurrentKey(sudokuKey: string): void;
    load(sudokuKey: string): StoredPlayedSudokuState | undefined;
    save(game: GameState, sudoku: SudokuState): void;
    remove(sudokuKey: string): void;
  };
  userPreferences: {
    load(): UserPreferences;
    save(preferences: UserPreferences): void;
  };
}

function hasLocalStorage() {
  return typeof localStorage !== "undefined";
}

function loadDarkModePreference(): boolean | undefined {
  if (!hasLocalStorage()) {
    return undefined;
  }

  const savedMode = localStorage.getItem(STORAGE_KEY_DARK_MODE);
  if (savedMode === null) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(savedMode);
    return typeof parsed === "boolean" ? parsed : undefined;
  } catch (error) {
    console.warn("Failed to parse dark mode preference from localStorage:", error);
    return undefined;
  }
}

function saveDarkModePreference(darkMode: boolean) {
  if (!hasLocalStorage()) {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY_DARK_MODE, JSON.stringify(darkMode));
  } catch (error) {
    console.warn("Failed to save dark mode preference to localStorage:", error);
  }
}

function getSystemDarkModePreference() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export const appPersistence: AppPersistence = {
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
  appearance: {
    loadDarkModePreference,
    saveDarkModePreference,
    getSystemDarkModePreference,
  },
  collections: {
    loadIndex(): CollectionIndex[] {
      return localStorageCollectionRepository.getCollections();
    },
    load(collectionId: string): Collection {
      return localStorageCollectionRepository.getCollection(collectionId);
    },
  },
  currentGame: {
    load(): StoredPlayedSudokuState | undefined {
      const activeGame = loadActiveGameRecord();
      return activeGame ? localStoragePlayedSudokuRepository.getSudokuState(activeGame.sudokuKey) : undefined;
    },
    save(game: GameState, sudoku: SudokuState): void {
      localStoragePlayedSudokuRepository.saveSudokuState(game, sudoku);
    },
  },
  playedSudokus: {
    loadKeys(): string[] {
      return localStoragePlayedSudokuRepository.getPlayedSudokus();
    },
    loadCurrentKey(): string | null {
      return localStoragePlayedSudokuRepository.getCurrentSudokuKey();
    },
    saveCurrentKey(sudokuKey: string): void {
      localStoragePlayedSudokuRepository.saveCurrentSudokuKey(sudokuKey);
    },
    load(sudokuKey: string): StoredPlayedSudokuState | undefined {
      return localStoragePlayedSudokuRepository.getSudokuState(sudokuKey);
    },
    save(game: GameState, sudoku: SudokuState): void {
      localStoragePlayedSudokuRepository.saveSudokuState(game, sudoku);
    },
    remove(sudokuKey: string): void {
      localStoragePlayedSudokuRepository.removeSudokuState(sudokuKey);
    },
  },
  userPreferences: {
    load(): UserPreferences {
      return localStorageUserPreferencesRepository.getPreferences();
    },
    save(preferences: UserPreferences): void {
      localStorageUserPreferencesRepository.savePreferences(preferences);
    },
  },
};
