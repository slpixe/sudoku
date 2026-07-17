import {describe, expect, it} from "vitest";

import {mapRoomRow, type RoomRow} from "./roomRows.js";

const now = new Date("2026-07-16T12:00:00.000Z");

function roomRow(collectionId: string): RoomRow {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    code: "ABC234",
    collection_id: collectionId,
    puzzle_number: 1,
    givens: Array<number>(81).fill(0),
    solution: Array<number>(81).fill(1),
    values: Array<number>(81).fill(0),
    notes: Array<number>(81).fill(0),
    revision: 0,
    status: "running",
    timer_started: false,
    elapsed_ms: 0,
    running_since: null,
    created_at: now,
    last_activity_at: now,
    expires_at: new Date(now.getTime() + 86_400_000),
    can_undo: false,
  };
}

describe("mapRoomRow collection IDs", () => {
  it.each([
    ["expert", "fiendish"],
    ["evil", "diabolical"],
  ])("normalizes legacy %s rows to %s", (storedId, expectedId) => {
    expect(mapRoomRow(roomRow(storedId), now).snapshot.collectionId).toBe(expectedId);
  });

  it.each(["fiendish", "diabolical"])("accepts canonical %s rows", (collectionId) => {
    expect(mapRoomRow(roomRow(collectionId), now).snapshot.collectionId).toBe(collectionId);
  });
});
