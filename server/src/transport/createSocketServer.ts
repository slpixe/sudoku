import {
  MULTIPLAYER_PROTOCOL_VERSION,
  clientRoomCommandSchema,
  createRoomRequestSchema,
  joinRoomRequestSchema,
  leaveRoomRequestSchema,
  type ClientToServerEvents,
  type RoomAck,
  type RoomError,
  type RoomErrorCode,
  type RoomSnapshot,
  type ServerToClientEvents,
} from "@sudoku/multiplayer-protocol";
import type {Server as HttpServer} from "node:http";
import {Server} from "socket.io";
import {z} from "zod";

import type {Clock} from "../rooms/Clock.js";
import {SystemClock} from "../rooms/Clock.js";
import type {PresenceService, PresenceUpdate} from "../rooms/PresenceService.js";
import type {RoomService} from "../rooms/RoomService.js";
import {TokenBucketRateLimiter} from "./rateLimit.js";

const MAX_HTTP_BUFFER_SIZE = 16 * 1024;

interface Membership {
  readonly guestId: string;
  readonly clientConnectionId: string;
}

interface SocketData {
  memberships: Map<string, Membership>;
}

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface CreateSocketServerOptions {
  roomService: RoomService;
  presence: PresenceService;
  nodeEnv?: "development" | "test" | "production";
  allowedOrigins?: readonly string[];
  clock?: Clock;
}

const protocolHandshakeSchema = z
  .object({protocolVersion: z.literal(MULTIPLAYER_PROTOCOL_VERSION)})
  .strict();

function roomError(code: RoomErrorCode, message: string): RoomError {
  return {code, message};
}

function invalidRequest(message = "The request is invalid"): RoomError {
  return roomError("INVALID_REQUEST", message);
}

function acknowledge(ack: (result: RoomAck) => void, result: RoomAck): void {
  if (typeof ack === "function") {
    ack(result);
  }
}

function snapshotWithPresence(snapshot: RoomSnapshot, connectedGuests: 0 | 1 | 2): RoomSnapshot {
  return {...snapshot, connectedGuests};
}

function commandError(error: unknown): RoomError {
  const message = error instanceof Error ? error.message : "The room command could not be completed";
  if (/not found/i.test(message)) {
    return roomError("ROOM_NOT_FOUND", "The room was not found");
  }
  if (/expired/i.test(message)) {
    return roomError("ROOM_EXPIRED", "The room has expired");
  }
  if (
    /completed|paused|running|given cell|did not change|no room action|clear is allowed|only resume/i.test(message)
  ) {
    return roomError("COMMAND_REJECTED", message);
  }
  return roomError("SERVICE_UNAVAILABLE", "The room service is temporarily unavailable");
}

function createError(error: unknown): RoomError {
  const message = error instanceof Error ? error.message : "The room could not be created";
  if (/fingerprint|catalog|puzzle/i.test(message)) {
    return roomError("PUZZLE_VERSION_MISMATCH", "The selected puzzle version does not match the server");
  }
  return roomError("SERVICE_UNAVAILABLE", "The room service is temporarily unavailable");
}

export function createSocketServer(httpServer: HttpServer, options: CreateSocketServerOptions): TypedServer {
  const clock = options.clock ?? new SystemClock();
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const isAllowedOrigin = (origin: string | undefined): boolean =>
    options.nodeEnv !== "production" || origin === undefined || allowedOrigins.has(origin);

  const io: TypedServer = new Server(httpServer, {
    maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE,
    cors: {
      origin(origin, callback) {
        callback(null, isAllowedOrigin(origin));
      },
    },
    allowRequest(request, callback) {
      callback(null, isAllowedOrigin(request.headers.origin));
    },
  });

  const createLimiter = new TokenBucketRateLimiter(5, 60_000, clock);
  const failedJoinLimiter = new TokenBucketRateLimiter(20, 60_000, clock);
  const commandLimiter = new TokenBucketRateLimiter(30, 1_000, clock);

  io.use((socket, next) => {
    const parsed = protocolHandshakeSchema.safeParse(socket.handshake.auth);
    if (parsed.success) {
      next();
      return;
    }
    const error = new Error("Multiplayer protocol version mismatch") as Error & {data: RoomError};
    error.data = roomError("VERSION_MISMATCH", "Refresh the app to use the current multiplayer protocol");
    next(error);
  });

  io.on("connection", (socket) => {
    socket.data.memberships = new Map();
    const networkSource = socket.handshake.address;

    const broadcastPresence = (roomCode: string, connectedGuests: 0 | 1 | 2): void => {
      io.to(roomCode).emit("room:presence", {connectedGuests});
    };

    const scheduleReservationExpiry = (
      roomCode: string,
      guestId: string,
      reservationExpiresAt: number | null,
    ): void => {
      if (reservationExpiresAt === null) {
        return;
      }
      const timer = setTimeout(() => {
        options.presence.expireReservation(roomCode, guestId, reservationExpiresAt);
      }, Math.max(0, reservationExpiresAt - clock.now().getTime()));
      timer.unref();
    };

    const finishDisconnect = async (
      roomCode: string,
      membership: Membership,
      update: PresenceUpdate,
      leaveSocketRoom: boolean,
    ): Promise<void> => {
      scheduleReservationExpiry(roomCode, membership.guestId, update.reservationExpiresAt);
      if (leaveSocketRoom) {
        await socket.leave(roomCode);
      }
      broadcastPresence(roomCode, update.connectedGuests);
      if (update.connectedGuests === 0) {
        await options.roomService.markRoomInactive(roomCode);
      }
    };

    socket.on("room:create", async (unparsedRequest, ack) => {
      const parsed = createRoomRequestSchema.safeParse(unparsedRequest);
      if (!parsed.success) {
        acknowledge(ack, {ok: false, error: invalidRequest()});
        return;
      }
      if (!createLimiter.consume(networkSource)) {
        acknowledge(ack, {ok: false, error: invalidRequest("Too many rooms were created from this network")});
        return;
      }

      let reservedRoom: string | null = null;
      try {
        const snapshot = await options.roomService.createRoom({
          collectionId: parsed.data.collectionId,
          puzzleNumber: parsed.data.puzzleNumber,
          givensFingerprint: parsed.data.puzzleFingerprint,
        });
        const connected = options.presence.connect(snapshot.roomCode, parsed.data.guestId, socket.id);
        if (!connected.ok) {
          acknowledge(ack, {ok: false, error: roomError("ROOM_FULL", "This room already has two guests")});
          return;
        }
        reservedRoom = snapshot.roomCode;
        await socket.join(snapshot.roomCode);
        socket.data.memberships.set(snapshot.roomCode, {
          guestId: parsed.data.guestId,
          clientConnectionId: parsed.data.connectionId,
        });
        reservedRoom = null;
        const publicSnapshot = snapshotWithPresence(snapshot, connected.connectedGuests);
        socket.emit("room:snapshot", publicSnapshot);
        broadcastPresence(snapshot.roomCode, connected.connectedGuests);
        acknowledge(ack, {ok: true, snapshot: publicSnapshot});
      } catch (error) {
        if (reservedRoom !== null) {
          options.presence.rollback(reservedRoom, parsed.data.guestId, socket.id);
        }
        acknowledge(ack, {ok: false, error: createError(error)});
      }
    });

    socket.on("room:join", async (unparsedRequest, ack) => {
      const parsed = joinRoomRequestSchema.safeParse(unparsedRequest);
      if (!parsed.success) {
        acknowledge(ack, {ok: false, error: invalidRequest()});
        return;
      }

      const request = parsed.data;
      const existingMembership = socket.data.memberships.get(request.roomCode);
      if (
        existingMembership &&
        (existingMembership.guestId !== request.guestId ||
          existingMembership.clientConnectionId !== request.connectionId)
      ) {
        acknowledge(ack, {ok: false, error: invalidRequest("This socket already joined the room")});
        return;
      }
      if (!failedJoinLimiter.hasCapacity(networkSource)) {
        acknowledge(ack, {ok: false, error: invalidRequest("Too many unsuccessful room joins")});
        return;
      }

      const connected = options.presence.connect(request.roomCode, request.guestId, socket.id);
      if (!connected.ok) {
        acknowledge(ack, {ok: false, error: roomError("ROOM_FULL", "This room already has two guests")});
        return;
      }

      try {
        const existing = await options.roomService.repository.getSnapshot(request.roomCode, clock.now());
        if (!existing || Date.parse(existing.expiresAt) <= clock.now().getTime()) {
          options.presence.rollback(request.roomCode, request.guestId, socket.id);
          failedJoinLimiter.consume(networkSource);
          const error = existing
            ? roomError("ROOM_EXPIRED", "The room has expired")
            : roomError("ROOM_NOT_FOUND", "The room was not found");
          acknowledge(ack, {ok: false, error});
          return;
        }

        const snapshot = await options.roomService.joinRoom(request.roomCode);
        if (!snapshot) {
          options.presence.rollback(request.roomCode, request.guestId, socket.id);
          failedJoinLimiter.consume(networkSource);
          acknowledge(ack, {ok: false, error: roomError("ROOM_NOT_FOUND", "The room was not found")});
          return;
        }

        await socket.join(request.roomCode);
        socket.data.memberships.set(request.roomCode, {
          guestId: request.guestId,
          clientConnectionId: request.connectionId,
        });
        const publicSnapshot = snapshotWithPresence(snapshot, connected.connectedGuests);
        socket.emit("room:snapshot", publicSnapshot);
        broadcastPresence(request.roomCode, connected.connectedGuests);
        acknowledge(ack, {ok: true, snapshot: publicSnapshot});
      } catch {
        options.presence.rollback(request.roomCode, request.guestId, socket.id);
        acknowledge(ack, {
          ok: false,
          error: roomError("SERVICE_UNAVAILABLE", "The room service is temporarily unavailable"),
        });
      }
    });

    socket.on("room:command", async (unparsedCommand, ack) => {
      const parsed = clientRoomCommandSchema.safeParse(unparsedCommand);
      if (!parsed.success) {
        acknowledge(ack, {ok: false, error: invalidRequest()});
        return;
      }
      if (!socket.data.memberships.has(parsed.data.roomCode)) {
        acknowledge(ack, {ok: false, error: roomError("COMMAND_REJECTED", "Join the room before changing it")});
        return;
      }
      if (!commandLimiter.consume(socket.id)) {
        acknowledge(ack, {ok: false, error: invalidRequest("Too many room commands")});
        return;
      }

      try {
        const result = await options.roomService.execute(parsed.data);
        const snapshot = snapshotWithPresence(
          result.snapshot,
          options.presence.connectedGuests(parsed.data.roomCode),
        );
        if (!result.duplicate) {
          io.to(parsed.data.roomCode).emit("room:event", result.event);
        }
        acknowledge(ack, {ok: true, snapshot});
      } catch (error) {
        acknowledge(ack, {ok: false, error: commandError(error)});
      }
    });

    socket.on("room:leave", async (unparsedRequest) => {
      const parsed = leaveRoomRequestSchema.safeParse(unparsedRequest);
      if (!parsed.success) {
        socket.emit("room:error", invalidRequest());
        return;
      }
      const membership = socket.data.memberships.get(parsed.data.roomCode);
      if (!membership || membership.clientConnectionId !== parsed.data.connectionId) {
        socket.emit("room:error", invalidRequest("This socket is not connected to that room"));
        return;
      }

      socket.data.memberships.delete(parsed.data.roomCode);
      const update = options.presence.disconnect(parsed.data.roomCode, membership.guestId, socket.id);
      await finishDisconnect(parsed.data.roomCode, membership, update, true);
    });

    socket.on("disconnect", () => {
      commandLimiter.delete(socket.id);
      const memberships = [...socket.data.memberships];
      socket.data.memberships.clear();
      for (const [roomCode, membership] of memberships) {
        const update = options.presence.disconnect(roomCode, membership.guestId, socket.id);
        void finishDisconnect(roomCode, membership, update, false);
      }
    });
  });

  return io;
}
