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

export function shouldClaimCurrentSudoku({
  initialized,
  locked,
  lastClaimedSudokuKey,
  currentSudokuKey,
}: {
  initialized: boolean;
  locked: boolean;
  lastClaimedSudokuKey: string | undefined;
  currentSudokuKey: string;
}) {
  return initialized && !locked && lastClaimedSudokuKey !== currentSudokuKey;
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
  const lastClaimedSudokuKeyRef = React.useRef<string | undefined>();

  const claimCurrentSudoku = React.useCallback(() => {
    claimActiveGame(currentSudokuKey);
    lastClaimedSudokuKeyRef.current = currentSudokuKey;
  }, [claimActiveGame, currentSudokuKey]);

  React.useEffect(() => {
    if (
      !shouldClaimCurrentSudoku({
        initialized,
        locked: lockState.locked,
        lastClaimedSudokuKey: lastClaimedSudokuKeyRef.current,
        currentSudokuKey,
      })
    ) {
      return;
    }

    claimCurrentSudoku();
  }, [claimCurrentSudoku, currentSudokuKey, initialized, lockState.locked]);

  React.useEffect(() => {
    if (!initialized || typeof window === "undefined") {
      return;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }

      const activeGame = parseActiveGameRecord(event.newValue);
      if (activeGame === undefined || !shouldLockForActiveGame(activeGame, ownerId, currentSudokuKey)) {
        return;
      }

      pauseGame();
      setLockState({locked: true, activeSudokuKey: activeGame.sudokuKey});
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [currentSudokuKey, initialized, ownerId, pauseGame, storageKey]);

  const resumeThisPuzzleHere = React.useCallback(() => {
    claimCurrentSudoku();
    setLockState({locked: false});
  }, [claimCurrentSudoku]);

  const clearLock = React.useCallback(() => {
    setLockState({locked: false});
  }, []);

  return {
    ...lockState,
    resumeThisPuzzleHere,
    clearLock,
  };
}
