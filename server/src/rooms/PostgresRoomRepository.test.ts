import type {RoomEvent, RoomSnapshot} from "@sudoku/multiplayer-protocol";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import {runMigrations} from "../db/migrate.js";
import {PgliteDatabase} from "../testing/PgliteDatabase.js";
import {PostgresRoomRepository} from "./PostgresRoomRepository.js";

const roomId = "123e4567-e89b-42d3-a456-426614174000";
const commandId = "123e4567-e89b-42d3-a456-426614174001";
const now = new Date("2026-07-13T10:00:00.000Z");

function createSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    roomCode: "ABC234",
    collectionId: "easy",
    puzzleNumber: 1,
    board: {
      givens: Array.from({length: 81}, (_, index) => (index === 0 ? 5 : 0)),
      solution: Array.from({length: 81}, (_, index) => (index % 9) + 1),
      values: Array(81).fill(0),
      notes: Array.from({length: 81}, () => []),
    },
    revision: 0,
    status: "running",
    elapsedMs: 0,
    runningSince: null,
    serverNow: now.getTime(),
    canUndo: false,
    connectedGuests: 0,
    expiresAt: "2026-07-14T10:00:00.000Z",
    ...overrides,
  };
}

function createEvent(snapshot: RoomSnapshot): RoomEvent {
  return {
    commandId,
    action: {type: "setNotes", cellIndex: 1, notes: [1, 4, 9]},
    revision: snapshot.revision,
    board: snapshot.board,
    status: snapshot.status,
    elapsedMs: snapshot.elapsedMs,
    runningSince: snapshot.runningSince,
    serverNow: snapshot.serverNow,
    canUndo: snapshot.canUndo,
  };
}

describe("PostgresRoomRepository", () => {
  let database: PgliteDatabase;
  let repository: PostgresRoomRepository;

  beforeEach(async () => {
    database = new PgliteDatabase();
    await runMigrations(database);
    await runMigrations(database);
    repository = new PostgresRoomRepository(database);
  });

  afterEach(async () => {
    await database.close();
  });

  it("creates and strictly maps a room snapshot with note masks", async () => {
    const snapshot = createSnapshot();
    snapshot.board.notes[1] = [1, 4, 9];

    await repository.create({id: roomId, snapshot, now});

    await expect(repository.getSnapshot(snapshot.roomCode, now)).resolves.toEqual({...snapshot, canUndo: false});
    const stored = await database.query<{notes: number[]}>("SELECT notes FROM rooms WHERE id = $1", [roomId]);
    expect(stored.rows[0].notes[1]).toBe(1 | (1 << 3) | (1 << 8));
  });

  it("increments a revision and persists command and undo work transactionally", async () => {
    await repository.create({id: roomId, snapshot: createSnapshot(), now});

    const updated = await repository.mutate("ABC234", now, async (room, helpers) => {
      room.board.notes[1] = [1, 4, 9];
      room.revision += 1;
      room.canUndo = true;
      const event = createEvent(room);
      await helpers.recordCommand(commandId, event);
      await helpers.pushUndo({cells: [{cellIndex: 1, value: 0, notes: []}]});
      return room;
    });

    expect(updated).toMatchObject({revision: 1, canUndo: true});
    expect(updated).not.toBeNull();
    let receipt: RoomEvent | null = null;
    let inverse: unknown = null;
    await repository.mutate("ABC234", now, async (room, helpers) => {
      receipt = await helpers.getProcessedCommand(commandId);
      inverse = await helpers.popUndo();
      return room;
    });
    expect(receipt).toEqual(createEvent(updated!));
    expect(inverse).toEqual({cells: [{cellIndex: 1, value: 0, notes: []}]});
  });

  it("rolls back every mutation write when work fails", async () => {
    await repository.create({id: roomId, snapshot: createSnapshot(), now});

    await expect(
      repository.mutate("ABC234", now, async (room, helpers) => {
        room.revision = 1;
        await helpers.recordCommand(commandId, createEvent(room));
        await helpers.pushUndo({cells: []});
        throw new Error("reject command");
      }),
    ).rejects.toThrow("reject command");

    await expect(repository.getSnapshot("ABC234", now)).resolves.toMatchObject({revision: 0, canUndo: false});
    let receipt: RoomEvent | null = createEvent(createSnapshot());
    await repository.mutate("ABC234", now, async (room, helpers) => {
      receipt = await helpers.getProcessedCommand(commandId);
      return room;
    });
    expect(receipt).toBeNull();
  });

  it("caps undo independently at 500 while keeping every command receipt", async () => {
    await repository.create({id: roomId, snapshot: createSnapshot(), now});

    await repository.mutate("ABC234", now, async (room, helpers) => {
      for (let index = 0; index < 505; index++) {
        const id = `123e4567-e89b-42d3-a456-${String(426614174100 + index).padStart(12, "0")}`;
        room.revision = index + 1;
        await helpers.recordCommand(id, {...createEvent(room), commandId: id});
        await helpers.pushUndo({cells: [{cellIndex: index % 81, value: index, notes: []}]});
      }
      room.canUndo = true;
      return room;
    });

    const counts = await database.query<{commands: string; undo: string}>(
      `SELECT
        (SELECT count(*) FROM processed_commands WHERE room_id = $1)::text AS commands,
        (SELECT count(*) FROM undo_actions WHERE room_id = $1)::text AS undo`,
      [roomId],
    );
    expect(counts.rows[0]).toEqual({commands: "505", undo: "500"});
    let oldestReceipt: RoomEvent | null = null;
    await repository.mutate("ABC234", now, async (room, helpers) => {
      oldestReceipt = await helpers.getProcessedCommand("123e4567-e89b-42d3-a456-426614174100");
      return room;
    });
    expect(oldestReceipt).not.toBeNull();
  });

  it("clears undo without deleting processed command receipts", async () => {
    await repository.create({id: roomId, snapshot: createSnapshot(), now});
    await repository.mutate("ABC234", now, async (room, helpers) => {
      room.revision = 1;
      await helpers.recordCommand(commandId, createEvent(room));
      await helpers.pushUndo({cells: []});
      await helpers.clearUndo();
      room.canUndo = false;
      return room;
    });

    let receipt: RoomEvent | null = null;
    let inverse: unknown = {cells: []};
    await repository.mutate("ABC234", now, async (room, helpers) => {
      inverse = await helpers.popUndo();
      receipt = await helpers.getProcessedCommand(commandId);
      return room;
    });
    expect(inverse).toBeNull();
    expect(receipt).not.toBeNull();
  });

  it("updates disconnect expiry monotonically and deletes expired inactive rooms with cascades", async () => {
    await repository.create({id: roomId, snapshot: createSnapshot(), now});
    await repository.mutate("ABC234", now, async (room, helpers) => {
      room.revision = 1;
      await helpers.recordCommand(commandId, createEvent(room));
      await helpers.pushUndo({cells: []});
      return room;
    });

    const newerExpiry = new Date("2026-07-14T10:10:00.000Z");
    const staleExpiry = new Date("2026-07-14T10:05:00.000Z");
    await repository.recordDisconnectExpiry("ABC234", newerExpiry);
    await repository.recordDisconnectExpiry("ABC234", staleExpiry);
    await expect(repository.getSnapshot("ABC234", now)).resolves.toMatchObject({
      expiresAt: newerExpiry.toISOString(),
    });
    await expect(repository.deleteExpired(new Date("2026-07-14T10:11:00.000Z"), new Set(["OTHER1"]))).resolves.toBe(1);

    const childCounts = await database.query<{commands: string; undo: string}>(
      `SELECT
        (SELECT count(*) FROM processed_commands)::text AS commands,
        (SELECT count(*) FROM undo_actions)::text AS undo`,
    );
    expect(childCounts.rows[0]).toEqual({commands: "0", undo: "0"});
  });

  it("preserves active expired rooms and recovers through a fresh repository", async () => {
    const snapshot = createSnapshot({expiresAt: "2026-07-13T09:00:00.000Z"});
    snapshot.board.notes[80] = [2, 5, 8];
    await repository.create({id: roomId, snapshot, now});

    await expect(repository.deleteExpired(now, new Set(["ABC234"]))).resolves.toBe(0);
    const recovered = new PostgresRoomRepository(database);
    await expect(recovered.getSnapshot("ABC234", now)).resolves.toEqual({...snapshot, canUndo: false});
    await expect(recovered.ping()).resolves.toBeUndefined();
  });

  it("rejects malformed rows rather than coercing them", async () => {
    await repository.create({id: roomId, snapshot: createSnapshot(), now});
    await database.query("UPDATE rooms SET code = 'abc234' WHERE id = $1", [roomId]);

    await expect(repository.getSnapshot("abc234", now)).rejects.toThrow(/code/i);
  });
});
