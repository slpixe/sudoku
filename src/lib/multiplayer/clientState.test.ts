import type {RoomAction, RoomBoard, RoomCommand, RoomEvent, RoomSnapshot} from "@sudoku/multiplayer-protocol";
import {describe, expect, it} from "vitest";

import {
  createMultiplayerClientState,
  createRoomCommand,
  multiplayerClientReducer,
  projectMultiplayerBoard,
} from "./clientState";

function createBoard(): RoomBoard {
  return {
    givens: Array<number>(81).fill(0),
    solution: Array<number>(81).fill(9),
    values: Array<number>(81).fill(0),
    notes: Array.from({length: 81}, () => []),
  };
}

function createSnapshot(revision = 0, board = createBoard(), roomCode = "ABC234"): RoomSnapshot {
  return {
    roomCode,
    collectionId: "easy",
    puzzleNumber: 1,
    board,
    revision,
    status: "running",
    elapsedMs: 0,
    runningSince: null,
    serverNow: 1_000,
    canUndo: false,
    connectedGuests: 1,
    expiresAt: "2026-07-15T00:00:00.000Z",
  };
}

function createCommand(index: number, action: RoomAction): RoomCommand {
  return {
    commandId: `123e4567-e89b-42d3-a456-${String(426614174000 + index).padStart(12, "0")}`,
    roomCode: "ABC234",
    baseRevision: 0,
    action,
  };
}

function createEvent(command: RoomCommand, revision: number, board: RoomBoard): RoomEvent {
  return {
    commandId: command.commandId,
    action: command.action,
    revision,
    board,
    status: "running",
    elapsedMs: 0,
    runningSince: 1_000,
    serverNow: 1_100,
    canUndo: true,
  };
}

function withSnapshot(snapshot = createSnapshot()) {
  return multiplayerClientReducer(createMultiplayerClientState(), {type: "snapshotReceived", snapshot});
}

describe("multiplayerClientReducer", () => {
  it("creates a command with a cryptographically generated UUID and the confirmed base revision", () => {
    const command = createRoomCommand("ABC234", 7, {type: "pause"});

    expect(command.commandId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(command).toMatchObject({roomCode: "ABC234", baseRevision: 7, action: {type: "pause"}});
  });

  it("projects a queued local command optimistically without changing the confirmed snapshot", () => {
    const command = createCommand(1, {type: "setNumber", cellIndex: 10, number: 7});

    const state = multiplayerClientReducer(withSnapshot(), {type: "commandQueued", command});

    expect(state.pending).toEqual([command]);
    expect(state.confirmed?.board.values[10]).toBe(0);
    expect(projectMultiplayerBoard(state)?.values[10]).toBe(7);
  });

  it("removes an acknowledged command and accepts its authoritative snapshot", () => {
    const command = createCommand(2, {type: "setNumber", cellIndex: 12, number: 4});
    const queued = multiplayerClientReducer(withSnapshot(), {type: "commandQueued", command});
    const board = createBoard();
    board.values[12] = 4;

    const state = multiplayerClientReducer(queued, {
      type: "commandAcknowledged",
      commandId: command.commandId,
      snapshot: createSnapshot(1, board),
    });

    expect(state.pending).toEqual([]);
    expect(state.confirmed?.revision).toBe(1);
    expect(state.confirmed?.board.values[12]).toBe(4);
  });

  it("applies a contiguous remote event and removes a matching pending command", () => {
    const command = createCommand(3, {type: "setNotes", cellIndex: 20, notes: [2, 6]});
    const queued = multiplayerClientReducer(withSnapshot(), {type: "commandQueued", command});
    const board = createBoard();
    board.notes[20] = [2, 6];

    const state = multiplayerClientReducer(queued, {
      type: "roomEventReceived",
      event: createEvent(command, 1, board),
    });

    expect(state.confirmed?.revision).toBe(1);
    expect(state.confirmed?.board.notes[20]).toEqual([2, 6]);
    expect(state.pending).toEqual([]);
    expect(state.syncStatus).toBe("synced");
  });

  it("enters resyncing without applying an event that skips a revision", () => {
    const remoteCommand = createCommand(4, {type: "setNumber", cellIndex: 7, number: 8});
    const board = createBoard();
    board.values[7] = 8;

    const state = multiplayerClientReducer(withSnapshot(createSnapshot(2)), {
      type: "roomEventReceived",
      event: createEvent(remoteCommand, 4, board),
    });

    expect(state.syncStatus).toBe("resyncing");
    expect(state.confirmed?.revision).toBe(2);
    expect(state.confirmed?.board.values[7]).toBe(0);
  });

  it("rolls back a rejected optimistic command and marks the state for resynchronization", () => {
    const command = createCommand(5, {type: "setNumber", cellIndex: 30, number: 5});
    const queued = multiplayerClientReducer(withSnapshot(), {type: "commandQueued", command});
    const error = {code: "COMMAND_REJECTED" as const, message: "The command was rejected"};

    const state = multiplayerClientReducer(queued, {
      type: "commandRejected",
      commandId: command.commandId,
      error,
    });

    expect(state.pending).toEqual([]);
    expect(projectMultiplayerBoard(state)?.values[30]).toBe(0);
    expect(state.syncStatus).toBe("resyncing");
    expect(state.error).toEqual(error);
  });

  it("replaces confirmed state from a full snapshot and replays remaining pending commands", () => {
    const first = createCommand(6, {type: "setNumber", cellIndex: 40, number: 3});
    const second = createCommand(7, {type: "setNotes", cellIndex: 41, notes: [1, 5]});
    let state = multiplayerClientReducer(withSnapshot(), {type: "commandQueued", command: first});
    state = multiplayerClientReducer(state, {type: "commandQueued", command: second});
    const replacementBoard = createBoard();
    replacementBoard.values[2] = 6;

    state = multiplayerClientReducer(state, {
      type: "snapshotReceived",
      snapshot: createSnapshot(5, replacementBoard),
    });

    expect(state.confirmed?.revision).toBe(5);
    expect(state.pending).toEqual([first, second]);
    expect(state.syncStatus).toBe("synced");
    expect(projectMultiplayerBoard(state)?.values[2]).toBe(6);
    expect(projectMultiplayerBoard(state)?.values[40]).toBe(3);
    expect(projectMultiplayerBoard(state)?.notes[41]).toEqual([1, 5]);
  });

  it("does not let a stale same-room snapshot rewind confirmed state or clear resyncing", () => {
    const pending = createCommand(9, {type: "setNumber", cellIndex: 60, number: 4});
    let state = multiplayerClientReducer(withSnapshot(createSnapshot(5)), {
      type: "commandQueued",
      command: pending,
    });
    state = multiplayerClientReducer(state, {type: "resyncRequested"});
    const staleBoard = createBoard();
    staleBoard.values[1] = 8;

    const staleResult = multiplayerClientReducer(state, {
      type: "snapshotReceived",
      snapshot: createSnapshot(4, staleBoard),
    });

    expect(staleResult).toBe(state);
    expect(staleResult.confirmed?.revision).toBe(5);
    expect(staleResult.confirmed?.board.values[1]).toBe(0);
    expect(staleResult.pending).toEqual([pending]);
    expect(staleResult.syncStatus).toBe("resyncing");
  });

  it("accepts an equal-revision recovery snapshot and a lower revision for a different room", () => {
    let state = multiplayerClientReducer(withSnapshot(createSnapshot(5)), {type: "resyncRequested"});
    const duplicateBoard = createBoard();
    duplicateBoard.values[2] = 7;

    state = multiplayerClientReducer(state, {
      type: "snapshotReceived",
      snapshot: createSnapshot(5, duplicateBoard),
    });

    expect(state.confirmed?.revision).toBe(5);
    expect(state.confirmed?.board.values[2]).toBe(7);
    expect(state.syncStatus).toBe("synced");

    state = multiplayerClientReducer(state, {
      type: "snapshotReceived",
      snapshot: createSnapshot(0, createBoard(), "DEF567"),
    });

    expect(state.confirmed?.roomCode).toBe("DEF567");
    expect(state.confirmed?.revision).toBe(0);
  });

  it("ignores duplicate events after removing a matching pending command", () => {
    const command = createCommand(8, {type: "setNumber", cellIndex: 50, number: 2});
    const board = createBoard();
    board.values[50] = 2;
    const confirmed = withSnapshot(createSnapshot(3, board));
    const queued = multiplayerClientReducer(confirmed, {type: "commandQueued", command});

    const state = multiplayerClientReducer(queued, {
      type: "roomEventReceived",
      event: createEvent(command, 3, board),
    });

    expect(state.confirmed).toBe(confirmed.confirmed);
    expect(state.pending).toEqual([]);
    expect(state.syncStatus).toBe("synced");
  });
});
