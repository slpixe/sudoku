import {describe, expect, it} from "vitest";

import {roomCommandSchema} from "./schemas.js";
import {createRoomRequestSchema, joinRoomRequestSchema, leaveRoomRequestSchema} from "./socketEvents.js";

const commandId = "123e4567-e89b-42d3-a456-426614174000";

function command(action: unknown) {
  return {
    commandId,
    roomCode: "ABC234",
    baseRevision: 3,
    action,
  };
}

describe("roomCommandSchema", () => {
  it("accepts a valid command envelope", () => {
    expect(
      roomCommandSchema.parse({
        commandId: crypto.randomUUID(),
        roomCode: "ABC234",
        baseRevision: 3,
        action: {type: "setNumber", cellIndex: 8, number: 7},
      }),
    ).toMatchObject({roomCode: "ABC234"});
  });

  it("rejects an invalid command envelope", () => {
    expect(() =>
      roomCommandSchema.parse({
        commandId: "not-a-uuid",
        roomCode: "O0I1ZZ",
        baseRevision: -1,
        action: {type: "setNumber", cellIndex: 81, number: 10},
      }),
    ).toThrow();
  });

  it.each([
    {type: "setNumber", cellIndex: 8, number: 7},
    {type: "setNotes", cellIndex: 8, notes: [1, 4, 9]},
    {type: "clearCell", cellIndex: 8},
    {type: "hint", cellIndex: 8},
    {type: "undo"},
    {type: "pause"},
    {type: "resume"},
    {type: "clear"},
  ])("accepts the $type action", (action) => {
    expect(roomCommandSchema.parse(command(action)).action).toEqual(action);
  });

  it.each([
    {type: "setNumber", cellIndex: -1, number: 7},
    {type: "setNumber", cellIndex: 0, number: 0},
    {type: "setNotes", cellIndex: 81, notes: [1]},
    {type: "setNotes", cellIndex: 0, notes: [1, 1]},
    {type: "setNotes", cellIndex: 0, notes: [10]},
    {type: "clearCell", cellIndex: 2.5},
    {type: "hint", cellIndex: 81},
    {type: "undo", unexpected: true},
    {type: "pause", unexpected: true},
    {type: "resume", unexpected: true},
    {type: "clear", unexpected: true},
  ])("rejects a malformed $type action", (action) => {
    expect(() => roomCommandSchema.parse(command(action))).toThrow();
  });
});

describe("socket request schemas", () => {
  const guestId = "123e4567-e89b-42d3-a456-426614174000";
  const connectionId = "123e4567-e89b-42d3-a456-426614174001";

  it("accepts the exact create, join, and leave request shapes", () => {
    expect(
      createRoomRequestSchema.parse({
        guestId,
        connectionId,
        collectionId: "easy",
        puzzleNumber: 1,
        puzzleFingerprint: "0".repeat(81),
      }),
    ).toMatchObject({guestId, connectionId});
    expect(joinRoomRequestSchema.parse({guestId, connectionId, roomCode: "ABC234"})).toMatchObject({roomCode: "ABC234"});
    expect(leaveRoomRequestSchema.parse({connectionId, roomCode: "ABC234"})).toMatchObject({roomCode: "ABC234"});
  });

  it.each([
    {guestId: "guest", connectionId, collectionId: "easy", puzzleNumber: 1, puzzleFingerprint: "0".repeat(81)},
    {guestId, connectionId, collectionId: "easy", puzzleNumber: 1, puzzleFingerprint: "0".repeat(80)},
    {guestId, connectionId, collectionId: "easy", puzzleNumber: 1, puzzleFingerprint: "0".repeat(81), extra: true},
  ])("strictly rejects malformed create requests", (request) => {
    expect(() => createRoomRequestSchema.parse(request)).toThrow();
  });
});
