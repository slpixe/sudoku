import * as React from "react";

import {useGame, GameStateMachine, GameState} from "src/context/GameContext";
import {emptyGrid, SudokuState, useSudoku} from "src/context/SudokuContext";

import {Sudoku} from "src/components/sudoku/Sudoku";

import SudokuGame from "src/lib/game/SudokuGame";
import SudokuMenuNumbers from "src/components/sudoku/SudokuMenuNumbers";
import SudokuMenuControls from "src/components/sudoku/SudokuMenuControls";
import {Container} from "src/components/Layout";
import Shortcuts from "./Game/shortcuts/Shortcuts";
import type {UserPreferences} from "src/lib/database/userPreferences";
import {CellCoordinates, SimpleSudoku} from "src/lib/engine/types";
import {useUserPreferences} from "src/context/UserPrefencesContext";
import {ContinueOverlay} from "./Game/ContinueOverlay";
import {GameHeader} from "./Game/GameHeader";
import {GameProviders} from "./Game/GameProviders";
import {ActiveGameLockOverlay} from "./Game/ActiveGameLockOverlay";
import {useActiveGameLock} from "./Game/useActiveGameLock";
import {useGameRouteSync} from "./Game/useGameRouteSync";
import {getSudokuCollectionDisplayName} from "src/lib/game/collectionNames";
import {deriveBoardData} from "src/lib/game/deriveBoardData";
import {appPersistence} from "src/lib/persistence/appPersistence";
import {cellsToSimpleSudoku, stringifySudoku} from "src/lib/engine/utility";

const GameCompletionPanel = React.lazy(() =>
  import("./Game/GameCompletionPanel").then((module) => ({default: module.GameCompletionPanel})),
);

const GameInner: React.FC<{
  sudokuState: SudokuState;
  setSudoku: (sudoku: SimpleSudoku, solvedSudoku: SimpleSudoku) => void;
  setNumber: (cellCoordinates: CellCoordinates, number: number) => void;
  setNotes: (cellCoordinates: CellCoordinates, notes: number[]) => void;
  clearCell: (cellCoordinates: CellCoordinates) => void;
  getHint: (cellCoordinates: CellCoordinates) => void;
  undo: () => void;
  redo: () => void;
  game: GameState;
  userPreferencesState: UserPreferences;
  pauseGame: () => void;
  continueGame: () => void;
  wonGame: () => void;
  showMenu: () => void;
  selectCell: (cellCoordinates: CellCoordinates) => void;
  activateNotesMode: () => void;
  hideMenu: () => void;
  resetGame: () => void;
  deactivateNotesMode: () => void;
  copyNotes: (notes: number[]) => void;
  toggleShowConflicts: () => void;
  toggleShowOccurrences: () => void;
  toggleShowMatchingNumbers: () => void;
  locked: boolean;
  switchToActivePuzzle: () => void;
  resumeThisPuzzleHere: () => void;
}> = ({
  sudokuState,
  setSudoku,
  setNumber,
  setNotes,
  clearCell,
  getHint,
  undo,
  redo,
  game,
  userPreferencesState,
  pauseGame,
  continueGame,
  wonGame,
  showMenu,
  selectCell,
  activateNotesMode,
  hideMenu,
  resetGame,
  deactivateNotesMode,
  copyNotes,
  toggleShowConflicts,
  toggleShowOccurrences,
  toggleShowMatchingNumbers,
  locked,
  switchToActivePuzzle,
  resumeThisPuzzleHere,
}) => {
  const canUndo = sudokuState.historyIndex < sudokuState.history.length - 1;
  const sudoku = sudokuState.current;
  const activeCellX = game.activeCellCoordinates?.x;
  const activeCellY = game.activeCellCoordinates?.y;
  const boardData = React.useMemo(() => {
    const activeCellCoordinates =
      activeCellX === undefined || activeCellY === undefined ? undefined : {x: activeCellX, y: activeCellY};

    return deriveBoardData(sudoku, activeCellCoordinates);
  }, [sudoku, activeCellX, activeCellY]);
  const emptyBoardData = React.useMemo(() => {
    return deriveBoardData(emptyGrid);
  }, []);
  const collectionName = React.useMemo(() => {
    return getSudokuCollectionDisplayName(game.sudokuCollectionName);
  }, [game.sudokuCollectionName]);
  const pausedGame = game.state === GameStateMachine.paused;
  const activeCell = boardData.activeCell;
  const lockedGame = locked && !game.won;
  const hideBoardForPause = pausedGame && !game.won;
  const hideBoardForLock = lockedGame;
  const displayedSudoku = hideBoardForPause || hideBoardForLock ? emptyGrid : sudoku;
  const displayedBoardData = hideBoardForPause || hideBoardForLock ? emptyBoardData : boardData;
  const lockedGameRef = React.useRef(lockedGame);

  React.useEffect(() => {
    lockedGameRef.current = lockedGame;
  }, [lockedGame]);

  React.useEffect(() => {
    const isSolved = SudokuGame.isSolved(sudoku);
    if (isSolved) {
      wonGame();
    }
  }, [sudoku, wonGame]);
  const onVisibilityChange = React.useCallback(() => {
    if (document.visibilityState === "hidden") {
      pauseGame();
    } else {
      if (lockedGame) {
        return;
      }
      // So the user knows that it was paused, we wait a bit before continuing.
      setTimeout(() => {
        if (lockedGameRef.current) {
          return;
        }
        continueGame();
      }, 200);
    }
  }, [lockedGame, pauseGame, continueGame]);

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange, false);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange, false);
      }
    };
  }, [onVisibilityChange]);

  return (
    <Container>
      <div>
        {!lockedGame ? (
          <Shortcuts
            gameState={game.state}
            continueGame={continueGame}
            pauseGame={pauseGame}
            activateNotesMode={activateNotesMode}
            deactivateNotesMode={deactivateNotesMode}
            setNumber={setNumber}
            clearNumber={clearCell}
            getHint={getHint}
            setNotes={setNotes}
            undo={undo}
            redo={redo}
            boardData={boardData}
            sudoku={sudoku}
            activeCell={activeCell}
            notesMode={game.notesMode}
            showHints={userPreferencesState.showHints}
            selectCell={selectCell}
            clipboardNotes={game.clipboardNotes}
            copyNotes={copyNotes}
          />
        ) : null}
        <div className="flex justify-center">
          <main className={`sudoku-game-layout${game.won ? " sudoku-game-layout-complete" : ""} mt-3 grid w-full gap-3`}>
            <GameHeader
              game={game}
              sudokuState={sudokuState}
              collectionName={collectionName}
              pauseGame={pauseGame}
              continueGame={continueGame}
              setSudoku={setSudoku}
              resetGame={resetGame}
              canUndo={canUndo}
              undo={undo}
              locked={lockedGame}
            />
            <div className="sudoku-board-panel min-w-0">
              <Sudoku
                boardData={displayedBoardData}
                showWrongEntries={userPreferencesState.showWrongEntries && game.state === GameStateMachine.running}
                showConflicts={userPreferencesState.showConflicts && game.state === GameStateMachine.running}
                showMatchingNumbers={userPreferencesState.showMatchingNumbers && game.state === GameStateMachine.running}
                notesMode={game.notesMode}
                shouldShowMenu={
                  !lockedGame &&
                  game.showMenu &&
                  userPreferencesState.showCircleMenu &&
                  game.state === GameStateMachine.running
                }
                sudoku={displayedSudoku}
                showMenu={showMenu}
                hideMenu={hideMenu}
                selectCell={selectCell}
                showHints={userPreferencesState.showHints && game.state === GameStateMachine.running}
                setNumber={setNumber}
                setNotes={setNotes}
                clearNumber={clearCell}
              >
                <ContinueOverlay visible={!lockedGame && pausedGame && !game.won} onClick={continueGame} />
                <ActiveGameLockOverlay
                  visible={lockedGame}
                  onSwitchToActivePuzzle={switchToActivePuzzle}
                  onResumeThisPuzzleHere={resumeThisPuzzleHere}
                />
              </Sudoku>
            </div>
            {game.won ? (
              <div className="sudoku-completion-pad min-w-0">
                <React.Suspense fallback={null}>
                  <GameCompletionPanel game={game} />
                </React.Suspense>
              </div>
            ) : (
              <>
                <div className="sudoku-number-pad min-w-0">
                  <SudokuMenuNumbers
                    layout="row"
                    notesMode={game.notesMode}
                    disabled={pausedGame || lockedGame}
                    showOccurrences={userPreferencesState.showOccurrences}
                    activeCell={game.activeCellCoordinates}
                    boardData={boardData}
                    showHints={userPreferencesState.showHints}
                    setNumber={setNumber}
                    setNotes={setNotes}
                  />
                </div>
                <div className="sudoku-control-pad min-w-0">
                  <SudokuMenuControls
                    notesMode={game.notesMode}
                    activeCellCoordinates={game.activeCellCoordinates}
                    disabled={pausedGame || lockedGame}
                    showConflicts={userPreferencesState.showConflicts}
                    showOccurrences={userPreferencesState.showOccurrences}
                    showMatchingNumbers={userPreferencesState.showMatchingNumbers}
                    clearCell={clearCell}
                    activateNotesMode={activateNotesMode}
                    deactivateNotesMode={deactivateNotesMode}
                    toggleShowConflicts={toggleShowConflicts}
                    toggleShowOccurrences={toggleShowOccurrences}
                    toggleShowMatchingNumbers={toggleShowMatchingNumbers}
                    getHint={getHint}
                    canUndo={canUndo}
                    undo={undo}
                  />
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </Container>
  );
};

const GameWithRouteManagement = () => {
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
  const {state: userPreferencesState, toggleShowConflicts, toggleShowOccurrences, toggleShowMatchingNumbers} =
    useUserPreferences();
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
  const currentSudokuKey = React.useMemo(() => {
    return stringifySudoku(cellsToSimpleSudoku(sudokuState.current));
  }, [sudokuState]);
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

  React.useEffect(() => {
    setActiveGameLocked(activeGameLock.locked);
  }, [activeGameLock.locked]);

  const switchToActivePuzzle = React.useCallback(() => {
    if (!activeGameLock.activeSudokuKey) {
      return;
    }

    if (routeSync.openStoredSudoku(activeGameLock.activeSudokuKey)) {
      appPersistence.activeGame.claim(activeGameLock.activeSudokuKey);
      setActiveGameLocked(false);
      activeGameLock.clearLock();
    }
  }, [activeGameLock, routeSync]);

  const resumeThisPuzzleHere = React.useCallback(() => {
    activeGameLock.resumeThisPuzzleHere();
    setActiveGameLocked(false);
    continueGame();
  }, [activeGameLock, continueGame]);

  return (
    <GameInner
      sudokuState={sudokuState}
      setSudoku={setSudoku}
      setNumber={setNumber}
      setNotes={setNotes}
      clearCell={clearCell}
      getHint={getHint}
      undo={undo}
      redo={redo}
      game={gameState}
      userPreferencesState={userPreferencesState}
      pauseGame={pauseGame}
      continueGame={continueGame}
      wonGame={wonGame}
      showMenu={showMenu}
      selectCell={selectCell}
      activateNotesMode={activateNotesMode}
      hideMenu={hideMenu}
      resetGame={resetGame}
      deactivateNotesMode={deactivateNotesMode}
      copyNotes={copyNotes}
      toggleShowConflicts={toggleShowConflicts}
      toggleShowOccurrences={toggleShowOccurrences}
      toggleShowMatchingNumbers={toggleShowMatchingNumbers}
      locked={activeGameLock.locked}
      switchToActivePuzzle={switchToActivePuzzle}
      resumeThisPuzzleHere={resumeThisPuzzleHere}
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
