export const MULTIPLAYER_PROTOCOL_VERSION = 1;

export type RoomStatus = "running" | "paused" | "completed";

export interface RoomBoard {
  givens: number[];
  solution: number[];
  values: number[];
  notes: number[][];
}

export type BoardAction =
  | {type: "setNumber"; cellIndex: number; number: number}
  | {type: "setNotes"; cellIndex: number; notes: number[]}
  | {type: "clearCell"; cellIndex: number}
  | {type: "hint"; cellIndex: number};

export type RoomAction = BoardAction | {type: "undo"} | {type: "pause"} | {type: "resume"} | {type: "clear"};

export interface RoomCommand {
  commandId: string;
  roomCode: string;
  baseRevision: number;
  action: RoomAction;
}

export interface CellInverse {
  cellIndex: number;
  value: number;
  notes: number[];
}

export interface UndoEntry {
  cells: CellInverse[];
}

export interface RoomSnapshot {
  roomCode: string;
  collectionId: import("@sudoku/core").BaseCollectionId;
  puzzleNumber: number;
  board: RoomBoard;
  revision: number;
  status: RoomStatus;
  elapsedMs: number;
  runningSince: number | null;
  serverNow: number;
  canUndo: boolean;
  connectedGuests: 0 | 1 | 2;
  expiresAt: string;
}

export interface RoomEvent {
  commandId: string;
  action: RoomAction;
  revision: number;
  board: RoomBoard;
  status: RoomStatus;
  elapsedMs: number;
  runningSince: number | null;
  serverNow: number;
  canUndo: boolean;
}
