import type {RoomEvent, RoomSnapshot, UndoEntry} from "@sudoku/multiplayer-protocol";

import type {CreateRoomInput, RoomMutation, RoomMutationHelpers, RoomRepository} from "../rooms/RoomRepository.js";

interface StoredRoom {
  id: string;
  snapshot: RoomSnapshot;
  processedCommands: Map<string, RoomEvent>;
  undo: UndoEntry[];
  createdAt: Date;
  lastActivityAt: Date;
}

function cloneSnapshot(snapshot: RoomSnapshot): RoomSnapshot {
  return structuredClone(snapshot);
}

function cloneEvent(event: RoomEvent): RoomEvent {
  return structuredClone(event);
}

function cloneUndo(inverse: UndoEntry): UndoEntry {
  return structuredClone(inverse);
}

function cloneStoredRoom(room: StoredRoom): StoredRoom {
  return {
    id: room.id,
    snapshot: cloneSnapshot(room.snapshot),
    processedCommands: new Map(room.processedCommands),
    undo: room.undo.slice(),
    createdAt: new Date(room.createdAt),
    lastActivityAt: new Date(room.lastActivityAt),
  };
}

function publicSnapshot(room: StoredRoom, now: Date): RoomSnapshot {
  return {
    ...cloneSnapshot(room.snapshot),
    serverNow: now.getTime(),
    canUndo: room.undo.length > 0,
  };
}

export class InMemoryRoomRepository implements RoomRepository {
  readonly #rooms = new Map<string, StoredRoom>();

  async create({id, snapshot, now}: CreateRoomInput): Promise<RoomSnapshot> {
    if (this.#rooms.has(snapshot.roomCode)) {
      const error = new Error(`Room code ${snapshot.roomCode} already exists`) as Error & {code: string};
      error.code = "23505";
      throw error;
    }

    const stored: StoredRoom = {
      id,
      snapshot: cloneSnapshot(snapshot),
      processedCommands: new Map(),
      undo: [],
      createdAt: new Date(now),
      lastActivityAt: new Date(now),
    };
    this.#rooms.set(snapshot.roomCode, stored);
    return publicSnapshot(stored, now);
  }

  async getSnapshot(code: string, now: Date): Promise<RoomSnapshot | null> {
    const stored = this.#rooms.get(code);
    return stored ? publicSnapshot(stored, now) : null;
  }

  async mutate(code: string, now: Date, work: RoomMutation): Promise<RoomSnapshot | null> {
    const current = this.#rooms.get(code);
    if (!current) {
      return null;
    }

    const pending = cloneStoredRoom(current);
    const helpers: RoomMutationHelpers = {
      getProcessedCommand: async (commandId) => {
        const event = pending.processedCommands.get(commandId);
        return event ? cloneEvent(event) : null;
      },
      recordCommand: async (commandId, event) => {
        pending.processedCommands.set(commandId, cloneEvent(event));
      },
      pushUndo: async (inverse) => {
        pending.undo.push(cloneUndo(inverse));
        if (pending.undo.length > 500) {
          pending.undo.splice(0, pending.undo.length - 500);
        }
      },
      popUndo: async () => {
        const inverse = pending.undo.pop();
        return inverse ? cloneUndo(inverse) : null;
      },
      clearUndo: async () => {
        pending.undo = [];
      },
    };

    pending.snapshot = cloneSnapshot(await work(publicSnapshot(pending, now), helpers));
    pending.snapshot.serverNow = now.getTime();
    pending.snapshot.canUndo = pending.undo.length > 0;
    pending.lastActivityAt = new Date(now);
    this.#rooms.set(code, pending);
    return publicSnapshot(pending, now);
  }

  async recordDisconnectExpiry(code: string, expiresAt: Date): Promise<void> {
    const stored = this.#rooms.get(code);
    if (stored) {
      stored.snapshot.expiresAt = expiresAt.toISOString();
    }
  }

  async deleteExpired(now: Date, activeRoomCodes: ReadonlySet<string>): Promise<number> {
    let deleted = 0;
    for (const [code, room] of this.#rooms) {
      if (!activeRoomCodes.has(code) && Date.parse(room.snapshot.expiresAt) <= now.getTime()) {
        this.#rooms.delete(code);
        deleted += 1;
      }
    }
    return deleted;
  }

  async ping(): Promise<void> {}

  undoCount(code: string): number {
    return this.#rooms.get(code)?.undo.length ?? 0;
  }

  processedCommandCount(code: string): number {
    return this.#rooms.get(code)?.processedCommands.size ?? 0;
  }

  lastActivityAt(code: string): Date | null {
    const value = this.#rooms.get(code)?.lastActivityAt;
    return value ? new Date(value) : null;
  }
}
