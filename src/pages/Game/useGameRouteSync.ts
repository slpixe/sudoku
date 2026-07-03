import * as React from "react";

import {useLocation, useNavigate} from "@tanstack/react-router";
import throttle from "lodash-es/throttle";
import {useTranslation} from "react-i18next";
import {GameState} from "src/context/GameContext";
import {SudokuState} from "src/context/SudokuContext";
import {translateCollectionName} from "src/lib/database/collections";
import type {UserPreferences} from "src/lib/database/userPreferences";
import {SimpleSudoku} from "src/lib/engine/types";
import {cellsToSimpleSudoku, parseSudoku, stringifySudoku} from "src/lib/engine/utility";
import {solve} from "src/lib/engine/solverAC3";
import {appPersistence} from "src/lib/persistence/appPersistence";

const throttledSave = throttle(appPersistence.currentGame.save, 2000);

function stripWrappingQuotes(value: string) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

function getRawSearchParam(name: string) {
  if (typeof window === "undefined") {
    return undefined;
  }

  const hashSearch = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
  const searchSources = [hashSearch, window.location.search.replace(/^\?/, "")].filter(Boolean);

  for (const source of searchSources) {
    const value = new URLSearchParams(source).get(name);
    if (value !== null) {
      return stripWrappingQuotes(value);
    }
  }

  return undefined;
}

function getSearchString(search: Record<string, unknown>, name: string) {
  const rawValue = getRawSearchParam(name);
  if (rawValue !== undefined) {
    return rawValue;
  }

  const value = search[name];
  if (typeof value === "string") {
    return stripWrappingQuotes(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value.toString();
  }
  return undefined;
}

function getSearchNumber(search: Record<string, unknown>, name: string) {
  const value = getSearchString(search, name);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function useGameRouteSync({
  gameState,
  sudokuState,
  setGameState,
  setSudokuState,
  setSudoku,
  newGame,
  continueGame,
  userPreferencesState,
}: {
  gameState: GameState;
  sudokuState: SudokuState;
  setGameState: (state: GameState) => void;
  setSudokuState: (state: SudokuState) => void;
  setSudoku: (sudoku: SimpleSudoku, solvedSudoku: SimpleSudoku) => void;
  newGame: (
    sudokuIndex: number,
    sudokuCollectionName: string,
    timesSolved: number,
    previousTimes: number[],
    preferences: UserPreferences,
  ) => void;
  continueGame: () => void;
  userPreferencesState: UserPreferences;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const {t} = useTranslation();
  const [initialized, setInitialized] = React.useState(false);
  const [disableAutoSync, setDisableAutoSync] = React.useState(false);

  const currentPath = location.pathname;
  const search = location.search as Record<string, unknown>;
  const sudokuIndex = getSearchNumber(search, "sudokuIndex");
  const sudoku = getSearchString(search, "sudoku");
  const sudokuCollectionName = getSearchString(search, "sudokuCollectionName");

  React.useEffect(() => {
    if (gameState && sudokuState && initialized && currentPath === "/" && !disableAutoSync) {
      throttledSave(gameState, sudokuState);
      const stringifiedSudoku = stringifySudoku(cellsToSimpleSudoku(sudokuState.current));
      const shouldUpdateUrl = stringifiedSudoku !== sudoku;
      if (shouldUpdateUrl) {
        navigate({
          replace: true,
          to: "/",
          search: {
            sudokuIndex: gameState.sudokuIndex + 1,
            sudoku: stringifiedSudoku,
            sudokuCollectionName: gameState.sudokuCollectionName,
          },
        });
      }
    }
  }, [gameState, sudokuState, initialized, currentPath, sudoku, navigate, disableAutoSync]);

  React.useEffect(() => {
    if (sudokuIndex === undefined || sudoku === undefined || sudokuCollectionName === undefined) {
      setInitialized(true);
      return;
    }

    const currentSudoku = cellsToSimpleSudoku(sudokuState.current);
    if (stringifySudoku(currentSudoku) === sudoku) {
      setInitialized(true);
      return;
    }

    console.info("Loading sudoku from URL", sudokuIndex, sudoku, sudokuCollectionName);
    if (gameState.secondsPlayed > 5 && !gameState.won) {
      const areYouSure = confirm(
        t("confirm_new_game", {
          currentCollectionName: translateCollectionName(gameState.sudokuCollectionName),
          currentIndex: gameState.sudokuIndex + 1,
          newCollectionName: translateCollectionName(sudokuCollectionName),
          newIndex: sudokuIndex,
        }),
      );
      if (!areYouSure) {
        setInitialized(true);
        return;
      }
    }

    try {
      const parsedSudoku = parseSudoku(sudoku);
      const solvedSudoku = solve(parsedSudoku);
      if (solvedSudoku.sudoku) {
        setSudoku(parsedSudoku, solvedSudoku.sudoku);
      } else {
        alert(t("invalid_sudoku_url"));
        setInitialized(true);
        return;
      }
    } catch (error) {
      alert(t("invalid_sudoku_url"));
      setInitialized(true);
      console.error(error);
      return;
    }

    const storedSudoku = appPersistence.playedSudokus.load(sudoku);
    newGame(
      sudokuIndex - 1,
      sudokuCollectionName,
      storedSudoku?.game.timesSolved ?? 0,
      storedSudoku?.game.previousTimes ?? [],
      userPreferencesState,
    );

    if (storedSudoku && !storedSudoku.game.won) {
      setGameState({...storedSudoku.game});
      setSudokuState({
        current: storedSudoku.sudoku,
        history: [storedSudoku.sudoku],
        historyIndex: 0,
      });
    }
    setInitialized(true);
    continueGame();
  }, [
    sudokuIndex,
    sudoku,
    sudokuCollectionName,
    setGameState,
    setSudokuState,
    setInitialized,
    continueGame,
    sudokuState,
    gameState.secondsPlayed,
    gameState.won,
    gameState.sudokuCollectionName,
    gameState.sudokuIndex,
    newGame,
    setSudoku,
    userPreferencesState,
    t,
  ]);

  return React.useCallback((disabled: boolean) => {
    setDisableAutoSync(disabled);
  }, []);
}
