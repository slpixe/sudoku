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
  setDisableAutoSync: (disabled: boolean) => void;
  copyNotes: (notes: number[]) => void;
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
  setDisableAutoSync,
  copyNotes,
}) => {
  const canUndo = sudokuState.historyIndex < sudokuState.history.length - 1;
  const sudoku = sudokuState.current;
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
  const activeCell = game.activeCellCoordinates
    ? sudoku.find((s) => {
        return s.x === game.activeCellCoordinates!.x && s.y === game.activeCellCoordinates!.y;
      })
    : undefined;

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
              showWrongEntries={userPreferencesState.showWrongEntries && game.state === GameStateMachine.running}
              showConflicts={userPreferencesState.showConflicts && game.state === GameStateMachine.running}
              notesMode={game.notesMode}
              shouldShowMenu={
                game.showMenu && userPreferencesState.showCircleMenu && game.state === GameStateMachine.running
              }
              sudoku={game.state === GameStateMachine.paused ? emptyGrid : sudoku}
              showMenu={showMenu}
              hideMenu={hideMenu}
              selectCell={selectCell}
              showHints={userPreferencesState.showHints && game.state === GameStateMachine.running}
              activeCell={game.state === GameStateMachine.running ? activeCell : undefined}
              setNumber={setNumber}
              setNotes={setNotes}
              clearNumber={clearCell}
            >
              {game.won && (
                <React.Suspense fallback={null}>
                  <GameWonOverlay game={game} setDisableAutoSync={setDisableAutoSync} />
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
                sudoku={sudokuState.current}
                showHints={userPreferencesState.showHints}
                setNumber={setNumber}
                setNotes={setNotes}
              />
              <SudokuMenuControls
                notesMode={game.notesMode}
                activeCellCoordinates={game.activeCellCoordinates}
                disabled={pausedGame}
                clearCell={clearCell}
                activateNotesMode={activateNotesMode}
                deactivateNotesMode={deactivateNotesMode}
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
  const {state: userPreferencesState} = useUserPreferences();
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
  const setDisableAutoSync = useGameRouteSync({
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
      setDisableAutoSync={setDisableAutoSync}
      copyNotes={copyNotes}
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
