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
      const staleSnapshot =
        state.confirmed !== null &&
        state.confirmed.roomCode === action.snapshot.roomCode &&
        action.snapshot.revision < state.confirmed.revision;
      if (staleSnapshot) {
        const pending = withoutCommand(state.pending, action.commandId);
        return pending === state.pending ? state : {...state, pending};
      }
      return {
        ...state,
        confirmed: action.snapshot,
        pending: withoutCommand(state.pending, action.commandId),
        connectionStatus: "connected",
        syncStatus: "synced",
        error: null,
      };
    }

    case "commandRejected":
      return {
        ...state,
        pending: withoutCommand(state.pending, action.commandId),
        syncStatus: "resyncing",
        error: action.error,
      };

    case "roomEventReceived": {
      const pending = withoutCommand(state.pending, action.event.commandId);
      if (state.confirmed === null || state.syncStatus === "resyncing") {
        return {...state, pending, syncStatus: "resyncing"};
      }
      if (action.event.revision <= state.confirmed.revision) {
        return pending === state.pending ? state : {...state, pending};
      }
      if (action.event.revision !== state.confirmed.revision + 1) {
        return {...state, pending, syncStatus: "resyncing"};
      }
      return {
        ...state,
        confirmed: snapshotFromEvent(state.confirmed, action.event),
        pending,
        syncStatus: "synced",
        error: null,
      };
    }

    case "snapshotReceived":
      if (
        state.confirmed !== null &&
        state.confirmed.roomCode === action.snapshot.roomCode &&
        action.snapshot.revision < state.confirmed.revision
      ) {
        return state;
      }
      return {
        ...state,
        confirmed: action.snapshot,
        connectionStatus: "connected",
        syncStatus: "synced",
        error: null,
      };

    case "errorReceived":
      return {...state, error: action.error};

    case "resyncRequested":
      return {...state, syncStatus: "resyncing"};

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
