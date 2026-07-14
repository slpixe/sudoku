import {
  projectPendingCommands,
  type RoomAction,
  type RoomBoard,
  type RoomCommand,
  type RoomError,
  type RoomEvent,
  type RoomSnapshot,
} from "@sudoku/multiplayer-protocol";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
export type SynchronizationStatus = "synced" | "resyncing";

export interface MultiplayerClientState {
  confirmed: RoomSnapshot | null;
  pending: RoomCommand[];
  connectionStatus: ConnectionStatus;
  syncStatus: SynchronizationStatus;
  requiredRevision: number | null;
  error: RoomError | null;
}

export type MultiplayerClientAction =
  | {type: "connectionStatusChanged"; status: ConnectionStatus}
  | {type: "commandQueued"; command: RoomCommand}
  | {type: "commandAcknowledged"; commandId: string; snapshot: RoomSnapshot}
  | {type: "commandRejected"; commandId: string; error: RoomError}
  | {type: "roomEventReceived"; event: RoomEvent}
  | {type: "snapshotReceived"; snapshot: RoomSnapshot}
  | {type: "errorReceived"; error: RoomError}
  | {type: "resyncRequested"}
  | {type: "errorCleared"};

export function createMultiplayerClientState(): MultiplayerClientState {
  return {
    confirmed: null,
    pending: [],
    connectionStatus: "connecting",
    syncStatus: "synced",
    requiredRevision: null,
    error: null,
  };
}

function withoutCommand(pending: RoomCommand[], commandId: string): RoomCommand[] {
  return pending.some((command) => command.commandId === commandId)
    ? pending.filter((command) => command.commandId !== commandId)
    : pending;
}

function snapshotFromEvent(confirmed: RoomSnapshot, event: RoomEvent): RoomSnapshot {
  return {
    ...confirmed,
    board: event.board,
    revision: event.revision,
    status: event.status,
    elapsedMs: event.elapsedMs,
    runningSince: event.runningSince,
    serverNow: event.serverNow,
    canUndo: event.canUndo,
  };
}

function raisedRevisionFloor(state: MultiplayerClientState, revision: number): number {
  return Math.max(state.requiredRevision ?? state.confirmed?.revision ?? 0, revision);
}

function reconcileSnapshot(
  state: MultiplayerClientState,
  snapshot: RoomSnapshot,
  pending: RoomCommand[] = state.pending,
): MultiplayerClientState {
  const sameRoom = state.confirmed?.roomCode === snapshot.roomCode;
  if (sameRoom && state.confirmed !== null && snapshot.revision < state.confirmed.revision) {
    return pending === state.pending ? state : {...state, pending};
  }

  const requiredRevision = sameRoom ? state.requiredRevision : null;
  const recovered = requiredRevision === null || snapshot.revision >= requiredRevision;
  return {
    ...state,
    confirmed: snapshot,
    pending,
    connectionStatus: "connected",
    syncStatus: recovered ? "synced" : "resyncing",
    requiredRevision: recovered ? null : requiredRevision,
    error: recovered ? null : state.error,
  };
}

export function multiplayerClientReducer(
  state: MultiplayerClientState,
  action: MultiplayerClientAction,
): MultiplayerClientState {
  switch (action.type) {
    case "connectionStatusChanged":
      return {...state, connectionStatus: action.status};

    case "commandQueued":
      return {
        ...state,
        pending: [...state.pending, action.command],
        error: null,
      };

    case "commandAcknowledged": {
      return reconcileSnapshot(state, action.snapshot, withoutCommand(state.pending, action.commandId));
    }

    case "commandRejected":
      return {
        ...state,
        pending: withoutCommand(state.pending, action.commandId),
        syncStatus: "resyncing",
        requiredRevision: raisedRevisionFloor(state, state.confirmed?.revision ?? 0),
        error: action.error,
      };

    case "roomEventReceived": {
      const pending = withoutCommand(state.pending, action.event.commandId);
      if (state.confirmed === null || state.syncStatus === "resyncing") {
        return {
          ...state,
          pending,
          syncStatus: "resyncing",
          requiredRevision: raisedRevisionFloor(state, action.event.revision),
        };
      }
      if (action.event.revision <= state.confirmed.revision) {
        return pending === state.pending ? state : {...state, pending};
      }
      if (action.event.revision !== state.confirmed.revision + 1) {
        return {
          ...state,
          pending,
          syncStatus: "resyncing",
          requiredRevision: raisedRevisionFloor(state, action.event.revision),
        };
      }
      return {
        ...state,
        confirmed: snapshotFromEvent(state.confirmed, action.event),
        pending,
        syncStatus: "synced",
        requiredRevision: null,
        error: null,
      };
    }

    case "snapshotReceived":
      return reconcileSnapshot(state, action.snapshot);

    case "errorReceived":
      return {...state, error: action.error};

    case "resyncRequested":
      return {
        ...state,
        syncStatus: "resyncing",
        requiredRevision: raisedRevisionFloor(state, state.confirmed?.revision ?? 0),
      };

    case "errorCleared":
      return {...state, error: null};
  }
}

export function projectMultiplayerBoard(
  state: Pick<MultiplayerClientState, "confirmed" | "pending">,
): RoomBoard | null {
  return state.confirmed === null ? null : projectPendingCommands(state.confirmed, state.pending);
}

export function createRoomCommand(roomCode: string, baseRevision: number, action: RoomAction): RoomCommand {
  return {
    commandId: crypto.randomUUID(),
    roomCode,
    baseRevision,
    action,
  };
}
