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
  error: RoomError | null;
  send: (action: RoomAction) => RoomCommand | null;
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
  const [clientState, setClientState] = React.useState<MultiplayerClientState>(createMultiplayerClientState);
  const [presence, setPresence] = React.useState<0 | 1 | 2>(0);
  const clientStateRef = React.useRef(clientState);
  const submitCommandRef = React.useRef<(command: RoomCommand) => void>(() => {});
  const lastReplayKeyRef = React.useRef<string | null>(null);
  const activeRoomCodeRef = React.useRef(roomCode);

  let renderedClientState = clientState;
  let renderedPresence = presence;
  if (activeRoomCodeRef.current !== roomCode) {
    activeRoomCodeRef.current = roomCode;
    const maskedState = createMultiplayerClientState();
    clientStateRef.current = maskedState;
    submitCommandRef.current = () => {};
    lastReplayKeyRef.current = null;
    renderedClientState = maskedState;
    renderedPresence = 0;
  }

  const dispatch = React.useCallback((action: MultiplayerClientAction): MultiplayerClientState => {
    const nextState = multiplayerClientReducer(clientStateRef.current, action);
    clientStateRef.current = nextState;
    setClientState(nextState);
    return nextState;
  }, []);

  React.useEffect(() => {
    const resetState = createMultiplayerClientState();
    clientStateRef.current = resetState;
    setClientState(resetState);
    setPresence(0);
    lastReplayKeyRef.current = null;

    let active = true;
    let terminal = false;
    let snapshotRequestGeneration = 0;

    const ownsActiveRoom = (): boolean => active && activeRoomCodeRef.current === roomCode;

    const restartForSnapshot = (): void => {
      if (!ownsActiveRoom() || terminal) {
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
          setPresence(result.snapshot.connectedGuests);
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
      setPresence(nextState.confirmed.connectedGuests);
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
      if (ownsActiveRoom() && !terminal) {
        dispatch({type: "connectionStatusChanged", status: "reconnecting"});
      }
    };

    const handleConnectError = (error: Error): void => {
      if (!ownsActiveRoom()) {
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
        setPresence(nextPresence.connectedGuests);
      }
    };

    const handleRoomError = (error: RoomError): void => {
      if (ownsActiveRoom()) {
        dispatch({type: "errorReceived", error});
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("room:snapshot", handleSnapshot);
    socket.on("room:event", handleRoomEvent);
    socket.on("room:presence", handlePresence);
    socket.on("room:error", handleRoomError);
    socket.connect();

    return () => {
      active = false;
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
      submitCommandRef.current = () => {};
      socket.disconnect();
    };
  }, [connectionId, dispatch, guestId, roomCode, socket]);

  const send = React.useCallback(
    (action: RoomAction): RoomCommand | null => {
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
    error: renderedClientState.error,
    send,
  };
}
