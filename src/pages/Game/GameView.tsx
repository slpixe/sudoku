import * as React from "react";

import {Container} from "src/components/Layout";
import {Sudoku} from "src/components/sudoku/Sudoku";
import SudokuMenuControls from "src/components/sudoku/SudokuMenuControls";
import SudokuMenuNumbers from "src/components/sudoku/SudokuMenuNumbers";
import {GameStateMachine} from "src/context/GameContext";
import {emptyGrid} from "src/context/SudokuContext";
import type {UserPreferences} from "src/lib/database/userPreferences";
import type {Cell, CellCoordinates} from "src/lib/engine/types";
import {deriveBoardData} from "src/lib/game/deriveBoardData";

import {ActiveGameLockOverlay} from "./ActiveGameLockOverlay";
import {ContinueOverlay} from "./ContinueOverlay";
import {GameHeader} from "./GameHeader";
import Shortcuts from "./shortcuts/Shortcuts";

const emptyBoardData = deriveBoardData(emptyGrid);

export type GameViewProps = {
  activeCellCoordinates: CellCoordinates | undefined;
  blocked: boolean;
  canUndo: boolean;
  clearWhenInactive?: boolean;
  cells: Cell[];
  clipboardNotes: number[] | null;
  completionContent: React.ReactNode;
  locked: boolean;
  notesMode: boolean;
  partnerCellCoordinates?: CellCoordinates;
  pauseForClearConfirmation: boolean;
  preferences: UserPreferences;
  puzzleLabel: string;
  showMenu: boolean;
  status: GameStateMachine;
  statusContent?: React.ReactNode;
  timerContent: React.ReactNode;
  won: boolean;
  onActivateNotesMode: () => void;
  onClearCell: (cellCoordinates: CellCoordinates) => void;
  onClearConfirmed: () => void;
  onCopyNotes: (notes: number[]) => void;
  onDeactivateNotesMode: () => void;
  onHideMenu: () => void;
  onHint: (cellCoordinates: CellCoordinates) => void;
  onNewGame: () => void;
  onPause: () => void;
  onRedo: () => void;
  onResume: () => void;
  onResumeThisPuzzleHere: () => void;
  onSelectCell: (cellCoordinates: CellCoordinates) => void;
  onSetNotes: (cellCoordinates: CellCoordinates, notes: number[]) => void;
  onSetNumber: (cellCoordinates: CellCoordinates, number: number) => void;
  onShowMenu: (showNotes?: boolean) => void;
  onSwitchToActivePuzzle: () => void;
  onToggleShowConflicts: () => void;
  onToggleShowMatchingNumbers: () => void;
  onToggleShowOccurrences: () => void;
  onUndo: () => void;
};

export function GameView({
  activeCellCoordinates,
  blocked,
  canUndo,
  clearWhenInactive = false,
  cells,
  clipboardNotes,
  completionContent,
  locked,
  notesMode,
  partnerCellCoordinates,
  pauseForClearConfirmation,
  preferences,
  puzzleLabel,
  showMenu,
  status,
  statusContent,
  timerContent,
  won,
  onActivateNotesMode,
  onClearCell,
  onClearConfirmed,
  onCopyNotes,
  onDeactivateNotesMode,
  onHideMenu,
  onHint,
  onNewGame,
  onPause,
  onRedo,
  onResume,
  onResumeThisPuzzleHere,
  onSelectCell,
  onSetNotes,
  onSetNumber,
  onShowMenu,
  onSwitchToActivePuzzle,
  onToggleShowConflicts,
  onToggleShowMatchingNumbers,
  onToggleShowOccurrences,
  onUndo,
}: GameViewProps) {
  const activeCellX = activeCellCoordinates?.x;
  const activeCellY = activeCellCoordinates?.y;
  const boardData = React.useMemo(() => {
    const activeCell =
      activeCellX === undefined || activeCellY === undefined ? undefined : {x: activeCellX, y: activeCellY};

    return deriveBoardData(cells, activeCell);
  }, [cells, activeCellX, activeCellY]);
  const [notesHeld, setNotesHeld] = React.useState(false);
  const noteHoldUsedRef = React.useRef(false);
  const paused = status === GameStateMachine.paused;
  const activeCell = boardData.activeCell;
  const lockedGame = locked && !won;
  const hideBoard = (paused && !won) || lockedGame;
  const displayedCells = hideBoard ? emptyGrid : cells;
  const displayedBoardData = hideBoard ? emptyBoardData : boardData;
  const effectiveNotesMode = notesMode || notesHeld;
  const interactionsBlocked = blocked || lockedGame;

  const startNoteHold = React.useCallback(() => {
    noteHoldUsedRef.current = false;
    setNotesHeld(true);
  }, []);

  const stopNoteHold = React.useCallback(() => {
    setNotesHeld(false);
  }, []);

  const markNoteHoldUsed = React.useCallback(() => {
    if (notesHeld) {
      noteHoldUsedRef.current = true;
    }
  }, [notesHeld]);

  const consumeNoteHoldClick = React.useCallback(() => {
    if (!noteHoldUsedRef.current) {
      return false;
    }
    noteHoldUsedRef.current = false;
    return true;
  }, []);

  return (
    <Container>
      <div>
        {statusContent}
        {!interactionsBlocked ? (
          <Shortcuts
            activeCell={activeCell}
            activateNotesMode={onActivateNotesMode}
            boardData={boardData}
            clearNumber={onClearCell}
            clipboardNotes={clipboardNotes}
            continueGame={onResume}
            copyNotes={onCopyNotes}
            deactivateNotesMode={onDeactivateNotesMode}
            gameState={status}
            getHint={onHint}
            notesMode={notesMode}
            pauseGame={onPause}
            redo={onRedo}
            selectCell={onSelectCell}
            setNotes={onSetNotes}
            setNumber={onSetNumber}
            showHints={preferences.showHints}
            sudoku={cells}
            undo={onUndo}
          />
        ) : null}
        <div className="flex justify-center">
          <main className={`sudoku-game-layout${won ? " sudoku-game-layout-complete" : ""} mt-3 grid w-full gap-3`}>
            <GameHeader
              blocked={blocked}
              canUndo={canUndo}
              clearWhenInactive={clearWhenInactive}
              locked={lockedGame}
              pauseForClearConfirmation={pauseForClearConfirmation}
              puzzleLabel={puzzleLabel}
              status={status}
              timerContent={timerContent}
              won={won}
              onClearConfirmed={onClearConfirmed}
              onNewGame={onNewGame}
              onPause={onPause}
              onResume={onResume}
              onUndo={onUndo}
            />
            <div className="sudoku-board-panel min-w-0">
              <Sudoku
                boardData={displayedBoardData}
                clearNumber={onClearCell}
                hideMenu={onHideMenu}
                notesMode={effectiveNotesMode}
                partnerCellCoordinates={hideBoard ? undefined : partnerCellCoordinates}
                selectCell={onSelectCell}
                setNotes={onSetNotes}
                setNumber={onSetNumber}
                shouldShowMenu={
                  !interactionsBlocked && showMenu && preferences.showCircleMenu && status === GameStateMachine.running
                }
                showConflicts={preferences.showConflicts && status === GameStateMachine.running}
                showHints={preferences.showHints && status === GameStateMachine.running}
                showMatchingNumbers={preferences.showMatchingNumbers && status === GameStateMachine.running}
                showMenu={onShowMenu}
                showWrongEntries={preferences.showWrongEntries && status === GameStateMachine.running}
                sudoku={displayedCells}
              >
                <ContinueOverlay visible={!interactionsBlocked && paused && !won} onClick={onResume} />
                <ActiveGameLockOverlay
                  visible={lockedGame}
                  onResumeThisPuzzleHere={onResumeThisPuzzleHere}
                  onSwitchToActivePuzzle={onSwitchToActivePuzzle}
                />
              </Sudoku>
            </div>
            {won ? (
              <div className="sudoku-completion-pad min-w-0">{completionContent}</div>
            ) : (
              <>
                <div className="sudoku-number-pad min-w-0">
                  <SudokuMenuNumbers
                    activeCell={activeCellCoordinates}
                    boardData={boardData}
                    disabled={paused || interactionsBlocked}
                    layout="row"
                    notesMode={effectiveNotesMode}
                    onNoteInput={markNoteHoldUsed}
                    setNotes={onSetNotes}
                    setNumber={onSetNumber}
                    showHints={preferences.showHints}
                    showOccurrences={preferences.showOccurrences}
                  />
                </div>
                <div className="sudoku-control-pad min-w-0">
                  <SudokuMenuControls
                    activateNotesMode={onActivateNotesMode}
                    activeCellCoordinates={activeCellCoordinates}
                    canUndo={canUndo}
                    clearCell={onClearCell}
                    deactivateNotesMode={onDeactivateNotesMode}
                    disabled={paused || interactionsBlocked}
                    getHint={onHint}
                    notesMode={effectiveNotesMode}
                    onNoteHoldEnd={stopNoteHold}
                    onNoteHoldStart={startNoteHold}
                    persistentNotesMode={notesMode}
                    shouldSuppressToggleClick={consumeNoteHoldClick}
                    showConflicts={preferences.showConflicts}
                    showMatchingNumbers={preferences.showMatchingNumbers}
                    showOccurrences={preferences.showOccurrences}
                    toggleShowConflicts={onToggleShowConflicts}
                    toggleShowMatchingNumbers={onToggleShowMatchingNumbers}
                    toggleShowOccurrences={onToggleShowOccurrences}
                    undo={onUndo}
                  />
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </Container>
  );
}
