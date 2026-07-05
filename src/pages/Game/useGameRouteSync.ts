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
import {getSudokuCollection, getSudokusPaginated} from "src/lib/game/sudokus";
import {appPersistence} from "src/lib/persistence/appPersistence";
import {
  createCompactGameSearch,
  createGameRouteSudokuKey,
  createPayloadGameSearch,
  parseGameRouteIntent,
  shouldUseCompactGameSearch,
  type GameRouteIntent,
  type GameRouteSearch,
} from "./gameRouteContract";

const throttledSave = throttle(appPersistence.currentGame.save, 2000);

type RouteSudokuParams = {
  sudokuIndex: number;
  sudoku: string;
  sudokuCollectionName: string;
  key: string;
  search: GameRouteSearch;
  solution?: SimpleSudoku;
  forceRestart: boolean;
};

function getCurrentRawSearch() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const hashSearch = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
  return hashSearch || window.location.search.replace(/^\?/, "") || undefined;
}

function getCollectionSudoku(collectionId: string, puzzleNumber: number) {
  const collection = getSudokuCollection(collectionId);
  const result = getSudokusPaginated(collection, puzzleNumber - 1, 1);
  return result.sudokus[0];
}

function createRouteSudoku({
  collectionId,
  puzzleNumber,
  sudoku,
  search,
  solution,
  forceRestart,
}: {
  collectionId: string;
  puzzleNumber: number;
  sudoku: string;
  search: GameRouteSearch;
  solution?: SimpleSudoku;
  forceRestart: boolean;
}): RouteSudokuParams {
  return {
    sudokuIndex: puzzleNumber,
    sudoku,
    sudokuCollectionName: collectionId,
    key: createGameRouteSudokuKey({collectionId, puzzleNumber, sudoku}),
    search,
    solution,
    forceRestart,
  };
}

function resolveRouteSudoku(intent: GameRouteIntent): RouteSudokuParams | null {
  if (intent.kind === "none" || intent.kind === "invalid") {
    return null;
  }

  if (intent.kind === "collection") {
    const collectionSudoku = getCollectionSudoku(intent.collectionId, intent.puzzleNumber);
    if (!collectionSudoku) {
      return null;
    }

    return createRouteSudoku({
      collectionId: intent.collectionId,
      puzzleNumber: intent.puzzleNumber,
      sudoku: stringifySudoku(collectionSudoku.sudoku),
      search: createCompactGameSearch(intent.collectionId, intent.puzzleNumber, intent.forceRestart),
      solution: collectionSudoku.solution,
      forceRestart: intent.forceRestart,
    });
  }

  let collectionSudoku: string | undefined;
  let solution: SimpleSudoku | undefined;
  if (intent.hasPuzzleMetadata) {
    try {
      const matchedSudoku = getCollectionSudoku(intent.collectionId, intent.puzzleNumber);
      collectionSudoku = matchedSudoku ? stringifySudoku(matchedSudoku.sudoku) : undefined;
      solution = matchedSudoku?.solution;
    } catch {
      collectionSudoku = undefined;
      solution = undefined;
    }
  }

  const useCompactSearch = shouldUseCompactGameSearch({
    sudoku: intent.sudoku,
    collectionSudoku,
    hasPuzzleMetadata: intent.hasPuzzleMetadata,
  });

  return createRouteSudoku({
    collectionId: intent.collectionId,
    puzzleNumber: intent.puzzleNumber,
    sudoku: intent.sudoku,
    search: useCompactSearch
      ? createCompactGameSearch(intent.collectionId, intent.puzzleNumber, intent.forceRestart)
      : createPayloadGameSearch(intent.sudoku, intent.collectionId, intent.puzzleNumber, intent.forceRestart),
    solution: useCompactSearch ? solution : undefined,
    forceRestart: intent.forceRestart,
  });
}

function createRouteSearchForGameState(
  currentGameState: GameState,
  currentSudokuState: SudokuState,
  currentRouteSudoku?: RouteSudokuParams | null,
) {
  const currentSudoku = stringifySudoku(cellsToSimpleSudoku(currentSudokuState.current));
  const puzzleNumber = currentGameState.sudokuIndex + 1;
  if (
    currentRouteSudoku &&
    currentRouteSudoku.sudoku === currentSudoku &&
    currentRouteSudoku.sudokuCollectionName === currentGameState.sudokuCollectionName &&
    currentRouteSudoku.sudokuIndex === puzzleNumber
  ) {
    return {
      search: currentRouteSudoku.search,
      key: currentRouteSudoku.key,
    };
  }

  try {
    const collectionSudoku = getCollectionSudoku(currentGameState.sudokuCollectionName, puzzleNumber);
    if (collectionSudoku && stringifySudoku(collectionSudoku.sudoku) === currentSudoku) {
      return {
        search: createCompactGameSearch(currentGameState.sudokuCollectionName, puzzleNumber),
        key: createGameRouteSudokuKey({
          collectionId: currentGameState.sudokuCollectionName,
          puzzleNumber,
          sudoku: currentSudoku,
        }),
      };
    }
  } catch {
    // Fall through to payload search for exact/custom puzzles.
  }

  return {
    search: createPayloadGameSearch(currentSudoku, currentGameState.sudokuCollectionName, puzzleNumber),
    key: createGameRouteSudokuKey({
      collectionId: currentGameState.sudokuCollectionName,
      puzzleNumber,
      sudoku: currentSudoku,
    }),
  };
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
  const rawSearch = getCurrentRawSearch();
  const searchKey = React.useMemo(() => JSON.stringify(search), [search]);
  const routeSearch = React.useMemo(() => JSON.parse(searchKey) as Record<string, unknown>, [searchKey]);

  const routeIntent = React.useMemo(() => {
    return parseGameRouteIntent(routeSearch, rawSearch);
  }, [routeSearch, rawSearch]);

  const routeSudoku = React.useMemo<RouteSudokuParams | null>(() => {
    try {
      return resolveRouteSudoku(routeIntent);
    } catch (error) {
      console.error(error);
      return null;
    }
  }, [routeIntent]);
  const routeLoadFailed = routeIntent.kind === "invalid" || (routeIntent.kind !== "none" && routeSudoku === null);

  const syncedRouteKeyRef = React.useRef<string | null>(null);
  const latestStateRef = React.useRef({gameState, sudokuState, userPreferencesState, t});

  React.useEffect(() => {
    latestStateRef.current = {gameState, sudokuState, userPreferencesState, t};
  }, [gameState, sudokuState, userPreferencesState, t]);

  const replaceRouteWithGameState = React.useCallback(
    (currentGameState: GameState, currentSudokuState: SudokuState) => {
      const nextRoute = createRouteSearchForGameState(currentGameState, currentSudokuState, routeSudoku);
      syncedRouteKeyRef.current = nextRoute.key;
      navigate({
        replace: true,
        to: "/",
        search: nextRoute.search,
      });
    },
    [navigate, routeSudoku],
  );

  React.useEffect(() => {
    if (!initialized || currentPath !== "/") {
      return;
    }

    if (saveDisabled) {
      throttledSave.cancel();
    }

    if (routeLoadFailed || (routeSudoku && routeSudoku.key !== syncedRouteKeyRef.current)) {
      return;
    }

    if (!saveDisabled) {
      throttledSave(gameState, sudokuState);
      if (gameState.state === GameStateMachine.paused) {
        throttledSave.flush();
      }
    }

    const nextRoute = createRouteSearchForGameState(gameState, sudokuState, routeSudoku);

    if (nextRoute.key !== routeSudoku?.key) {
      syncedRouteKeyRef.current = nextRoute.key;
      navigate({
        replace: true,
        to: "/",
        search: nextRoute.search,
      });
    }
  }, [gameState, sudokuState, initialized, currentPath, routeSudoku, routeLoadFailed, navigate, saveDisabled]);

  React.useEffect(() => {
    if (currentPath !== "/") {
      return;
    }

    if (!routeSudoku && !routeLoadFailed) {
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

      if (routeLoadFailed || !routeSudoku) {
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

      const currentSudoku = cellsToSimpleSudoku(currentSudokuState.current);
      if (stringifySudoku(currentSudoku) === routeSudoku.sudoku && !routeSudoku.forceRestart) {
        syncedRouteKeyRef.current = routeSudoku.key;
        setInitialized(true);
        navigate({
          replace: true,
          to: "/",
          search: routeSudoku.search,
        });
        return;
      }

      console.info("Loading sudoku from URL", routeSudoku.sudokuIndex, routeSudoku.sudoku, routeSudoku.sudokuCollectionName);

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
        const solvedSudoku = routeSudoku.solution ?? solve(parsedSudoku).sudoku;
        if (solvedSudoku) {
          setSudoku(parsedSudoku, solvedSudoku);
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
      navigate({
        replace: true,
        to: "/",
        search: routeSudoku.search,
      });
    };

    void loadRouteSudoku();

    return () => {
      cancelled = true;
    };
  }, [
    currentPath,
    routeSudoku,
    routeLoadFailed,
    dialog,
    setGameState,
    setSudokuState,
    pauseGame,
    continueGame,
    newGame,
    setSudoku,
    replaceRouteWithGameState,
    navigate,
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
