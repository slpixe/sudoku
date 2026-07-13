import type {RoomEvent, RoomSnapshot, UndoEntry} from "@sudoku/multiplayer-protocol";

import type {Database, QueryExecutor} from "../db/Database.js";
import {encodeNotes, mapRoomEvent, mapRoomRow, mapUndoEntry, type RoomRow} from "../db/roomRows.js";
import type {CreateRoomInput, RoomMutation, RoomMutationHelpers, RoomRepository} from "./RoomRepository.js";

const roomColumns = `
  r.id, r.code, r.collection_id, r.puzzle_number, r.givens, r.solution, r.values, r.notes,
  r.revision, r.status, r.elapsed_ms, r.running_since, r.created_at, r.last_activity_at, r.expires_at,
  EXISTS (SELECT 1 FROM undo_actions u WHERE u.room_id = r.id) AS can_undo`;

function snapshotValues(snapshot: RoomSnapshot): readonly unknown[] {
  return [
    snapshot.collectionId,
    snapshot.puzzleNumber,
    snapshot.board.givens,
    snapshot.board.solution,
    snapshot.board.values,
    encodeNotes(snapshot.board.notes),
    snapshot.revision,
    snapshot.status,
    snapshot.elapsedMs,
    snapshot.runningSince === null ? null : new Date(snapshot.runningSince),
    new Date(snapshot.expiresAt),
  ];
}

async function loadRoom(executor: QueryExecutor, code: string, now: Date, forUpdate = false) {
  const result = await executor.query<RoomRow>(
    `SELECT ${roomColumns} FROM rooms r WHERE r.code = $1${forUpdate ? " FOR UPDATE OF r" : ""}`,
    [code],
  );
  if (result.rowCount === 0) {
    return null;
  }
  if (result.rowCount !== 1) {
    throw new Error(`Expected one room row for code ${code}`);
  }
  return mapRoomRow(result.rows[0], now);
}

function mutationHelpers(tx: QueryExecutor, roomId: string, now: Date): RoomMutationHelpers {
  return {
    async getProcessedCommand(commandId: string): Promise<RoomEvent | null> {
      const result = await tx.query<{event: unknown}>(
        "SELECT event FROM processed_commands WHERE room_id = $1 AND command_id = $2",
        [roomId, commandId],
      );
      return result.rowCount === 0 ? null : mapRoomEvent(result.rows[0].event);
    },
    async recordCommand(commandId: string, event: RoomEvent): Promise<void> {
      await tx.query(
        `INSERT INTO processed_commands (room_id, command_id, revision, event, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [roomId, commandId, event.revision, JSON.stringify(event), now],
      );
    },
    async pushUndo(inverse: UndoEntry): Promise<void> {
      await tx.query(
        `INSERT INTO undo_actions (room_id, sequence, inverse, created_at)
         VALUES ($1, COALESCE((SELECT MAX(sequence) + 1 FROM undo_actions WHERE room_id = $1), 1), $2, $3)`,
        [roomId, JSON.stringify(inverse), now],
      );
      await tx.query(
        `DELETE FROM undo_actions
         WHERE room_id = $1
           AND sequence NOT IN (
             SELECT sequence FROM undo_actions WHERE room_id = $1 ORDER BY sequence DESC LIMIT 500
           )`,
        [roomId],
      );
    },
    async popUndo(): Promise<UndoEntry | null> {
      const result = await tx.query<{inverse: unknown}>(
        `DELETE FROM undo_actions
         WHERE room_id = $1
           AND sequence = (SELECT MAX(sequence) FROM undo_actions WHERE room_id = $1)
         RETURNING inverse`,
        [roomId],
      );
      return result.rowCount === 0 ? null : mapUndoEntry(result.rows[0].inverse);
    },
    async clearUndo(): Promise<void> {
      await tx.query("DELETE FROM undo_actions WHERE room_id = $1", [roomId]);
    },
  };
}

export class PostgresRoomRepository implements RoomRepository {
  constructor(readonly database: Database) {}

  async create({id, snapshot, now}: CreateRoomInput): Promise<RoomSnapshot> {
    const values = snapshotValues(snapshot);
    await this.database.query(
      `INSERT INTO rooms (
        id, code, collection_id, puzzle_number, givens, solution, values, notes, revision, status,
        elapsed_ms, running_since, created_at, last_activity_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [id, snapshot.roomCode, ...values.slice(0, 10), now, now, values[10]],
    );
    const created = await this.getSnapshot(snapshot.roomCode, now);
    if (!created) {
      throw new Error(`Created room ${snapshot.roomCode} could not be loaded`);
    }
    return created;
  }

  async getSnapshot(code: string, now: Date): Promise<RoomSnapshot | null> {
    return (await loadRoom(this.database, code, now))?.snapshot ?? null;
  }

  async mutate(code: string, now: Date, work: RoomMutation): Promise<RoomSnapshot | null> {
    return this.database.transaction(async (tx) => {
      const stored = await loadRoom(tx, code, now, true);
      if (!stored) {
        return null;
      }

      const changed = await work(stored.snapshot, mutationHelpers(tx, stored.id, now));
      const values = snapshotValues(changed);
      await tx.query(
        `UPDATE rooms SET
          collection_id = $2, puzzle_number = $3, givens = $4, solution = $5, values = $6, notes = $7,
          revision = $8, status = $9, elapsed_ms = $10, running_since = $11,
          last_activity_at = $12, expires_at = $13
         WHERE id = $1`,
        [stored.id, ...values.slice(0, 10), now, values[10]],
      );

      const committed = await loadRoom(tx, code, now);
      if (!committed) {
        throw new Error(`Mutated room ${code} could not be loaded`);
      }
      return committed.snapshot;
    });
  }

  async recordDisconnectExpiry(code: string, expiresAt: Date): Promise<void> {
    await this.database.query("UPDATE rooms SET expires_at = GREATEST(expires_at, $2) WHERE code = $1", [
      code,
      expiresAt,
    ]);
  }

  async deleteExpired(now: Date, activeRoomCodes: ReadonlySet<string>): Promise<number> {
    const result = await this.database.query("DELETE FROM rooms WHERE expires_at <= $1 AND code <> ALL($2::text[])", [
      now,
      [...activeRoomCodes],
    ]);
    return result.rowCount;
  }

  async ping(): Promise<void> {
    await this.database.query("SELECT 1");
  }
}
