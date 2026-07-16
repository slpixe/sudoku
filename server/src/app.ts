import {createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse} from "node:http";

import type {Database} from "./db/Database.js";
import {MultiplayerMetrics} from "./metrics.js";
import type {PresenceService} from "./rooms/PresenceService.js";
import type {RoomRepository} from "./rooms/RoomRepository.js";
import type {RoomService} from "./rooms/RoomService.js";
import {createSocketServer} from "./transport/createSocketServer.js";

const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1_000;
const SERVER_NOT_RUNNING = "ERR_SERVER_NOT_RUNNING";

export interface AggregateLogEntry {
  event: string;
  [field: string]: boolean | number | string;
}

export interface CreateMultiplayerAppDependencies {
  allowedOrigins: readonly string[];
  database: Database;
  metrics?: MultiplayerMetrics;
  nodeEnv: "development" | "test" | "production";
  port: number;
  presence: PresenceService;
  repository: RoomRepository;
  roomService: RoomService;
  cleanupIntervalMs?: number;
  host?: string;
  log?: (entry: AggregateLogEntry) => void;
}

export interface MultiplayerApp {
  httpServer: HttpServer;
  io: ReturnType<typeof createSocketServer>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function requestPath(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://multiplayer.internal").pathname;
}

function isServerNotRunning(error: Error | undefined): boolean {
  return error !== undefined && "code" in error && error.code === SERVER_NOT_RUNNING;
}

export function createMultiplayerApp(dependencies: CreateMultiplayerAppDependencies): MultiplayerApp {
  const metrics = dependencies.metrics ?? new MultiplayerMetrics();
  const log = dependencies.log ?? (() => {});
  let io: ReturnType<typeof createSocketServer>;

  const httpServer = createServer((request, response) => {
    if (request.method !== "GET") {
      sendJson(response, 404, {status: "not_found"});
      return;
    }

    switch (requestPath(request)) {
      case "/health":
        sendJson(response, 200, {status: "ok"});
        return;
      case "/ready":
        void dependencies.repository.ping().then(
          () => sendJson(response, 200, {status: "ready"}),
          () => {
            metrics.recordDatabaseError();
            log({event: "database_error", operation: "readiness"});
            sendJson(response, 503, {status: "unavailable"});
          },
        );
        return;
      case "/metrics":
        sendJson(
          response,
          200,
          metrics.snapshot(io.engine.clientsCount, dependencies.presence.activeRoomCodes().size),
        );
        return;
      default:
        sendJson(response, 404, {status: "not_found"});
    }
  });

  io = createSocketServer(httpServer, {
    allowedOrigins: dependencies.allowedOrigins,
    metrics,
    nodeEnv: dependencies.nodeEnv,
    onError: () => {
      metrics.recordDatabaseError();
      log({event: "database_error", operation: "socket_cleanup"});
    },
    presence: dependencies.presence,
    roomService: dependencies.roomService,
  });

  let cleanupInterval: ReturnType<typeof setInterval> | null = null;
  let cleanupInFlight: Promise<void> | null = null;
  let startPromise: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;

  const cleanup = (): Promise<void> => {
    if (cleanupInFlight !== null) {
      return cleanupInFlight;
    }
    cleanupInFlight = (async () => {
      const activeRoomCodes = dependencies.presence.activeRoomCodes();
      try {
        const deletedRooms = await dependencies.roomService.deleteExpiredRooms(activeRoomCodes);
        log({activeRooms: activeRoomCodes.size, deletedRooms, event: "room_cleanup_complete"});
      } catch {
        metrics.recordDatabaseError();
        log({activeRooms: activeRoomCodes.size, event: "database_error", operation: "room_cleanup"});
      }
    })().finally(() => {
      cleanupInFlight = null;
    });
    return cleanupInFlight;
  };

  const closeSocketServer = (): Promise<void> => new Promise((resolve) => {
    io.close(() => resolve());
  });

  const closeHttpServer = (): Promise<void> => new Promise((resolve, reject) => {
    httpServer.closeIdleConnections();
    httpServer.closeAllConnections();
    httpServer.close((error) => {
      if (error && !isServerNotRunning(error)) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  return {
    httpServer,
    io,
    start() {
      if (startPromise !== null) {
        return startPromise;
      }
      startPromise = (async () => {
        await cleanup();
        cleanupInterval = setInterval(() => {
          void cleanup();
        }, dependencies.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS);
        cleanupInterval.unref();

        await new Promise<void>((resolve, reject) => {
          const onError = (error: Error): void => {
            httpServer.off("error", onError);
            reject(error);
          };
          httpServer.once("error", onError);
          httpServer.listen(dependencies.port, dependencies.host ?? "0.0.0.0", () => {
            httpServer.off("error", onError);
            log({event: "server_started", port: dependencies.port});
            resolve();
          });
        });
      })();
      return startPromise;
    },
    stop() {
      if (stopPromise !== null) {
        return stopPromise;
      }
      stopPromise = (async () => {
        if (cleanupInterval !== null) {
          clearInterval(cleanupInterval);
          cleanupInterval = null;
        }
        if (cleanupInFlight !== null) {
          await cleanupInFlight;
        }

        const failures: unknown[] = [];
        for (const closeResource of [
          closeSocketServer,
          closeHttpServer,
          () => dependencies.database.close(),
        ]) {
          try {
            await closeResource();
          } catch (error) {
            failures.push(error);
          }
        }
        log({event: "server_stopped", failures: failures.length});
        if (failures.length > 0) {
          throw new AggregateError(failures, "Failed to stop every multiplayer server resource");
        }
      })();
      return stopPromise;
    },
  };
}
