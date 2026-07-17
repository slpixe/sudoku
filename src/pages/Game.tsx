import * as React from "react";

import {useNavigate} from "@tanstack/react-router";
import {useGame} from "src/context/GameContext";
import {useSudoku} from "src/context/SudokuContext";
import {useUserPreferences} from "src/context/UserPrefencesContext";
import {solve} from "src/lib/engine/solverAC3";
import {cellsToSimpleSudoku, stringifySudoku} from "src/lib/engine/utility";
import {getSudokuPuzzleDisplayLabel} from "src/lib/game/collectionNames";
import {appPersistence} from "src/lib/persistence/appPersistence";

import {GameProviders} from "./Game/GameProviders";
import {SoloGameTimer} from "./Game/GameTimer";
import {GameView} from "./Game/GameView";
import {useActiveGameLock} from "./Game/useActiveGameLock";
import {useGameRouteSync} from "./Game/useGameRouteSync";
import {useSoloCompletionDetection} from "./Game/useSoloCompletionDetection";
import {useSoloVisibilityPause} from "./Game/useSoloVisibilityPause";

const GameCompletionPanel = React.lazy(() =>
  import("./Game/GameCompletionPanel").then((module) => ({default: module.GameCompletionPanel})),
);
const soloTimerContent = <SoloGameTimer />;

const GameWithRouteManagement = () => {
  const navigate = useNavigate();
  const {
    setGameState,
    state: gameState,
    continueGame,
    newGame,
    pauseGame,
    wonGame,
    showMenu,
    selectCell,
    activateNotesMode,
    deactivateNotesMode,
    resetGame,
    hideMenu,
    copyNotes,
  } = useGame();
  const {
    state: userPreferencesState,
    toggleShowConflicts,
    toggleShowOccurrences,
    toggleShowMatchingNumbers,
  } = useUserPreferences();
  const {
    setSudokuState,
    state: sudokuState,
    setSudoku,
    setNumber,
    setNotes,
    clearCell,
    getHint,
    undo,
    redo,
  } = useSudoku();
  const sudoku = sudokuState.current;
  const currentSudokuKey = React.useMemo(() => {
    return stringifySudoku(cellsToSimpleSudoku(sudoku));
  }, [sudoku]);
  const [activeGameLocked, setActiveGameLocked] = React.useState(false);
  const lockAndPauseGame = React.useCallback(() => {
    setActiveGameLocked(true);
    pauseGame();
  }, [pauseGame]);
  const claimRenderedSudoku = React.useCallback(
    (sudokuKey: string) => {
      if (sudokuKey === currentSudokuKey) {
        appPersistence.currentGame.save(gameState, sudokuState);
      }
      return appPersistence.activeGame.claim(sudokuKey);
    },
    [currentSudokuKey, gameState, sudokuState],
  );
  const routeSync = useGameRouteSync({
    gameState,
    sudokuState,
    setGameState,
    setSudokuState,
    setSudoku,
    newGame,
    pauseGame,
    continueGame,
    userPreferencesState,
    saveDisabled: activeGameLocked,
  });
  const activeGameLock = useActiveGameLock({
    currentSudokuKey,
    initialized: routeSync.initialized,
    pauseGame: lockAndPauseGame,
    claimActiveGame: claimRenderedSudoku,
    ownerId: appPersistence.activeGame.ownerId(),
    storageKey: appPersistence.activeGame.storageKey,
  });
  const activeSudokuKey = activeGameLock.activeSudokuKey;
  const clearActiveGameLock = activeGameLock.clearLock;
  const resumeActiveGameHere = activeGameLock.resumeThisPuzzleHere;
  const openStoredSudoku = routeSync.openStoredSudoku;

  React.useEffect(() => {
    setActiveGameLocked(activeGameLock.locked);
  }, [activeGameLock.locked]);

  useSoloCompletionDetection({
    cells: sudoku,
    routeReady: routeSync.initialized,
    onWon: wonGame,
  });

  useSoloVisibilityPause({
    locked: activeGameLock.locked,
    status: gameState.state,
    onPause: pauseGame,
    onResume: continueGame,
  });

  const switchToActivePuzzle = React.useCallback(() => {
    const storedSudokuKey = appPersistence.activeGame.load()?.sudokuKey ?? activeSudokuKey;
    if (!storedSudokuKey) {
      return;
    }

    if (openStoredSudoku(storedSudokuKey)) {
      appPersistence.activeGame.claim(storedSudokuKey);
      setActiveGameLocked(false);
      clearActiveGameLock();
    }
  }, [activeSudokuKey, clearActiveGameLock, openStoredSudoku]);

  const resumeThisPuzzleHere = React.useCallback(() => {
    resumeActiveGameHere();
    setActiveGameLocked(false);
    continueGame();
  }, [continueGame, resumeActiveGameHere]);

  const clearSoloGame = React.useCallback(() => {
    const simple = cellsToSimpleSudoku(sudoku);
    const solved = solve(simple);
    if (solved.sudoku) {
      setSudoku(simple, solved.sudoku);
    }
    resetGame();
  }, [resetGame, setSudoku, sudoku]);

  const chooseNewSoloGame = React.useCallback(() => {
    pauseGame();
    void navigate({to: "/select-game"});
  }, [navigate, pauseGame]);

  const canUndo = sudokuState.historyIndex < sudokuState.history.length - 1;
  const puzzleLabel = getSudokuPuzzleDisplayLabel(gameState.sudokuCollectionName, gameState.sudokuIndex + 1);
  const completionContent = gameState.won ? (
    <React.Suspense fallback={null}>
      <GameCompletionPanel
        previousTimes={gameState.previousTimes}
        secondsPlayed={gameState.secondsPlayed}
        sudokuCollectionName={gameState.sudokuCollectionName}
        sudokuIndex={gameState.sudokuIndex}
        timesSolved={gameState.timesSolved}
      />
    </React.Suspense>
  ) : null;

  return (
    <GameView
      activeCellCoordinates={gameState.activeCellCoordinates}
      blocked={false}
      canUndo={canUndo}
      cells={sudoku}
      clipboardNotes={gameState.clipboardNotes}
      completionContent={completionContent}
      locked={activeGameLock.locked}
      notesMode={gameState.notesMode}
      pauseForClearConfirmation
      preferences={userPreferencesState}
      puzzleLabel={puzzleLabel}
      showMenu={gameState.showMenu}
      status={gameState.state}
      timerContent={soloTimerContent}
      won={gameState.won}
      onActivateNotesMode={activateNotesMode}
      onClearCell={clearCell}
      onClearConfirmed={clearSoloGame}
      onCopyNotes={copyNotes}
      onDeactivateNotesMode={deactivateNotesMode}
      onHideMenu={hideMenu}
      onHint={getHint}
      onNewGame={chooseNewSoloGame}
      onPause={pauseGame}
      onRedo={redo}
      onResume={continueGame}
      onResumeThisPuzzleHere={resumeThisPuzzleHere}
      onSelectCell={selectCell}
      onSetNotes={setNotes}
      onSetNumber={setNumber}
      onShowMenu={showMenu}
      onSwitchToActivePuzzle={switchToActivePuzzle}
      onToggleShowConflicts={toggleShowConflicts}
      onToggleShowMatchingNumbers={toggleShowMatchingNumbers}
      onToggleShowOccurrences={toggleShowOccurrences}
      onUndo={undo}
    />
  );
};

const Game = () => {
  return (
    <GameProviders>
      <GameWithRouteManagement />
    </GameProviders>
  );
};

export default Game;
