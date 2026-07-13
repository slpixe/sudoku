import {BASE_COLLECTION_IDS} from "@sudoku/core";
import {z} from "zod";

import {roomCodeSchema, roomCommandSchema} from "./schemas.js";
import type {RoomCommand, RoomEvent, RoomSnapshot} from "./types.js";

const identifierSchema = z.string().uuid();

export const createRoomRequestSchema = z
  .object({
    guestId: identifierSchema,
    connectionId: identifierSchema,
    collectionId: z.enum(BASE_COLLECTION_IDS),
    puzzleNumber: z.number().int().positive(),
    puzzleFingerprint: z.string().regex(/^[0-9]{81}$/),
  })
  .strict();

export const joinRoomRequestSchema = z
  .object({
    guestId: identifierSchema,
    connectionId: identifierSchema,
    roomCode: roomCodeSchema,
  })
  .strict();

export const leaveRoomRequestSchema = z
  .object({
    roomCode: roomCodeSchema,
    connectionId: identifierSchema,
  })
  .strict();

export const clientRoomCommandSchema = roomCommandSchema;

export type RoomErrorCode =
  | "INVALID_REQUEST"
  | "ROOM_NOT_FOUND"
  | "ROOM_EXPIRED"
  | "ROOM_FULL"
  | "COMMAND_REJECTED"
  | "VERSION_MISMATCH"
  | "PUZZLE_VERSION_MISMATCH"
  | "SERVICE_UNAVAILABLE";

export interface RoomError {
  code: RoomErrorCode;
  message: string;
}

export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;
export type LeaveRoomRequest = z.infer<typeof leaveRoomRequestSchema>;

export type RoomAck = {ok: true; snapshot: RoomSnapshot} | {ok: false; error: RoomError};

export interface ClientToServerEvents {
  "room:create": (request: CreateRoomRequest, ack: (result: RoomAck) => void) => void;
  "room:join": (request: JoinRoomRequest, ack: (result: RoomAck) => void) => void;
  "room:command": (command: RoomCommand, ack: (result: RoomAck) => void) => void;
  "room:leave": (request: LeaveRoomRequest) => void;
}

export interface ServerToClientEvents {
  "room:snapshot": (snapshot: RoomSnapshot) => void;
  "room:event": (event: RoomEvent) => void;
  "room:presence": (presence: {connectedGuests: 0 | 1 | 2}) => void;
  "room:error": (error: RoomError) => void;
}
