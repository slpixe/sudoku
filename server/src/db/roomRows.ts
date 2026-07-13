import {roomEventSchema, type RoomEvent, type RoomSnapshot, type RoomStatus, type UndoEntry} from "@sudoku/multiplayer-protocol";
import type {BaseCollectionId} from "@sudoku/core";

const roomCodePattern = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const collectionIds = new Set<BaseCollectionId>(["easy", "medium", "hard", "expert", "evil"]);
const statuses = new Set<RoomStatus>(["running", "paused", "completed"]);

export interface RoomRow {
  id: unknown;
  code: unknown;
  collection_id: unknown;
  puzzle_number: unknown;
  givens: unknown;
  solution: unknown;
  values: unknown;
  notes: unknown;
  revision: unknown;
  status: unknown;
  elapsed_ms: unknown;
  running_since: unknown;
  created_at: unknown;
  last_activity_at: unknown;
  expires_at: unknown;
  can_undo?: unknown;
}

function fail(field: string): never {
  throw new TypeError(`Invalid room row field: ${field}`);
}

function stringField(value: unknown, field: string): string {
  return typeof value === "string" ? value : fail(field);
}

function integerField(value: unknown, field: string, minimum = 0): number {
  let parsed: number;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "bigint") {
    parsed = Number(value);
  } else if (typeof value === "string" && /^-?\d+$/.test(value)) {
    parsed = Number(value);
  } else {
    return fail(field);
  }

  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    return fail(field);
  }
  return parsed;
}

function dateField(value: unknown, field: string): Date {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : fail(field);
  if (!Number.isFinite(date.getTime())) {
    return fail(field);
  }
  return date;
}

function integerArray(value: unknown, field: string, minimum: number, maximum: number): number[] {
  if (!Array.isArray(value) || value.length !== 81) {
    return fail(field);
  }
  return value.map((entry, index) => {
    const parsed = integerField(entry, `${field}[${index}]`);
    return parsed >= minimum && parsed <= maximum ? parsed : fail(`${field}[${index}]`);
  });
}

export function encodeNotes(notes: readonly (readonly number[])[]): number[] {
  if (notes.length !== 81) {
    return fail("notes");
  }
  return notes.map((cellNotes, cellIndex) => {
    let mask = 0;
    for (const digit of cellNotes) {
      if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
        return fail(`notes[${cellIndex}]`);
      }
      mask |= 1 << (digit - 1);
    }
    return mask;
  });
}

export function decodeNotes(value: unknown): number[][] {
  return integerArray(value, "notes", 0, 0x1ff).map((mask) => {
    const notes: number[] = [];
    for (let digit = 1; digit <= 9; digit++) {
      if ((mask & (1 << (digit - 1))) !== 0) {
        notes.push(digit);
      }
    }
    return notes;
  });
}

export function mapRoomRow(row: RoomRow, serverNow: Date): {id: string; snapshot: RoomSnapshot; createdAt: Date; lastActivityAt: Date} {
  const id = stringField(row.id, "id");
  if (!uuidPattern.test(id)) {
    fail("id");
  }
  const roomCode = stringField(row.code, "code");
  if (!roomCodePattern.test(roomCode)) {
    fail("code");
  }
  const collectionId = stringField(row.collection_id, "collection_id") as BaseCollectionId;
  if (!collectionIds.has(collectionId)) {
    fail("collection_id");
  }
  const status = stringField(row.status, "status") as RoomStatus;
  if (!statuses.has(status)) {
    fail("status");
  }
  const runningSince = row.running_since === null ? null : dateField(row.running_since, "running_since").getTime();
  const canUndo = row.can_undo === undefined ? false : row.can_undo;
  if (typeof canUndo !== "boolean") {
    fail("can_undo");
  }

  return {
    id,
    createdAt: dateField(row.created_at, "created_at"),
    lastActivityAt: dateField(row.last_activity_at, "last_activity_at"),
    snapshot: {
      roomCode,
      collectionId,
      puzzleNumber: integerField(row.puzzle_number, "puzzle_number", 1),
      board: {
        givens: integerArray(row.givens, "givens", 0, 9),
        solution: integerArray(row.solution, "solution", 1, 9),
        values: integerArray(row.values, "values", 0, 9),
        notes: decodeNotes(row.notes),
      },
      revision: integerField(row.revision, "revision"),
      status,
      elapsedMs: integerField(row.elapsed_ms, "elapsed_ms"),
      runningSince,
      serverNow: serverNow.getTime(),
      canUndo,
      connectedGuests: 0,
      expiresAt: dateField(row.expires_at, "expires_at").toISOString(),
    },
  };
}

export function mapRoomEvent(value: unknown): RoomEvent {
  return roomEventSchema.parse(value);
}

export function mapUndoEntry(value: unknown): UndoEntry {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.keys(value).length !== 1 ||
    !("cells" in value) ||
    !Array.isArray(value.cells)
  ) {
    throw new TypeError("Invalid undo entry");
  }
  return {
    cells: value.cells.map((cell, index) => {
      if (typeof cell !== "object" || cell === null) {
        return fail(`inverse.cells[${index}]`);
      }
      const record = cell as Record<string, unknown>;
      if (Object.keys(record).sort().join(",") !== "cellIndex,notes,value") {
        return fail(`inverse.cells[${index}]`);
      }
      const cellIndex = integerField(record.cellIndex, `inverse.cells[${index}].cellIndex`);
      const cellValue = integerField(record.value, `inverse.cells[${index}].value`);
      const cellNotes = record.notes;
      if (cellIndex > 80 || cellValue > 9 || !Array.isArray(cellNotes)) {
        return fail(`inverse.cells[${index}]`);
      }
      return {
        cellIndex,
        value: cellValue,
        notes: cellNotes.map((note, noteIndex) => {
          const digit = integerField(note, `inverse.cells[${index}].notes[${noteIndex}]`, 1);
          return digit <= 9 ? digit : fail(`inverse.cells[${index}].notes[${noteIndex}]`);
        }),
      };
    }),
  };
}
