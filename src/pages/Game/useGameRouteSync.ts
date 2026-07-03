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

type RouteSudokuSearch = {
  sudokuIndex: number;
  sudoku: string;
  sudokuCollectionName: string;
};

type RouteSudokuParams = RouteSudokuSearch & {
  key: string;
};

function createRouteSudokuKey(params: RouteSudokuSearch) {
  return JSON.stringify([params.sudokuCollectionName, params.sudokuIndex, params.sudoku]);
}

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

  const currentPath = location.pathname;
  const search = location.search as Record<string, unknown>;
  const sudokuIndex = getSearchNumber(search, "sudokuIndex");
  const sudoku = getSearchString(search, "sudoku");
  const sudokuCollectionName = getSearchString(search, "sudokuCollectionName");

  const routeSudoku = React.useMemo<RouteSudokuParams | null>(() => {
    if (sudokuIndex === undefined || sudoku === undefined || sudokuCollectionName === undefined) {
      return null;
    }

    const params = {sudokuIndex, sudoku, sudokuCollectionName};
    return {...params, key: createRouteSudokuKey(params)};
  }, [sudokuIndex, sudoku, sudokuCollectionName]);

  const syncedRouteKeyRef = React.useRef<string | null>(null);
  const latestStateRef = React.useRef({gameState, sudokuState, userPreferencesState, t});

  React.useEffect(() => {
    latestStateRef.current = {gameState, sudokuState, userPreferencesState, t};
  }, [gameState, sudokuState, userPreferencesState, t]);

  const replaceRouteWithGameState = React.useCallback(
    (currentGameState: GameState, currentSudokuState: SudokuState) => {
      const currentSudoku = stringifySudoku(cellsToSimpleSudoku(currentSudokuState.current));
      const nextSearch = {
        sudokuIndex: currentGameState.sudokuIndex + 1,
        sudoku: currentSudoku,
        sudokuCollectionName: currentGameState.sudokuCollectionName,
      };
      syncedRouteKeyRef.current = createRouteSudokuKey(nextSearch);
      navigate({
        replace: true,
        to: "/",
        search: nextSearch,
      });
    },
    [navigate],
  );

  React.useEffect(() => {
    if (!initialized || currentPath !== "/") {
      return;
    }

    if (routeSudoku && routeSudoku.key !== syncedRouteKeyRef.current) {
      return;
    }

    throttledSave(gameState, sudokuState);
    const stringifiedSudoku = stringifySudoku(cellsToSimpleSudoku(sudokuState.current));
    const nextSearch = {
      sudokuIndex: gameState.sudokuIndex + 1,
      sudoku: stringifiedSudoku,
      sudokuCollectionName: gameState.sudokuCollectionName,
    };
    const nextRouteKey = createRouteSudokuKey(nextSearch);

    if (nextRouteKey !== routeSudoku?.key) {
      syncedRouteKeyRef.current = nextRouteKey;
      navigate({
        replace: true,
        to: "/",
        search: nextSearch,
      });
    }
  }, [gameState, sudokuState, initialized, currentPath, routeSudoku, navigate]);

  React.useEffect(() => {
    if (currentPath !== "/") {
      return;
    }

    if (!routeSudoku) {
      setInitialized(true);
      return;
    }

    const {
      gameState: currentGameState,
      sudokuState: currentSudokuState,
      userPreferencesState: currentUserPreferencesState,
      t: translate,
    } = latestStateRef.current;
    const currentSudoku = cellsToSimpleSudoku(currentSudokuState.current);
    if (stringifySudoku(currentSudoku) === routeSudoku.sudoku) {
      syncedRouteKeyRef.current = routeSudoku.key;
      setInitialized(true);
      return;
    }

    console.info("Loading sudoku from URL", routeSudoku.sudokuIndex, routeSudoku.sudoku, routeSudoku.sudokuCollectionName);
    if (currentGameState.secondsPlayed > 5 && !currentGameState.won) {
      const areYouSure = confirm(
        translate("confirm_new_game", {
          currentCollectionName: translateCollectionName(currentGameState.sudokuCollectionName),
          currentIndex: currentGameState.sudokuIndex + 1,
          newCollectionName: translateCollectionName(routeSudoku.sudokuCollectionName),
          newIndex: routeSudoku.sudokuIndex,
        }),
      );
      if (!areYouSure) {
        setInitialized(true);
        replaceRouteWithGameState(currentGameState, currentSudokuState);
        return;
      }
    }

    try {
      const parsedSudoku = parseSudoku(routeSudoku.sudoku);
      const solvedSudoku = solve(parsedSudoku);
      if (solvedSudoku.sudoku) {
        setSudoku(parsedSudoku, solvedSudoku.sudoku);
      } else {
        alert(translate("invalid_sudoku_url"));
        setInitialized(true);
        replaceRouteWithGameState(currentGameState, currentSudokuState);
        return;
      }
    } catch (error) {
      alert(translate("invalid_sudoku_url"));
      setInitialized(true);
      console.error(error);
      replaceRouteWithGameState(currentGameState, currentSudokuState);
      return;
    }

    const storedSudoku = appPersistence.playedSudokus.load(routeSudoku.sudoku);
    newGame(
      routeSudoku.sudokuIndex - 1,
      routeSudoku.sudokuCollectionName,
      storedSudoku?.game.timesSolved ?? 0,
      storedSudoku?.game.previousTimes ?? [],
      currentUserPreferencesState,
    );

    if (storedSudoku && !storedSudoku.game.won) {
      setGameState({...storedSudoku.game});
      setSudokuState({
        current: storedSudoku.sudoku,
        history: [storedSudoku.sudoku],
        historyIndex: 0,
      });
    }
    syncedRouteKeyRef.current = routeSudoku.key;
    setInitialized(true);
    continueGame();
  }, [
    currentPath,
    routeSudoku,
    setGameState,
    setSudokuState,
    continueGame,
    newGame,
    setSudoku,
    replaceRouteWithGameState,
  ]);
}
