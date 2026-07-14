import {
  applyBoardAction,
  applyInverse,
  type BoardAction,
  type RoomBoard,
  type RoomCommand,
  type RoomEvent,
  type RoomSnapshot,
} from "@sudoku/multiplayer-protocol";
import type {BaseCollectionId} from "@sudoku/core";
import {randomUUID} from "node:crypto";

import type {PuzzleCatalog} from "../catalog/PuzzleCatalog.js";
import type {Clock} from "./Clock.js";
import {SystemClock} from "./Clock.js";
import {PerRoomQueue} from "./PerRoomQueue.js";
import type {RoomMutationHelpers, RoomRepository} from "./RoomRepository.js";
import {createRoomCode} from "./roomCode.js";

const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const MAX_ROOM_CODE_ATTEMPTS = 100;

export interface CreateRoomRequest {
  collectionId: BaseCollectionId;
  puzzleNumber: number;
  givensFingerprint: string;
}

export interface ExecuteRoomCommandResult {
  snapshot: RoomSnapshot;
  event: RoomEvent;
  duplicate: boolean;
}

type RoomCodeFactory = () => string;
type RoomIdFactory = () => string;

function expiryFrom(now: Date, roomLifetimeMs: number): string {
  return new Date(now.getTime() + roomLifetimeMs).toISOString();
}

function boardFrom(givens: readonly number[], solution: readonly number[]): RoomBoard {
  return {
    givens: [...givens],
    solution: [...solution],
    values: Array(81).fill(0) as number[],
    notes: Array.from({length: 81}, () => [] as number[]),
  };
}

function cloneBoard(board: RoomBoard): RoomBoard {
  return structuredClone(board);
}

function eventFrom(room: RoomSnapshot, command: RoomCommand, now: Date): RoomEvent {
  return {
    commandId: command.commandId,
    action: structuredClone(command.action),
    revision: room.revision,
    board: cloneBoard(room.board),
    status: room.status,
    elapsedMs: room.elapsedMs,
    runningSince: room.runningSince,
    serverNow: now.getTime(),
    canUndo: room.canUndo,
  };
}

function snapshotFromEvent(room: RoomSnapshot, event: RoomEvent, roomLifetimeMs: number): RoomSnapshot {
  return {
    roomCode: room.roomCode,
    collectionId: room.collectionId,
    puzzleNumber: room.puzzleNumber,
    board: cloneBoard(event.board),
    revision: event.revision,
    status: event.status,
    elapsedMs: event.elapsedMs,
    runningSince: event.runningSince,
    serverNow: event.serverNow,
    canUndo: event.canUndo,
    connectedGuests: room.connectedGuests,
    expiresAt: new Date(event.serverNow + roomLifetimeMs).toISOString(),
  };
}

function isBoardAction(action: RoomCommand["action"]): action is BoardAction {
  return (
    action.type === "setNumber" || action.type === "setNotes" || action.type === "clearCell" || action.type === "hint"
  );
}

function isCompleted(board: RoomBoard): boolean {
  return board.solution.every((solutionValue, cellIndex) => {
    const value = board.givens[cellIndex] === 0 ? board.values[cellIndex] : board.givens[cellIndex];
    return value === solutionValue;
  });
}

function accumulateElapsed(room: RoomSnapshot, now: Date): number {
  if (room.runningSince === null) {
    return room.elapsedMs;
  }
  return room.elapsedMs + Math.max(0, now.getTime() - room.runningSince);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function stillHasUndo(helpers: RoomMutationHelpers): Promise<boolean> {
  const previous = await helpers.popUndo();
  if (!previous) {
    return false;
  }
  await helpers.pushUndo(previous);
  return true;
}

export class RoomService {
  readonly #queue = new PerRoomQueue();

  constructor(
    readonly repository: RoomRepository,
    readonly catalog: PuzzleCatalog,
    readonly clock: Clock = new SystemClock(),
    readonly roomCodeFactory: RoomCodeFactory = createRoomCode,
    readonly roomIdFactory: RoomIdFactory = randomUUID,
    readonly roomLifetimeMs = ROOM_LIFETIME_MS,
  ) {}

  async createRoom(input: CreateRoomRequest): Promise<RoomSnapshot> {
    const puzzle = await this.catalog.get(input.collectionId, input.puzzleNumber);
    if (input.givensFingerprint !== puzzle.givens.join("")) {
      throw new Error("Puzzle fingerprint does not match the authoritative catalog version");
    }

    for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt++) {
      const now = this.clock.now();
      const roomCode = this.roomCodeFactory();
      if (await this.repository.getSnapshot(roomCode, now)) {
        continue;
      }

      const snapshot: RoomSnapshot = {
        roomCode,
        collectionId: puzzle.collectionId,
        puzzleNumber: puzzle.puzzleNumber,
        board: boardFrom(puzzle.givens, puzzle.solution),
        revision: 0,
        status: "running",
        elapsedMs: 0,
        runningSince: null,
        serverNow: now.getTime(),
        canUndo: false,
        connectedGuests: 0,
        expiresAt: expiryFrom(now, this.roomLifetimeMs),
      };

      try {
        return await this.repository.create({id: this.roomIdFactory(), snapshot, now});
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
    }

    throw new Error("Could not allocate a unique room code");
  }

  async joinRoom(code: string): Promise<RoomSnapshot | null> {
    return this.#queue.run(code, async () => {
      const now = this.clock.now();
      const existing = await this.repository.getSnapshot(code, now);
      if (!existing || Date.parse(existing.expiresAt) <= now.getTime()) {
        return null;
      }
      return this.repository.mutate(code, now, (room) => ({
        ...room,
        serverNow: now.getTime(),
        expiresAt: expiryFrom(now, this.roomLifetimeMs),
      }));
    });
  }

  async execute(command: RoomCommand): Promise<ExecuteRoomCommandResult> {
    return this.#queue.run(command.roomCode, async () => {
      const now = this.clock.now();
      let event: RoomEvent | null = null;
      let duplicate = false;
      let duplicateSnapshot: RoomSnapshot | null = null;

      const currentSnapshot = await this.repository.mutate(command.roomCode, now, async (room, helpers) => {
        if (Date.parse(room.expiresAt) <= now.getTime()) {
          throw new Error(`Room ${command.roomCode} has expired`);
        }

        const receipt = await helpers.getProcessedCommand(command.commandId);
        if (receipt) {
          event = receipt;
          duplicate = true;
          duplicateSnapshot = snapshotFromEvent(room, receipt, this.roomLifetimeMs);
          return room;
        }

        if (room.status === "completed") {
          throw new Error("The room is completed and no longer accepts gameplay commands");
        }
        if (room.status === "paused" && command.action.type !== "resume") {
          throw new Error("The room is paused; only resume is allowed");
        }

        if (isBoardAction(command.action)) {
          await this.#applyBoardCommand(room, command.action, helpers, now);
        } else {
          await this.#applyRoomCommand(room, command.action.type, helpers, now);
        }

        room.revision += 1;
        room.serverNow = now.getTime();
        room.expiresAt = expiryFrom(now, this.roomLifetimeMs);
        event = eventFrom(room, command, now);
        await helpers.recordCommand(command.commandId, event);
        return room;
      });

      if (!currentSnapshot || !event) {
        throw new Error(`Room ${command.roomCode} was not found`);
      }
      return {snapshot: duplicateSnapshot ?? currentSnapshot, event, duplicate};
    });
  }

  async markRoomInactive(code: string): Promise<void> {
    await this.#queue.run(code, async () => {
      const now = this.clock.now();
      await this.repository.recordDisconnectExpiry(code, new Date(now.getTime() + this.roomLifetimeMs));
    });
  }

  async deleteExpiredRooms(activeRoomCodes: ReadonlySet<string>): Promise<number> {
    return this.repository.deleteExpired(this.clock.now(), activeRoomCodes);
  }

  async #applyBoardCommand(
    room: RoomSnapshot,
    action: BoardAction,
    helpers: RoomMutationHelpers,
    now: Date,
  ): Promise<void> {
    if (room.board.givens[action.cellIndex] !== 0) {
      throw new Error("Cannot change a given cell");
    }

    const applied = applyBoardAction(room.board, action);
    if (applied.inverse.cells.length === 0) {
      throw new Error("The board command did not change the room");
    }

    room.board = applied.board;
    if (room.runningSince === null) {
      room.runningSince = now.getTime();
    }
    await helpers.pushUndo(applied.inverse);
    room.canUndo = true;

    if (isCompleted(room.board)) {
      room.elapsedMs = accumulateElapsed(room, now);
      room.runningSince = null;
      room.status = "completed";
    }
  }

  async #applyRoomCommand(
    room: RoomSnapshot,
    actionType: "undo" | "pause" | "resume" | "clear",
    helpers: RoomMutationHelpers,
    now: Date,
  ): Promise<void> {
    switch (actionType) {
      case "undo": {
        const inverse = await helpers.popUndo();
        if (!inverse) {
          throw new Error("There is no room action to undo");
        }
        room.board = applyInverse(room.board, inverse);
        room.canUndo = await stillHasUndo(helpers);
        break;
      }
      case "pause":
        if (room.status === "paused") {
          throw new Error("The room is already paused");
        }
        room.elapsedMs = accumulateElapsed(room, now);
        room.runningSince = null;
        room.status = "paused";
        break;
      case "resume":
        if (room.status === "running") {
          throw new Error("The room is already running");
        }
        room.runningSince = now.getTime();
        room.status = "running";
        break;
      case "clear":
        if (room.status !== "running") {
          throw new Error("Clear is allowed only while the room is running");
        }
        room.board = boardFrom(room.board.givens, room.board.solution);
        room.elapsedMs = 0;
        room.runningSince = null;
        room.status = "running";
        room.canUndo = false;
        await helpers.clearUndo();
        break;
    }
  }
}
