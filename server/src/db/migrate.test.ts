import {copyFile, mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {roomEventSchema, type RoomAction, type RoomBoard} from "@sudoku/multiplayer-protocol";
import {afterEach, describe, expect, it} from "vitest";

import {PgliteDatabase} from "../testing/PgliteDatabase.js";
import {runMigrations} from "./migrate.js";

const migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));
const roomId = "123e4567-e89b-42d3-a456-426614174000";
const resumedRoomId = "123e4567-e89b-42d3-a456-426614174010";
const postMigrationRoomId = "123e4567-e89b-42d3-a456-426614174020";
const now = new Date("2026-07-13T10:00:00.000Z");

function uuid(index: number): string {
  return `123e4567-e89b-42d3-a456-${String(426614174000 + index).padStart(12, "0")}`;
}

function board(values = Array<number>(81).fill(0), notes = Array.from({length: 81}, () => [] as number[])): RoomBoard {
  return {
    givens: Array<number>(81).fill(0),
    solution: Array<number>(81).fill(1),
    values,
    notes,
  };
}

function legacyEvent(
  revision: number,
  action: RoomAction,
  status: "running" | "paused",
  eventBoard: RoomBoard,
  runningSince: number | null,
) {
  return {
    commandId: uuid(revision),
    action,
    revision,
    board: eventBoard,
    status,
    elapsedMs: 0,
    runningSince,
    serverNow: now.getTime(),
    canUndo: revision === 1,
  };
}

async function insertLegacyRoom(
  database: PgliteDatabase,
  input: {
    id: string;
    code: string;
    collectionId?: string;
    revision: number;
    status: "running" | "paused";
    runningSince: Date | null;
  },
): Promise<void> {
  const emptyBoard = board();
  await database.query(
    `INSERT INTO rooms (
      id, code, collection_id, puzzle_number, givens, solution, values, notes,
      revision, status, elapsed_ms, running_since, created_at, last_activity_at, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      input.id,
      input.code,
      input.collectionId ?? "easy",
      1,
      emptyBoard.givens,
      emptyBoard.solution,
      emptyBoard.values,
      Array<number>(81).fill(0),
      input.revision,
      input.status,
      0,
      input.runningSince,
      now,
      now,
      new Date(now.getTime() + 86_400_000),
    ],
  );
}

describe("multiplayer database migrations", () => {
  const databases: PgliteDatabase[] = [];
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(databases.splice(0).map((database) => database.close()));
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
  });

  it("expands and canonicalizes the top difficulty IDs", async () => {
    const database = new PgliteDatabase();
    databases.push(database);
    const migration001Directory = await mkdtemp(path.join(tmpdir(), "sudoku-migration-difficulty-"));
    temporaryDirectories.push(migration001Directory);
    await copyFile(
      path.join(migrationsDirectory, "001_multiplayer_rooms.sql"),
      path.join(migration001Directory, "001_multiplayer_rooms.sql"),
    );
    await runMigrations(database, migration001Directory);

    await insertLegacyRoom(database, {
      id: roomId,
      code: "ABC234",
      collectionId: "expert",
      revision: 0,
      status: "running",
      runningSince: null,
    });
    await insertLegacyRoom(database, {
      id: resumedRoomId,
      code: "DEF567",
      collectionId: "evil",
      revision: 0,
      status: "running",
      runningSince: null,
    });

    await runMigrations(database, migrationsDirectory);

    const migrated = await database.query<{collection_id: string}>(
      "SELECT collection_id FROM rooms ORDER BY code",
    );
    expect(migrated.rows).toEqual([{collection_id: "fiendish"}, {collection_id: "diabolical"}]);

    await expect(
      insertLegacyRoom(database, {
        id: postMigrationRoomId,
        code: "GHJ678",
        collectionId: "expert",
        revision: 0,
        status: "running",
        runningSince: null,
      }),
    ).resolves.toBeUndefined();
  });

  it("backfills ordered history and remains compatible with legacy command and room writes", async () => {
    const database = new PgliteDatabase();
    databases.push(database);
    const migration001Directory = await mkdtemp(path.join(tmpdir(), "sudoku-migration-001-"));
    temporaryDirectories.push(migration001Directory);
    await copyFile(
      path.join(migrationsDirectory, "001_multiplayer_rooms.sql"),
      path.join(migration001Directory, "001_multiplayer_rooms.sql"),
    );
    await runMigrations(database, migration001Directory);

    const emptyBoard = board();
    await insertLegacyRoom(database, {
      id: roomId,
      code: "ABC234",
      revision: 3,
      status: "paused",
      runningSince: null,
    });

    const notes = Array.from({length: 81}, () => [] as number[]);
    notes[0] = [1];
    const historicalEvents = [
      legacyEvent(1, {type: "setNotes", cellIndex: 0, notes: [1]}, "running", board(undefined, notes), now.getTime()),
      legacyEvent(2, {type: "undo"}, "running", emptyBoard, now.getTime()),
      legacyEvent(3, {type: "pause"}, "paused", emptyBoard, null),
    ];
    for (const event of historicalEvents) {
      await database.query(
        `INSERT INTO processed_commands (room_id, command_id, revision, event, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [roomId, event.commandId, event.revision, JSON.stringify(event), now],
      );
    }

    await insertLegacyRoom(database, {
      id: resumedRoomId,
      code: "DEF567",
      revision: 2,
      status: "running",
      runningSince: now,
    });
    const preMigrationPauseResume = [
      {...legacyEvent(1, {type: "pause"}, "paused", emptyBoard, null), canUndo: false},
      {...legacyEvent(2, {type: "resume"}, "running", emptyBoard, now.getTime()), canUndo: false},
    ];
    for (const event of preMigrationPauseResume) {
      await database.query(
        `INSERT INTO processed_commands (room_id, command_id, revision, event, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [resumedRoomId, event.commandId, event.revision, JSON.stringify(event), now],
      );
    }

    await runMigrations(database, migrationsDirectory);

    const backfilled = await database.query<{revision: string; event: unknown}>(
      "SELECT revision::text, event FROM processed_commands WHERE room_id = $1 ORDER BY revision",
      [roomId],
    );
    expect(backfilled.rows.map(({event}) => roomEventSchema.parse(event).timerStarted)).toEqual([true, true, true]);
    await expect(
      database.query<{timer_started: boolean}>("SELECT timer_started FROM rooms WHERE id = $1", [roomId]),
    ).resolves.toMatchObject({rows: [{timer_started: true}]});
    const upgradedResumeEvents = await database.query<{event: unknown}>(
      "SELECT event FROM processed_commands WHERE room_id = $1 ORDER BY revision",
      [resumedRoomId],
    );
    expect(upgradedResumeEvents.rows.map(({event}) => roomEventSchema.parse(event).timerStarted)).toEqual([
      false,
      true,
    ]);
    const upgradedResumedRoom = await database.query<{running_since: unknown; timer_started: boolean}>(
      "SELECT running_since, timer_started FROM rooms WHERE id = $1",
      [resumedRoomId],
    );
    expect(upgradedResumedRoom.rows[0].timer_started).toBe(true);
    expect(new Date(upgradedResumedRoom.rows[0].running_since as string).getTime()).toBe(now.getTime());

    await insertLegacyRoom(database, {
      id: postMigrationRoomId,
      code: "GHJ678",
      revision: 0,
      status: "running",
      runningSince: null,
    });
    const postMigrationPause = {
      ...legacyEvent(1, {type: "pause"}, "paused", emptyBoard, null),
      canUndo: false,
    };
    await database.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO processed_commands (room_id, command_id, revision, event, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          postMigrationRoomId,
          postMigrationPause.commandId,
          postMigrationPause.revision,
          JSON.stringify(postMigrationPause),
          now,
        ],
      );
      await tx.query(
        `UPDATE rooms SET revision = $2, status = $3, elapsed_ms = $4,
          running_since = $5, last_activity_at = $6, expires_at = $7
         WHERE id = $1`,
        [postMigrationRoomId, 1, "paused", 0, null, now, new Date(now.getTime() + 86_400_000)],
      );
    });
    const postMigrationResume = {
      ...legacyEvent(2, {type: "resume"}, "running", emptyBoard, now.getTime()),
      canUndo: false,
    };
    await database.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO processed_commands (room_id, command_id, revision, event, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          postMigrationRoomId,
          postMigrationResume.commandId,
          postMigrationResume.revision,
          JSON.stringify(postMigrationResume),
          now,
        ],
      );
      await tx.query(
        `UPDATE rooms SET revision = $2, status = $3, elapsed_ms = $4,
          running_since = $5, last_activity_at = $6, expires_at = $7
         WHERE id = $1`,
        [postMigrationRoomId, 2, "running", 0, now, now, new Date(now.getTime() + 86_400_000)],
      );
    });
    const postMigrationResumeEvents = await database.query<{event: unknown}>(
      "SELECT event FROM processed_commands WHERE room_id = $1 ORDER BY revision",
      [postMigrationRoomId],
    );
    expect(postMigrationResumeEvents.rows.map(({event}) => roomEventSchema.parse(event).timerStarted)).toEqual([
      false,
      true,
    ]);
    const postMigrationResumedRoom = await database.query<{running_since: unknown; timer_started: boolean}>(
      "SELECT running_since, timer_started FROM rooms WHERE id = $1",
      [postMigrationRoomId],
    );
    expect(postMigrationResumedRoom.rows[0].timer_started).toBe(true);
    expect(new Date(postMigrationResumedRoom.rows[0].running_since as string).getTime()).toBe(now.getTime());

    const legacyClear = legacyEvent(4, {type: "clear"}, "running", emptyBoard, null);
    await database.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO processed_commands (room_id, command_id, revision, event, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [roomId, legacyClear.commandId, legacyClear.revision, JSON.stringify(legacyClear), now],
      );
      await tx.query(
        `UPDATE rooms SET values = $2, notes = $3, revision = $4, status = $5,
          elapsed_ms = $6, running_since = $7, last_activity_at = $8, expires_at = $9
         WHERE id = $1`,
        [
          roomId,
          emptyBoard.values,
          Array<number>(81).fill(0),
          4,
          "running",
          0,
          null,
          now,
          new Date(now.getTime() + 86_400_000),
        ],
      );
    });
    const afterClear = await database.query<{timer_started: boolean; event: unknown}>(
      `SELECT room.timer_started, command.event
       FROM rooms AS room
       JOIN processed_commands AS command ON command.room_id = room.id AND command.revision = 4
       WHERE room.id = $1`,
      [roomId],
    );
    expect(afterClear.rows[0].timer_started).toBe(false);
    expect(roomEventSchema.parse(afterClear.rows[0].event).timerStarted).toBe(false);

    const startedValues = Array<number>(81).fill(0);
    startedValues[0] = 1;
    const startedBoard = board(startedValues);
    const legacyMutation = legacyEvent(
      5,
      {type: "setNumber", cellIndex: 0, number: 1},
      "running",
      startedBoard,
      now.getTime(),
    );
    await database.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO processed_commands (room_id, command_id, revision, event, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [roomId, legacyMutation.commandId, legacyMutation.revision, JSON.stringify(legacyMutation), now],
      );
      await tx.query(
        `UPDATE rooms SET values = $2, revision = $3, status = $4,
          elapsed_ms = $5, running_since = $6, last_activity_at = $7, expires_at = $8
         WHERE id = $1`,
        [roomId, startedValues, 5, "running", 0, now, now, new Date(now.getTime() + 86_400_000)],
      );
    });
    const afterMutation = await database.query<{timer_started: boolean; event: unknown}>(
      `SELECT room.timer_started, command.event
       FROM rooms AS room
       JOIN processed_commands AS command ON command.room_id = room.id AND command.revision = 5
       WHERE room.id = $1`,
      [roomId],
    );
    expect(afterMutation.rows[0].timer_started).toBe(true);
    expect(roomEventSchema.parse(afterMutation.rows[0].event).timerStarted).toBe(true);
  });
});
