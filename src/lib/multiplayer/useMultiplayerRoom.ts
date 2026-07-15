import type {RoomAck, RoomAction, RoomCommand, RoomError, RoomEvent, RoomSnapshot} from "@sudoku/multiplayer-protocol";
import * as React from "react";

import {
  createMultiplayerClientState,
  createRoomCommand,
  multiplayerClientReducer,
  projectMultiplayerBoard,
  type ConnectionStatus,
  type MultiplayerClientAction,
  type MultiplayerClientState,
} from "./clientState";
import {createMultiplayerSocket, type MultiplayerSocket} from "./createMultiplayerSocket";
import {getOrCreateBrowserGuestId, getOrCreateGuestId} from "./guestIdentity";

export type MultiplayerRoomStatus = ConnectionStatus | "resyncing";

export interface UseMultiplayerRoomOptions {
  storage?: Storage;
  socketFactory?: () => MultiplayerSocket;
}

export interface UseMultiplayerRoomResult {
  confirmed: RoomSnapshot | null;
  projected: ReturnType<typeof projectMultiplayerBoard>;
  status: MultiplayerRoomStatus;
  presence: 0 | 1 | 2;
  online: boolean;
  error: RoomError | null;
  send: (action: RoomAction) => RoomCommand | null;
}

interface RoomScopedClientState {
  roomCode: string;
  state: MultiplayerClientState;
}

interface RoomScopedPresence {
  roomCode: string;
  presence: 0 | 1 | 2;
}

function connectionError(error: Error & {data?: unknown}): RoomError {
  const data = error.data;
  if (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    typeof data.code === "string" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data as RoomError;
  }
  return {code: "SERVICE_UNAVAILABLE", message: error.message || "The multiplayer service is unavailable"};
}

function browserIsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function useMultiplayerRoom(
  roomCode: string,
  options: UseMultiplayerRoomOptions = {},
): UseMultiplayerRoomResult {
  const storage = options.storage;
  const socketFactory = options.socketFactory;
  const [guestId] = React.useState(() =>
    storage === undefined ? getOrCreateBrowserGuestId() : getOrCreateGuestId(storage),
  );
  const [connectionId] = React.useState(() => crypto.randomUUID());
  const [socket] = React.useState(() => (socketFactory ?? createMultiplayerSocket)());
  const [scopedClientState, setScopedClientState] = React.useState<RoomScopedClientState>(() => ({
    roomCode,
    state: createMultiplayerClientState(),
  }));
  const [scopedPresence, setScopedPresence] = React.useState<RoomScopedPresence>(() => ({
    roomCode,
    presence: 0,
  }));
  const [online, setOnline] = React.useState(browserIsOnline);
  const clientStateRef = React.useRef(scopedClientState.state);
  const submitCommandRef = React.useRef<(command: RoomCommand) => void>(() => {});
  const lastReplayKeyRef = React.useRef<string | null>(null);
  const committedRoomCodeRef = React.useRef<string | null>(null);

  const renderedClientState =
    scopedClientState.roomCode === roomCode ? scopedClientState.state : createMultiplayerClientState();
  const renderedPresence = scopedPresence.roomCode === roomCode ? scopedPresence.presence : 0;

  const dispatch = React.useCallback((action: MultiplayerClientAction): MultiplayerClientState => {
    const nextState = multiplayerClientReducer(clientStateRef.current, action);
    const committedRoomCode = committedRoomCodeRef.current;
    clientStateRef.current = nextState;
    if (committedRoomCode !== null) {
      setScopedClientState({roomCode: committedRoomCode, state: nextState});
    }
    return nextState;
  }, []);

  React.useEffect(() => {
    const resetState = createMultiplayerClientState();
    committedRoomCodeRef.current = roomCode;
    clientStateRef.current = resetState;
    setScopedClientState({roomCode, state: resetState});
    setScopedPresence({roomCode, presence: 0});
    lastReplayKeyRef.current = null;

    let active = true;
    let terminal = false;
    let browserOnline = browserIsOnline();
    let snapshotRequestGeneration = 0;

    const ownsActiveRoom = (): boolean => active && committedRoomCodeRef.current === roomCode;

    const restartForSnapshot = (): void => {
      if (!ownsActiveRoom() || terminal || !browserOnline) {
        return;
      }
      lastReplayKeyRef.current = null;
      socket.disconnect();
      socket.connect();
    };

    const handleCommandAcknowledgement = (command: RoomCommand, result: RoomAck): void => {
      if (!ownsActiveRoom()) {
        return;
      }
      if (result.ok) {
        const nextState = dispatch({
          type: "commandAcknowledged",
          commandId: command.commandId,
          snapshot: result.snapshot,
        });
        if (nextState.requiredRevision !== null) {
          restartForSnapshot();
          return;
        }
        if (nextState.confirmed === result.snapshot) {
          setScopedPresence({roomCode, presence: result.snapshot.connectedGuests});
        }
        return;
      }
      dispatch({
        type: "commandRejected",
        commandId: command.commandId,
        error: result.error,
      });
      restartForSnapshot();
    };

    const submitCommand = (command: RoomCommand): void => {
      socket.emit("room:command", command, (result) => handleCommandAcknowledgement(command, result));
    };
    submitCommandRef.current = submitCommand;

    const replayPending = (snapshot: RoomSnapshot): void => {
      const pending = clientStateRef.current.pending;
      const replayKey = `${snapshot.roomCode}:${snapshot.revision}:${pending
        .map((command) => command.commandId)
        .join(",")}`;
      if (lastReplayKeyRef.current === replayKey) {
        return;
      }
      lastReplayKeyRef.current = replayKey;
      pending.forEach(submitCommand);
    };

    const handleSnapshot = (snapshot: RoomSnapshot): void => {
      if (!ownsActiveRoom() || terminal || snapshot.roomCode !== roomCode) {
        return;
      }
      const previousState = clientStateRef.current;
      const nextState = dispatch({type: "snapshotReceived", snapshot});
      if (nextState.requiredRevision !== null) {
        restartForSnapshot();
        return;
      }
      if (nextState === previousState || nextState.confirmed === null) {
        return;
      }
      setScopedPresence({roomCode, presence: nextState.confirmed.connectedGuests});
      replayPending(nextState.confirmed);
    };

    const requestSnapshot = (): void => {
      if (!ownsActiveRoom() || terminal) {
        return;
      }
      const requestGeneration = ++snapshotRequestGeneration;
      socket.emit("room:join", {guestId, connectionId, roomCode}, (result) => {
        if (!ownsActiveRoom() || terminal || requestGeneration !== snapshotRequestGeneration) {
          return;
        }
        if (result.ok) {
          handleSnapshot(result.snapshot);
          return;
        }
        dispatch({type: "errorReceived", error: result.error});
        dispatch({type: "connectionStatusChanged", status: "disconnected"});
      });
    };

    const handleConnect = (): void => {
      if (terminal) {
        return;
      }
      lastReplayKeyRef.current = null;
      requestSnapshot();
    };

    const handleDisconnect = (): void => {
      if (ownsActiveRoom() && !terminal && browserOnline) {
        dispatch({type: "connectionStatusChanged", status: "reconnecting"});
      }
    };

    const handleConnectError = (error: Error): void => {
      if (!ownsActiveRoom()) {
        return;
      }
      if (!browserOnline) {
        dispatch({type: "connectionStatusChanged", status: "disconnected"});
        return;
      }
      const roomError = connectionError(error);
      dispatch({type: "errorReceived", error: roomError});
      if (roomError.code === "VERSION_MISMATCH") {
        terminal = true;
        dispatch({type: "connectionStatusChanged", status: "disconnected"});
        socket.disconnect();
        return;
      }
      dispatch({type: "connectionStatusChanged", status: "reconnecting"});
    };

    const handleRoomEvent = (event: RoomEvent): void => {
      if (!ownsActiveRoom()) {
        return;
      }
      const currentRevision = clientStateRef.current.confirmed?.revision;
      const hasGap = currentRevision === undefined || event.revision > currentRevision + 1;
      dispatch({type: "roomEventReceived", event});
      if (hasGap) {
        restartForSnapshot();
      }
    };

    const handlePresence = (nextPresence: {connectedGuests: 0 | 1 | 2}): void => {
      if (ownsActiveRoom()) {
        setScopedPresence({roomCode, presence: nextPresence.connectedGuests});
      }
    };

    const handleRoomError = (error: RoomError): void => {
      if (ownsActiveRoom()) {
        dispatch({type: "errorReceived", error});
      }
    };

    const handleOffline = (): void => {
      if (!ownsActiveRoom()) {
        return;
      }
      browserOnline = false;
      setOnline(false);
      dispatch({type: "connectionStatusChanged", status: "disconnected"});
      socket.disconnect();
    };

    const handleOnline = (): void => {
      if (!ownsActiveRoom() || terminal || browserOnline) {
        return;
      }
      browserOnline = true;
      setOnline(true);
      dispatch({type: "errorCleared"});
      dispatch({
        type: "connectionStatusChanged",
        status: clientStateRef.current.confirmed === null ? "connecting" : "reconnecting",
      });
      socket.connect();
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("room:snapshot", handleSnapshot);
    socket.on("room:event", handleRoomEvent);
    socket.on("room:presence", handlePresence);
    socket.on("room:error", handleRoomError);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    setOnline(browserOnline);
    if (browserOnline) {
      socket.connect();
    } else {
      dispatch({type: "connectionStatusChanged", status: "disconnected"});
    }

    return () => {
      active = false;
      if (committedRoomCodeRef.current === roomCode) {
        committedRoomCodeRef.current = null;
      }
      if (socket.connected) {
        socket.emit("room:leave", {roomCode, connectionId});
      }
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("room:snapshot", handleSnapshot);
      socket.off("room:event", handleRoomEvent);
      socket.off("room:presence", handlePresence);
      socket.off("room:error", handleRoomError);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      submitCommandRef.current = () => {};
      socket.disconnect();
    };
  }, [connectionId, dispatch, guestId, roomCode, socket]);

  const send = React.useCallback(
    (action: RoomAction): RoomCommand | null => {
      if (committedRoomCodeRef.current !== roomCode) {
        return null;
      }
      const current = clientStateRef.current;
      if (current.confirmed === null || current.connectionStatus !== "connected" || current.syncStatus !== "synced") {
        return null;
      }
      const command = createRoomCommand(roomCode, current.confirmed.revision, action);
      dispatch({type: "commandQueued", command});
      submitCommandRef.current(command);
      return command;
    },
    [dispatch, roomCode],
  );

  const confirmed = renderedClientState.confirmed;
  const pending = renderedClientState.pending;
  const projected = React.useMemo(() => projectMultiplayerBoard({confirmed, pending}), [confirmed, pending]);
  const status: MultiplayerRoomStatus =
    renderedClientState.connectionStatus === "disconnected"
      ? "disconnected"
      : renderedClientState.syncStatus === "resyncing"
        ? "resyncing"
        : renderedClientState.connectionStatus;

  return {
    confirmed,
    projected,
    status,
    presence: renderedPresence,
    online,
    error: renderedClientState.error,
    send,
  };
}
