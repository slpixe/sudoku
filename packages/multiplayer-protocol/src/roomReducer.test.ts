import {describe, expect, it} from "vitest";

import {projectPendingCommands} from "./clientProjection.js";
import {applyBoardAction, applyInverse} from "./roomReducer.js";
import type {BoardAction, RoomBoard, RoomCommand, RoomSnapshot} from "./types.js";

function createBoard(): RoomBoard {
  return {
    givens: Array<number>(81).fill(0),
    solution: Array<number>(81).fill(1),
    values: Array<number>(81).fill(0),
    notes: Array.from({length: 81}, () => []),
  };
}

function createSnapshot(board: RoomBoard): RoomSnapshot {
  return {
    roomCode: "ABC234",
    collectionId: "easy",
    puzzleNumber: 1,
    board,
    revision: 0,
    status: "running",
    timerStarted: true,
    elapsedMs: 0,
    runningSince: 1_000,
    serverNow: 1_000,
    canUndo: false,
    connectedGuests: 1,
    expiresAt: "2026-07-13T00:00:00.000Z",
  };
}

function pending(action: RoomCommand["action"], index: number): RoomCommand {
  return {
    commandId: `123e4567-e89b-42d3-a456-42661417400${index}`,
    roomCode: "ABC234",
    baseRevision: index,
    action,
  };
}

describe("applyBoardAction", () => {
  it("sets a number and clears matching notes from row, column, and box peers", () => {
    const board = createBoard();
    board.notes[0] = [4, 8];
    board.notes[1] = [4, 5];
    board.notes[9] = [4];
    board.notes[10] = [4, 6];
    board.notes[40] = [4];

    const result = applyBoardAction(board, {type: "setNumber", cellIndex: 0, number: 4});

    expect(result.board.values[0]).toBe(4);
    expect(result.board.notes[0]).toEqual([]);
    expect(result.board.notes[1]).toEqual([5]);
    expect(result.board.notes[9]).toEqual([]);
    expect(result.board.notes[10]).toEqual([6]);
    expect(result.board.notes[40]).toEqual([4]);
    expect(board.values[0]).toBe(0);
    expect(board.notes[1]).toEqual([4, 5]);
  });

  it("sorts and deduplicates valid notes", () => {
    const result = applyBoardAction(createBoard(), {
      type: "setNotes",
      cellIndex: 12,
      notes: [9, 2, 5, 2, 9],
    });

    expect(result.board.notes[12]).toEqual([2, 5, 9]);
    expect(result.board.values[12]).toBe(0);
  });

  for (const notes of [[0], [10], [1, 2.5]]) {
    it(`rejects invalid notes ${notes.join(", ")}`, () => {
      expect(() => applyBoardAction(createBoard(), {type: "setNotes", cellIndex: 12, notes})).toThrow();
    });
  }

  it("does not change a given", () => {
    const board = createBoard();
    board.givens[12] = 6;
    board.values[12] = 6;
    board.solution[12] = 6;

    const actions: BoardAction[] = [
      {type: "setNumber", cellIndex: 12, number: 3},
      {type: "setNotes", cellIndex: 12, notes: [3]},
      {type: "clearCell", cellIndex: 12},
      {type: "hint", cellIndex: 12},
    ];

    for (const action of actions) {
      const result = applyBoardAction(board, action);
      expect(result.board).toEqual(board);
      expect(result.inverse.cells).toEqual([]);
    }
  });

  it("uses the canonical solution value for a hint", () => {
    const board = createBoard();
    board.solution[22] = 7;
    board.notes[22] = [1, 7];

    const result = applyBoardAction(board, {type: "hint", cellIndex: 22});

    expect(result.board.values[22]).toBe(7);
    expect(result.board.notes[22]).toEqual([]);
  });

  it("clears a playable cell and can restore it", () => {
    const board = createBoard();
    board.values[17] = 5;
    board.notes[17] = [2, 8];

    const result = applyBoardAction(board, {type: "clearCell", cellIndex: 17});

    expect(result.board.values[17]).toBe(0);
    expect(result.board.notes[17]).toEqual([]);
    expect(applyInverse(result.board, result.inverse)).toEqual(board);
  });

  it("applies an inverse that restores every directly and indirectly changed cell", () => {
    const board = createBoard();
    board.values[0] = 2;
    board.notes[0] = [4, 8];
    board.notes[1] = [4, 5];
    board.notes[9] = [4];
    board.notes[10] = [4, 6];
    board.notes[40] = [4];

    const changed = applyBoardAction(board, {type: "setNumber", cellIndex: 0, number: 4});

    expect(applyInverse(changed.board, changed.inverse)).toEqual(board);
  });
});

describe("projectPendingCommands", () => {
  it("replays board actions and ignores room-control actions until confirmed", () => {
    const board = createBoard();
    board.solution[20] = 8;
    const commands = [
      pending({type: "setNotes", cellIndex: 1, notes: [3, 2]}, 0),
      pending({type: "pause"}, 1),
      pending({type: "setNumber", cellIndex: 0, number: 2}, 2),
      pending({type: "resume"}, 3),
      pending({type: "undo"}, 4),
      pending({type: "clear"}, 5),
      pending({type: "hint", cellIndex: 20}, 6),
    ];

    const projected = projectPendingCommands(createSnapshot(board), commands);

    expect(projected.values[0]).toBe(2);
    expect(projected.notes[1]).toEqual([3]);
    expect(projected.values[20]).toBe(8);
    expect(board.values[0]).toBe(0);
  });
});
