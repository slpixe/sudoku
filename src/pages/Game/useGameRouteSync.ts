import * as React from "react";

import {useLocation, useNavigate} from "@tanstack/react-router";
import throttle from "lodash-es/throttle";
import {useTranslation} from "react-i18next";
import {useAppDialog} from "src/components/AppDialog";
import {GameStateMachine, type GameState} from "src/context/GameContext";
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

function getSearchBoolean(search: Record<string, unknown>, name: string) {
  const value = getSearchString(search, name);
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
}

export function useGameRouteSync({
  gameState,
  sudokuState,
  setGameState,
  setSudokuState,
  setSudoku,
  newGame,
  pauseGame,
  continueGame,
  userPreferencesState,
  saveDisabled = false,
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
  pauseGame: () => void;
  continueGame: () => void;
  userPreferencesState: UserPreferences;
  saveDisabled?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const {t} = useTranslation();
  const dialog = useAppDialog();
  const [initialized, setInitialized] = React.useState(false);

  const currentPath = location.pathname;
  const search = location.search as Record<string, unknown>;
  const sudokuIndex = getSearchNumber(search, "sudokuIndex");
  const sudoku = getSearchString(search, "sudoku");
  const sudokuCollectionName = getSearchString(search, "sudokuCollectionName");
  const forceRestart = getSearchBoolean(search, "restart");

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

    if (saveDisabled) {
      throttledSave.cancel();
    }

    if (routeSudoku && routeSudoku.key !== syncedRouteKeyRef.current) {
      return;
    }

    if (!saveDisabled) {
      throttledSave(gameState, sudokuState);
      if (gameState.state === GameStateMachine.paused) {
        throttledSave.flush();
      }
    }

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
  }, [gameState, sudokuState, initialized, currentPath, routeSudoku, navigate, saveDisabled]);

  React.useEffect(() => {
    if (currentPath !== "/") {
      return;
    }

    if (!routeSudoku) {
      setInitialized(true);
      return;
    }

    let cancelled = false;

    const loadRouteSudoku = async () => {
      const {
        gameState: currentGameState,
        sudokuState: currentSudokuState,
        userPreferencesState: currentUserPreferencesState,
        t: translate,
      } = latestStateRef.current;
      const currentSudoku = cellsToSimpleSudoku(currentSudokuState.current);
      if (stringifySudoku(currentSudoku) === routeSudoku.sudoku && !forceRestart) {
        syncedRouteKeyRef.current = routeSudoku.key;
        setInitialized(true);
        return;
      }

      console.info("Loading sudoku from URL", routeSudoku.sudokuIndex, routeSudoku.sudoku, routeSudoku.sudokuCollectionName);
      const wasRunning = currentGameState.state === GameStateMachine.running;
      const pauseForDialog = () => {
        if (wasRunning) {
          pauseGame();
        }
      };
      const resumeExistingGame = () => {
        if (wasRunning) {
          continueGame();
        }
      };

      if (currentGameState.secondsPlayed > 5 && !currentGameState.won) {
        pauseForDialog();
        const areYouSure = await dialog.confirm({
          message: translate("confirm_new_game", {
            currentCollectionName: translateCollectionName(currentGameState.sudokuCollectionName),
            currentIndex: currentGameState.sudokuIndex + 1,
            newCollectionName: translateCollectionName(routeSudoku.sudokuCollectionName),
            newIndex: routeSudoku.sudokuIndex,
          }),
        });
        if (cancelled) {
          return;
        }
        if (!areYouSure) {
          setInitialized(true);
          replaceRouteWithGameState(currentGameState, currentSudokuState);
          resumeExistingGame();
          return;
        }
      }

      try {
        const parsedSudoku = parseSudoku(routeSudoku.sudoku);
        const solvedSudoku = solve(parsedSudoku);
        if (solvedSudoku.sudoku) {
          setSudoku(parsedSudoku, solvedSudoku.sudoku);
        } else {
          pauseForDialog();
          await dialog.alert({message: translate("invalid_sudoku_url")});
          if (cancelled) {
            return;
          }
          setInitialized(true);
          replaceRouteWithGameState(currentGameState, currentSudokuState);
          resumeExistingGame();
          return;
        }
      } catch (error) {
        pauseForDialog();
        await dialog.alert({message: translate("invalid_sudoku_url")});
        if (cancelled) {
          return;
        }
        setInitialized(true);
        console.error(error);
        replaceRouteWithGameState(currentGameState, currentSudokuState);
        resumeExistingGame();
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
    };

    void loadRouteSudoku();

    return () => {
      cancelled = true;
    };
  }, [
    currentPath,
    routeSudoku,
    forceRestart,
    dialog,
    setGameState,
    setSudokuState,
    pauseGame,
    continueGame,
    newGame,
    setSudoku,
    replaceRouteWithGameState,
  ]);

  const openStoredSudoku = React.useCallback(
    (sudokuKey: string) => {
      const storedSudoku = appPersistence.playedSudokus.load(sudokuKey);
      if (!storedSudoku) {
        return false;
      }

      const storedSudokuState = {
        current: storedSudoku.sudoku,
        history: [storedSudoku.sudoku],
        historyIndex: 0,
      };

      setGameState({...storedSudoku.game});
      setSudokuState(storedSudokuState);
      replaceRouteWithGameState(storedSudoku.game, storedSudokuState);
      return true;
    },
    [replaceRouteWithGameState, setGameState, setSudokuState],
  );

  return {initialized, openStoredSudoku};
}
