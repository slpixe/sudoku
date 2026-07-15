import * as React from "react";
import type {CreateRoomRequest, RoomAck, RoomErrorCode} from "@sudoku/multiplayer-protocol";
import {useNavigate} from "@tanstack/react-router";
import {useTranslation} from "react-i18next";

import GameSelect from "./Game/GameSelect";
import {Container} from "src/components/Layout";
import Button from "../components/Button";
import {DarkModeButton} from "src/components/DarkModeButton";
import {stringifySudoku} from "src/lib/engine/utility";
import {getSudokuCollection, getSudokusPaginated} from "src/lib/game/sudokus";
import {isBaseCollectionId} from "src/lib/game/baseCollections";
import type {MultiplayerSocket} from "src/lib/multiplayer/createMultiplayerSocket";

import {OnlineRoomControls} from "./Game/OnlineRoomControls";
import type {PuzzleSelection, SelectGameMode} from "./Game/selectGameMode";

const CREATE_ROOM_PHASE_TIMEOUT_MS = 10_000;

interface CreateRoomAttempt {
  cancelled: boolean;
  cancelCurrentWait: (() => void) | null;
  socket: MultiplayerSocket | null;
}

function waitForSocketConnection(socket: MultiplayerSocket, attempt: CreateRoomAttempt): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      if (attempt.cancelCurrentWait === cancel) {
        attempt.cancelCurrentWait = null;
      }
    };
    const settle = (complete: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      complete();
    };
    const cancel = () => settle(() => reject(new Error("Room creation was cancelled")));
    const handleConnect = () => settle(resolve);
    const handleConnectError = (error: Error) => settle(() => reject(error));
    const timeoutId = window.setTimeout(
      () => settle(() => reject(new Error("Room connection timed out"))),
      CREATE_ROOM_PHASE_TIMEOUT_MS,
    );

    attempt.cancelCurrentWait = cancel;
    socket.once("connect", handleConnect);
    socket.once("connect_error", handleConnectError);
    socket.connect();
  });
}

function waitForCreateAcknowledgement(
  socket: MultiplayerSocket,
  attempt: CreateRoomAttempt,
  request: CreateRoomRequest,
): Promise<RoomAck> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      if (attempt.cancelCurrentWait === cancel) {
        attempt.cancelCurrentWait = null;
      }
    };
    const settle = (complete: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      complete();
    };
    const cancel = () => settle(() => reject(new Error("Room creation was cancelled")));
    const handleAcknowledgement = (acknowledgement: RoomAck) => settle(() => resolve(acknowledgement));
    const timeoutId = window.setTimeout(
      () => settle(() => reject(new Error("Room creation timed out"))),
      CREATE_ROOM_PHASE_TIMEOUT_MS,
    );

    attempt.cancelCurrentWait = cancel;
    socket.emit("room:create", request, handleAcknowledgement);
  });
}

function roomErrorKey(code: RoomErrorCode): string {
  switch (code) {
    case "ROOM_NOT_FOUND":
      return "multiplayer_room_invalid_or_expired";
    case "ROOM_EXPIRED":
      return "multiplayer_room_invalid_or_expired";
    case "ROOM_FULL":
      return "multiplayer_room_full";
    case "PUZZLE_VERSION_MISMATCH":
      return "multiplayer_puzzle_version_mismatch";
    default:
      return "multiplayer_service_unavailable";
  }
}

const SelectGame = () => {
  const navigate = useNavigate();
  const {t} = useTranslation();
  const [mode, setMode] = React.useState<SelectGameMode>("solo");
  const [online, setOnline] = React.useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [creating, setCreating] = React.useState(false);
  const creatingRef = React.useRef(false);
  const mountedRef = React.useRef(false);
  const activeCreateAttemptRef = React.useRef<CreateRoomAttempt | null>(null);
  const [onlineError, setOnlineError] = React.useState<string | null>(null);

  const finishCreateAttempt = React.useCallback((attempt: CreateRoomAttempt) => {
    if (activeCreateAttemptRef.current !== attempt) {
      return false;
    }

    activeCreateAttemptRef.current = null;
    attempt.cancelled = true;
    const cancelCurrentWait = attempt.cancelCurrentWait;
    attempt.cancelCurrentWait = null;
    cancelCurrentWait?.();
    const socket = attempt.socket;
    attempt.socket = null;
    socket?.disconnect();
    creatingRef.current = false;
    if (mountedRef.current) {
      setCreating(false);
    }
    return true;
  }, []);

  const cancelActiveCreateAttempt = React.useCallback(() => {
    const attempt = activeCreateAttemptRef.current;
    if (attempt) {
      finishCreateAttempt(attempt);
    }
  }, [finishCreateAttempt]);

  const isCurrentCreateAttempt = React.useCallback(
    (attempt: CreateRoomAttempt) =>
      mountedRef.current && activeCreateAttemptRef.current === attempt && !attempt.cancelled,
    [],
  );

  React.useEffect(() => {
    mountedRef.current = true;
    const handleOnline = () => setOnline(true);
    const handleOffline = () => {
      cancelActiveCreateAttempt();
      setOnline(false);
      setMode("solo");
      setOnlineError(null);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      mountedRef.current = false;
      cancelActiveCreateAttempt();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [cancelActiveCreateAttempt]);

  const goBack = () => {
    cancelActiveCreateAttempt();
    navigate({
      to: "/",
    });
  };

  const selectMode = (nextMode: SelectGameMode) => {
    if (nextMode !== "create-online") {
      cancelActiveCreateAttempt();
    }
    setMode(nextMode);
    setOnlineError(null);
  };

  const joinRoom = (roomCode: string) => {
    cancelActiveCreateAttempt();
    navigate({to: "/room/$code", params: {code: roomCode}});
  };

  const createOnlineRoom = async ({collectionId, puzzleNumber}: PuzzleSelection) => {
    if (creatingRef.current || !online || !isBaseCollectionId(collectionId)) {
      return;
    }

    creatingRef.current = true;
    const attempt: CreateRoomAttempt = {cancelled: false, cancelCurrentWait: null, socket: null};
    activeCreateAttemptRef.current = attempt;
    setCreating(true);
    setOnlineError(null);

    try {
      const collection = getSudokuCollection(collectionId);
      const selectedPuzzle = getSudokusPaginated(collection, puzzleNumber - 1, 1).sudokus[0];
      if (!selectedPuzzle) {
        throw new Error("Selected puzzle is unavailable");
      }

      const [{createMultiplayerSocket}, {getOrCreateBrowserGuestId}] = await Promise.all([
        import("src/lib/multiplayer/createMultiplayerSocket"),
        import("src/lib/multiplayer/guestIdentity"),
      ]);
      if (!isCurrentCreateAttempt(attempt)) {
        return;
      }

      const socket = createMultiplayerSocket();
      attempt.socket = socket;

      await waitForSocketConnection(socket, attempt);
      if (!isCurrentCreateAttempt(attempt)) {
        return;
      }

      const acknowledgement = await waitForCreateAcknowledgement(socket, attempt, {
        collectionId,
        connectionId: crypto.randomUUID(),
        guestId: getOrCreateBrowserGuestId(),
        puzzleFingerprint: stringifySudoku(selectedPuzzle.sudoku),
        puzzleNumber,
      });
      if (!isCurrentCreateAttempt(attempt)) {
        return;
      }

      if (!acknowledgement.ok) {
        setOnlineError(t(roomErrorKey(acknowledgement.error.code)));
        return;
      }

      const roomCode = acknowledgement.snapshot.roomCode;
      if (finishCreateAttempt(attempt) && mountedRef.current) {
        navigate({to: "/room/$code", params: {code: roomCode}});
      }
    } catch {
      if (isCurrentCreateAttempt(attempt)) {
        setOnlineError(t("multiplayer_service_unavailable"));
      }
    } finally {
      finishCreateAttempt(attempt);
    }
  };

  return (
    <Container className="mt-4">
      <div className="mb-8 flex flex-col gap-2">
        <div className="flex gap-4 items-center justify-between">
          <h1 className="text-2xl text-white">{t("select_game_title")}</h1>
          <div className="flex gap-2">
            <DarkModeButton />
            <Button
              className="bg-teal-600 dark:bg-teal-600 text-white flex-shrink-0"
              data-testid="select-game-back"
              onClick={goBack}
            >
              {"◀ " + t("go_back")}
            </Button>
          </div>
        </div>
        <p className="text-gray-300">{t("select_game_subtitle")}</p>
      </div>
      <OnlineRoomControls
        creating={creating}
        error={onlineError}
        mode={mode}
        online={online}
        onJoin={joinRoom}
        onModeChange={selectMode}
      />
      {mode !== "join-online" ? (
        <GameSelect
          baseCollectionsOnly={mode === "create-online"}
          selectionDisabled={creating}
          showProgress={mode === "solo"}
          onSelect={mode === "create-online" ? createOnlineRoom : undefined}
        />
      ) : null}
    </Container>
  );
};

export default SelectGame;
