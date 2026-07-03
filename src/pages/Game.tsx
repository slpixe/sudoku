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
import {useGameRouteSync} from "./Game/useGameRouteSync";
import {getSudokuCollectionDisplayName} from "src/lib/game/collectionNames";
import {deriveBoardData} from "src/lib/game/deriveBoardData";

const GameWonOverlay = React.lazy(() =>
  import("./Game/GameWonOverlay").then((module) => ({default: module.GameWonOverlay})),
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
      // So the user knows that it was paused, we wait a bit before continuing.
      setTimeout(() => {
        continueGame();
      }, 200);
    }
  }, [pauseGame, continueGame]);

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

  const pausedGame = game.state === GameStateMachine.paused;
  const activeCell = boardData.activeCell;
  const displayedSudoku = pausedGame ? emptyGrid : sudoku;
  const displayedBoardData = pausedGame ? emptyBoardData : boardData;

  return (
    <Container>
      <div>
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
        <GameHeader
          game={game}
          sudokuState={sudokuState}
          collectionName={collectionName}
          pauseGame={pauseGame}
          continueGame={continueGame}
          setSudoku={setSudoku}
          resetGame={resetGame}
        />
        <div className="flex justify-center">
          <main className="mt-4 w-full max-w-3xl">
            <Sudoku
              boardData={displayedBoardData}
              showWrongEntries={userPreferencesState.showWrongEntries && game.state === GameStateMachine.running}
              showConflicts={userPreferencesState.showConflicts && game.state === GameStateMachine.running}
              notesMode={game.notesMode}
              shouldShowMenu={
                game.showMenu && userPreferencesState.showCircleMenu && game.state === GameStateMachine.running
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
              {game.won && (
                <React.Suspense fallback={null}>
                  <GameWonOverlay game={game} />
                </React.Suspense>
              )}

              <ContinueOverlay visible={pausedGame && !game.won} onClick={continueGame} />
            </Sudoku>
            <div className="mt-3 grid gap-3">
              <SudokuMenuNumbers
                layout="row"
                notesMode={game.notesMode}
                disabled={pausedGame}
                showOccurrences={userPreferencesState.showOccurrences}
                activeCell={game.activeCellCoordinates}
                boardData={boardData}
                showHints={userPreferencesState.showHints}
                setNumber={setNumber}
                setNotes={setNotes}
              />
              <SudokuMenuControls
                notesMode={game.notesMode}
                activeCellCoordinates={game.activeCellCoordinates}
                disabled={pausedGame}
                showConflicts={userPreferencesState.showConflicts}
                showOccurrences={userPreferencesState.showOccurrences}
                clearCell={clearCell}
                activateNotesMode={activateNotesMode}
                deactivateNotesMode={deactivateNotesMode}
                toggleShowConflicts={toggleShowConflicts}
                toggleShowOccurrences={toggleShowOccurrences}
                getHint={getHint}
                canUndo={canUndo}
                undo={undo}
              />
            </div>
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
  const {state: userPreferencesState, toggleShowConflicts, toggleShowOccurrences} = useUserPreferences();
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
  useGameRouteSync({
    gameState,
    sudokuState,
    setGameState,
    setSudokuState,
    setSudoku,
    newGame,
    continueGame,
    userPreferencesState,
  });

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
