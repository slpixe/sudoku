import type {RoomAction, RoomBoard, RoomSnapshot} from "@sudoku/multiplayer-protocol";
import * as React from "react";

import {Container} from "src/components/Layout";
import {GameStateMachine} from "src/context/GameContext";
import {useUserPreferences} from "src/context/UserPrefencesContext";
import type {Cell, CellCoordinates} from "src/lib/engine/types";
import {getCellIndex} from "src/lib/game/deriveBoardData";
import {getSudokuCollectionDisplayName} from "src/lib/game/collectionNames";
import type {UseMultiplayerRoomResult} from "src/lib/multiplayer/useMultiplayerRoom";

import {GameTimer} from "./GameTimer";
import {GameView} from "./GameView";
import {MultiplayerCompletionPanel} from "./MultiplayerCompletionPanel";
import {type CopyState, MultiplayerStatus} from "./MultiplayerStatus";

const noop = () => {};

export function roomBoardToCells(board: RoomBoard): Cell[] {
  return board.givens.map((given, index) => ({
    x: index % 9,
    y: Math.floor(index / 9),
    initial: given !== 0,
    number: given !== 0 ? given : board.values[index] ?? 0,
    notes: [...(board.notes[index] ?? [])],
    solution: board.solution[index] ?? 0,
  }));
}

function MultiplayerGameTimer({snapshot}: {snapshot: RoomSnapshot}) {
  const {elapsedMs, revision, runningSince, serverNow, status} = snapshot;
  const clockOffset = React.useMemo(() => serverNow - Date.now(), [serverNow]);
  const [localNow, setLocalNow] = React.useState(Date.now);

  React.useEffect(() => {
    setLocalNow(Date.now());
    if (status !== "running" || runningSince === null) {
      return;
    }
    const timer = window.setInterval(() => setLocalNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [revision, runningSince, serverNow, status]);

  const projectedElapsedMs =
    elapsedMs +
    (status === "running" && runningSince !== null ? Math.max(0, localNow + clockOffset - runningSince) : 0);

  return <GameTimer elapsedSeconds={projectedElapsedMs / 1000} />;
}

export interface MultiplayerGameControllerProps {
  room: UseMultiplayerRoomResult;
  roomCode: string;
  onNewGame: () => void;
  onRetry: () => void;
}

export function MultiplayerGameController({room, roomCode, onNewGame, onRetry}: MultiplayerGameControllerProps) {
  const {
    state: preferences,
    toggleShowConflicts,
    toggleShowMatchingNumbers,
    toggleShowOccurrences,
  } = useUserPreferences();
  const [activeCellCoordinates, setActiveCellCoordinates] = React.useState<CellCoordinates>();
  const [showMenu, setShowMenu] = React.useState(false);
  const [notesMode, setNotesMode] = React.useState(false);
  const [clipboardNotes, setClipboardNotes] = React.useState<number[] | null>(null);
  const [copyState, setCopyState] = React.useState<CopyState>("idle");
  const copyResetTimerRef = React.useRef<number | null>(null);
  const copyRequestGenerationRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const announceActiveCell = room.announceActiveCell;
  const confirmed = room.confirmed;
  const blocked = room.status !== "connected" || room.error !== null;
  const visibleBoard = blocked ? confirmed?.board : room.projected ?? confirmed?.board;
  const cells = React.useMemo(() => (visibleBoard ? roomBoardToCells(visibleBoard) : null), [visibleBoard]);
  const partnerCellCoordinates =
    room.partnerCellIndex === null
      ? undefined
      : {x: room.partnerCellIndex % 9, y: Math.floor(room.partnerCellIndex / 9)};

  const selectCell = React.useCallback(
    (coordinates: CellCoordinates) => {
      setActiveCellCoordinates(coordinates);
      announceActiveCell(getCellIndex(coordinates));
    },
    [announceActiveCell],
  );

  const send = room.send;
  const sendAction = React.useCallback(
    (action: RoomAction) => {
      send(action);
    },
    [send],
  );

  const sendCellAction = React.useCallback(
    (coordinates: CellCoordinates, createAction: (cellIndex: number) => RoomAction) => {
      const cellIndex = getCellIndex(coordinates);
      if (blocked || cells?.[cellIndex]?.initial !== false) {
        return;
      }
      send(createAction(cellIndex));
    },
    [blocked, cells, send],
  );

  const showCopyState = React.useCallback((nextState: Exclude<CopyState, "idle">) => {
    if (!mountedRef.current) {
      return;
    }
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    setCopyState(nextState);
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetTimerRef.current = null;
    }, 2_000);
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      copyRequestGenerationRef.current += 1;
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
        copyResetTimerRef.current = null;
      }
    };
  }, []);

  const copyRoomLink = React.useCallback(async () => {
    const requestGeneration = copyRequestGenerationRef.current + 1;
    copyRequestGenerationRef.current = requestGeneration;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(window.location.href);
      if (!mountedRef.current || requestGeneration !== copyRequestGenerationRef.current) {
        return;
      }
      showCopyState("copied");
    } catch {
      if (!mountedRef.current || requestGeneration !== copyRequestGenerationRef.current) {
        return;
      }
      showCopyState("failed");
    }
  }, [showCopyState]);

  const statusContent = (
    <MultiplayerStatus
      copyState={copyState}
      error={room.error}
      online={room.online}
      presence={room.presence}
      roomCode={roomCode}
      status={room.status}
      onCopyLink={() => void copyRoomLink()}
      onRetry={onRetry}
    />
  );

  if (!confirmed || !cells) {
    return (
      <Container>
        <MultiplayerStatus
          copyState={copyState}
          error={room.error}
          online={room.online}
          presence={room.presence}
          roomCode={roomCode}
          status={room.status}
          onCopyLink={() => void copyRoomLink()}
          onRetry={onRetry}
        />
      </Container>
    );
  }

  const won = confirmed.status === "completed";
  const gameStatus = confirmed.status === "running" ? GameStateMachine.running : GameStateMachine.paused;
  const completionContent = won ? (
    <MultiplayerCompletionPanel elapsedMs={confirmed.elapsedMs} onNewGame={onNewGame} />
  ) : null;

  return (
    <GameView
      activeCellCoordinates={activeCellCoordinates}
      blocked={blocked}
      canUndo={confirmed.canUndo}
      clearWhenInactive
      cells={cells}
      clipboardNotes={clipboardNotes}
      collectionName={getSudokuCollectionDisplayName(confirmed.collectionId)}
      completionContent={completionContent}
      locked={false}
      notesMode={notesMode}
      partnerCellCoordinates={partnerCellCoordinates}
      pauseForClearConfirmation={false}
      preferences={preferences}
      showMenu={showMenu}
      status={gameStatus}
      statusContent={statusContent}
      sudokuIndex={confirmed.puzzleNumber - 1}
      timerContent={<MultiplayerGameTimer snapshot={confirmed} />}
      won={won}
      onActivateNotesMode={() => setNotesMode(true)}
      onClearCell={(coordinates) => sendCellAction(coordinates, (cellIndex) => ({type: "clearCell", cellIndex}))}
      onClearConfirmed={() => sendAction({type: "clear"})}
      onCopyNotes={(notes) => setClipboardNotes([...notes])}
      onDeactivateNotesMode={() => setNotesMode(false)}
      onHideMenu={() => setShowMenu(false)}
      onHint={(coordinates) => sendCellAction(coordinates, (cellIndex) => ({type: "hint", cellIndex}))}
      onNewGame={onNewGame}
      onPause={() => sendAction({type: "pause"})}
      onRedo={noop}
      onResume={() => {
        if (confirmed.status === "paused") {
          sendAction({type: "resume"});
        }
      }}
      onResumeThisPuzzleHere={noop}
      onSelectCell={selectCell}
      onSetNotes={(coordinates, notes) =>
        sendCellAction(coordinates, (cellIndex) => ({type: "setNotes", cellIndex, notes: [...notes]}))
      }
      onSetNumber={(coordinates, number) =>
        sendCellAction(coordinates, (cellIndex) => ({type: "setNumber", cellIndex, number}))
      }
      onShowMenu={() => setShowMenu(true)}
      onSwitchToActivePuzzle={noop}
      onToggleShowConflicts={toggleShowConflicts}
      onToggleShowMatchingNumbers={toggleShowMatchingNumbers}
      onToggleShowOccurrences={toggleShowOccurrences}
      onUndo={() => sendAction({type: "undo"})}
    />
  );
}
