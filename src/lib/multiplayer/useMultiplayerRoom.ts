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
import {getOrCreateGuestId} from "./guestIdentity";

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

function browserStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("Multiplayer rooms require browser storage");
  }
  return window.localStorage;
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
  const [guestId] = React.useState(() => getOrCreateGuestId(storage ?? browserStorage()));
  const [connectionId] = React.useState(() => crypto.randomUUID());
  const [socket] = React.useState(() => (socketFactory ?? createMultiplayerSocket)());
  const [clientState, setClientState] = React.useState<MultiplayerClientState>(createMultiplayerClientState);
  const [presence, setPresence] = React.useState<0 | 1 | 2>(0);
  const clientStateRef = React.useRef(clientState);
  const submitCommandRef = React.useRef<(command: RoomCommand) => void>(() => {});
  const lastReplayKeyRef = React.useRef<string | null>(null);

  const dispatch = React.useCallback((action: MultiplayerClientAction) => {
    const nextState = multiplayerClientReducer(clientStateRef.current, action);
    clientStateRef.current = nextState;
    setClientState(nextState);
  }, []);

  React.useEffect(() => {
    let active = true;

    const restartForSnapshot = (): void => {
      if (!active) {
        return;
      }
      lastReplayKeyRef.current = null;
      socket.disconnect();
      socket.connect();
    };

    const handleCommandAcknowledgement = (command: RoomCommand, result: RoomAck): void => {
      if (!active) {
        return;
      }
      if (result.ok) {
        dispatch({
          type: "commandAcknowledged",
          commandId: command.commandId,
          snapshot: result.snapshot,
        });
        setPresence(result.snapshot.connectedGuests);
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
      if (!active) {
        return;
      }
      dispatch({type: "snapshotReceived", snapshot});
      setPresence(snapshot.connectedGuests);
      replayPending(snapshot);
    };

    const requestSnapshot = (): void => {
      socket.emit("room:join", {guestId, connectionId, roomCode}, (result) => {
        if (!active) {
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
      lastReplayKeyRef.current = null;
      requestSnapshot();
    };

    const handleDisconnect = (): void => {
      if (active) {
        dispatch({type: "connectionStatusChanged", status: "reconnecting"});
      }
    };

    const handleConnectError = (error: Error): void => {
      if (!active) {
        return;
      }
      dispatch({type: "errorReceived", error: connectionError(error)});
      dispatch({type: "connectionStatusChanged", status: "reconnecting"});
    };

    const handleRoomEvent = (event: RoomEvent): void => {
      if (!active) {
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
      if (active) {
        setPresence(nextPresence.connectedGuests);
      }
    };

    const handleRoomError = (error: RoomError): void => {
      if (active) {
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

  const confirmed = clientState.confirmed;
  const pending = clientState.pending;
  const projected = React.useMemo(() => projectMultiplayerBoard({confirmed, pending}), [confirmed, pending]);
  const status: MultiplayerRoomStatus =
    clientState.syncStatus === "resyncing" ? "resyncing" : clientState.connectionStatus;

  return {
    confirmed,
    projected,
    status,
    presence,
    error: clientState.error,
    send,
  };
}
