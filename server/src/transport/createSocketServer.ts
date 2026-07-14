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

import type {MetricsRecorder} from "../metrics.js";
import type {Clock} from "../rooms/Clock.js";
import {SystemClock} from "../rooms/Clock.js";
import type {
  PresenceConnectionToken,
  PresenceService,
  PresenceUpdate,
} from "../rooms/PresenceService.js";
import type {RoomService} from "../rooms/RoomService.js";
import {TokenBucketRateLimiter} from "./rateLimit.js";

const MAX_HTTP_BUFFER_SIZE = 16 * 1024;

interface MembershipIdentity {
  readonly guestId: string;
  readonly clientConnectionId: string;
}

interface PendingMembership extends MembershipIdentity {
  readonly state: "pending";
  readonly token: PresenceConnectionToken;
}

interface LiveMembership extends MembershipIdentity {
  readonly state: "live";
}

type Membership = PendingMembership | LiveMembership;

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
  metrics?: MetricsRecorder;
  onError?: (error: unknown, context: TransportErrorContext) => void | Promise<void>;
}

export interface TransportErrorContext {
  operation: "room:leave" | "disconnect";
  roomCode: string;
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

function instrumentAcknowledgement(
  ack: (result: RoomAck) => void,
  metrics: MetricsRecorder | undefined,
  commandStartedAt?: number,
): (result: RoomAck) => void {
  let recordedCommand = false;
  return (result) => {
    if (!result.ok) {
      metrics?.recordRejection(result.error.code);
    }
    if (commandStartedAt !== undefined && !recordedCommand) {
      recordedCommand = true;
      metrics?.recordCommand(Date.now() - commandStartedAt);
    }
    acknowledge(ack, result);
  };
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
    options.nodeEnv !== "production" || (origin !== undefined && allowedOrigins.has(origin));

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

    const reportError = (error: unknown, context: TransportErrorContext): void => {
      try {
        void Promise.resolve(options.onError?.(error, context)).catch(() => {});
      } catch {
        // Error reporting must never create a second unhandled failure.
      }
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

    const rollbackPresence = (membership: PendingMembership): PresenceUpdate => {
      const update = options.presence.rollback(membership.token);
      scheduleReservationExpiry(
        membership.token.roomCode,
        membership.guestId,
        update.reservationExpiresAt,
      );
      return update;
    };

    const releasePendingIfOwned = (
      roomCode: string,
      membership: PendingMembership,
    ): PresenceUpdate | null => {
      if (socket.data.memberships.get(roomCode) !== membership) {
        return null;
      }
      socket.data.memberships.delete(roomCode);
      return rollbackPresence(membership);
    };

    const ownsPending = (roomCode: string, membership: PendingMembership): boolean =>
      socket.connected && socket.data.memberships.get(roomCode) === membership;

    const finishCleanup = async (
      roomCode: string,
      membership: Membership,
      update: PresenceUpdate,
      leaveSocketRoom: boolean,
    ): Promise<void> => {
      scheduleReservationExpiry(roomCode, membership.guestId, update.reservationExpiresAt);
      if (leaveSocketRoom) {
        await socket.leave(roomCode);
      }
      const connectedGuests = options.presence.connectedGuests(roomCode);
      broadcastPresence(roomCode, connectedGuests);
      if (membership.state === "live" && connectedGuests === 0) {
        await options.roomService.markRoomInactive(roomCode);
      }
    };

    socket.on("room:create", async (unparsedRequest, rawAck) => {
      const ack = instrumentAcknowledgement(rawAck, options.metrics);
      const parsed = createRoomRequestSchema.safeParse(unparsedRequest);
      if (!parsed.success) {
        acknowledge(ack, {ok: false, error: invalidRequest()});
        return;
      }
      if (!createLimiter.consume(networkSource)) {
        acknowledge(ack, {ok: false, error: invalidRequest("Too many rooms were created from this network")});
        return;
      }

      let pending: PendingMembership | null = null;
      let roomCode: string | null = null;
      try {
        const snapshot = await options.roomService.createRoom({
          collectionId: parsed.data.collectionId,
          puzzleNumber: parsed.data.puzzleNumber,
          givensFingerprint: parsed.data.puzzleFingerprint,
        });
        roomCode = snapshot.roomCode;
        if (!socket.connected) {
          return;
        }
        if (socket.data.memberships.has(snapshot.roomCode)) {
          acknowledge(ack, {ok: false, error: invalidRequest("This socket already joined the room")});
          return;
        }
        const connected = options.presence.connect(snapshot.roomCode, parsed.data.guestId, socket.id);
        if (!connected.ok) {
          acknowledge(ack, {ok: false, error: roomError("ROOM_FULL", "This room already has two guests")});
          return;
        }
        pending = {
          state: "pending",
          guestId: parsed.data.guestId,
          clientConnectionId: parsed.data.connectionId,
          token: connected.token,
        };
        socket.data.memberships.set(snapshot.roomCode, pending);
        await socket.join(snapshot.roomCode);
        if (!ownsPending(snapshot.roomCode, pending)) {
          releasePendingIfOwned(snapshot.roomCode, pending);
          return;
        }
        const committed = options.presence.commit(pending.token);
        if (!committed.ok) {
          releasePendingIfOwned(snapshot.roomCode, pending);
          acknowledge(ack, {
            ok: false,
            error: roomError("SERVICE_UNAVAILABLE", "The room service is temporarily unavailable"),
          });
          return;
        }
        socket.data.memberships.set(snapshot.roomCode, {
          state: "live",
          guestId: parsed.data.guestId,
          clientConnectionId: parsed.data.connectionId,
        });
        pending = null;
        const connectedGuests = options.presence.connectedGuests(snapshot.roomCode);
        const publicSnapshot = snapshotWithPresence(snapshot, connectedGuests);
        socket.emit("room:snapshot", publicSnapshot);
        broadcastPresence(snapshot.roomCode, connectedGuests);
        acknowledge(ack, {ok: true, snapshot: publicSnapshot});
      } catch (error) {
        if (pending !== null && roomCode !== null) {
          releasePendingIfOwned(roomCode, pending);
        }
        const responseError = createError(error);
        if (responseError.code === "SERVICE_UNAVAILABLE") {
          options.metrics?.recordDatabaseError();
        }
        acknowledge(ack, {ok: false, error: responseError});
      }
    });

    socket.on("room:join", async (unparsedRequest, rawAck) => {
      const ack = instrumentAcknowledgement(rawAck, options.metrics);
      const parsed = joinRoomRequestSchema.safeParse(unparsedRequest);
      if (!parsed.success) {
        acknowledge(ack, {ok: false, error: invalidRequest()});
        return;
      }

      const request = parsed.data;
      if (!failedJoinLimiter.consume(networkSource)) {
        acknowledge(ack, {ok: false, error: invalidRequest("Too many unsuccessful room joins")});
        return;
      }
      const existingMembership = socket.data.memberships.get(request.roomCode);
      if (existingMembership) {
        const message =
          existingMembership.guestId !== request.guestId ||
          existingMembership.clientConnectionId !== request.connectionId
            ? "This socket cannot join the room as a different guest"
            : "This socket already joined or is joining the room";
        acknowledge(ack, {ok: false, error: invalidRequest(message)});
        return;
      }

      const connected = options.presence.connect(request.roomCode, request.guestId, socket.id);
      if (!connected.ok) {
        acknowledge(ack, {ok: false, error: roomError("ROOM_FULL", "This room already has two guests")});
        return;
      }
      const pending: PendingMembership = {
        state: "pending",
        guestId: request.guestId,
        clientConnectionId: request.connectionId,
        token: connected.token,
      };
      socket.data.memberships.set(request.roomCode, pending);

      const continuePending = (): boolean => {
        if (ownsPending(request.roomCode, pending)) {
          return true;
        }
        releasePendingIfOwned(request.roomCode, pending);
        if (socket.connected) {
          acknowledge(ack, {
            ok: false,
            error: roomError("COMMAND_REJECTED", "The room join was cancelled"),
          });
        }
        return false;
      };

      try {
        const existing = await options.roomService.repository.getSnapshot(request.roomCode, clock.now());
        if (!continuePending()) {
          return;
        }
        if (!existing || Date.parse(existing.expiresAt) <= clock.now().getTime()) {
          releasePendingIfOwned(request.roomCode, pending);
          const error = existing
            ? roomError("ROOM_EXPIRED", "The room has expired")
            : roomError("ROOM_NOT_FOUND", "The room was not found");
          acknowledge(ack, {ok: false, error});
          return;
        }

        const snapshot = await options.roomService.joinRoom(request.roomCode);
        if (!continuePending()) {
          return;
        }
        if (!snapshot) {
          releasePendingIfOwned(request.roomCode, pending);
          acknowledge(ack, {ok: false, error: roomError("ROOM_NOT_FOUND", "The room was not found")});
          return;
        }

        await socket.join(request.roomCode);
        if (!continuePending()) {
          return;
        }
        const committed = options.presence.commit(pending.token);
        if (!committed.ok) {
          releasePendingIfOwned(request.roomCode, pending);
          acknowledge(ack, {
            ok: false,
            error: roomError("SERVICE_UNAVAILABLE", "The room service is temporarily unavailable"),
          });
          return;
        }
        socket.data.memberships.set(request.roomCode, {
          state: "live",
          guestId: request.guestId,
          clientConnectionId: request.connectionId,
        });
        options.metrics?.recordReconnect();
        failedJoinLimiter.refund(networkSource);
        const connectedGuests = options.presence.connectedGuests(request.roomCode);
        const publicSnapshot = snapshotWithPresence(snapshot, connectedGuests);
        socket.emit("room:snapshot", publicSnapshot);
        broadcastPresence(request.roomCode, connectedGuests);
        acknowledge(ack, {ok: true, snapshot: publicSnapshot});
      } catch {
        releasePendingIfOwned(request.roomCode, pending);
        options.metrics?.recordDatabaseError();
        acknowledge(ack, {
          ok: false,
          error: roomError("SERVICE_UNAVAILABLE", "The room service is temporarily unavailable"),
        });
      }
    });

    socket.on("room:command", async (unparsedCommand, rawAck) => {
      const ack = instrumentAcknowledgement(rawAck, options.metrics, Date.now());
      const parsed = clientRoomCommandSchema.safeParse(unparsedCommand);
      if (!parsed.success) {
        acknowledge(ack, {ok: false, error: invalidRequest()});
        return;
      }
      if (socket.data.memberships.get(parsed.data.roomCode)?.state !== "live") {
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
        const responseError = commandError(error);
        if (responseError.code === "SERVICE_UNAVAILABLE") {
          options.metrics?.recordDatabaseError();
        }
        acknowledge(ack, {ok: false, error: responseError});
      }
    });

    socket.on("room:leave", (unparsedRequest) => {
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
      let update: PresenceUpdate;
      try {
        update =
          membership.state === "pending"
            ? rollbackPresence(membership)
            : options.presence.disconnect(parsed.data.roomCode, membership.guestId, socket.id);
      } catch (error) {
        reportError(error, {operation: "room:leave", roomCode: parsed.data.roomCode});
        socket.emit(
          "room:error",
          roomError("SERVICE_UNAVAILABLE", "The room service is temporarily unavailable"),
        );
        return;
      }
      void finishCleanup(parsed.data.roomCode, membership, update, true).catch((error: unknown) => {
        reportError(error, {operation: "room:leave", roomCode: parsed.data.roomCode});
        if (socket.connected) {
          socket.emit(
            "room:error",
            roomError("SERVICE_UNAVAILABLE", "The room service is temporarily unavailable"),
          );
        }
      });
    });

    socket.on("disconnect", () => {
      commandLimiter.delete(socket.id);
      const memberships = [...socket.data.memberships];
      socket.data.memberships.clear();
      for (const [roomCode, membership] of memberships) {
        try {
          const update =
            membership.state === "pending"
              ? rollbackPresence(membership)
              : options.presence.disconnect(roomCode, membership.guestId, socket.id);
          void finishCleanup(roomCode, membership, update, false).catch((error: unknown) => {
            reportError(error, {operation: "disconnect", roomCode});
          });
        } catch (error) {
          reportError(error, {operation: "disconnect", roomCode});
        }
      }
    });
  });

  return io;
}
