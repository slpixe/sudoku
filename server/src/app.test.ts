import type {ServerResponse} from "node:http";
import {EventEmitter} from "node:events";
import {afterEach, describe, expect, it, vi} from "vitest";

import type {PuzzleCatalog} from "./catalog/PuzzleCatalog.js";
import type {Database} from "./db/Database.js";
import {MultiplayerMetrics} from "./metrics.js";
import {PresenceService} from "./rooms/PresenceService.js";
import {RoomService} from "./rooms/RoomService.js";
import {InMemoryRoomRepository} from "./testing/InMemoryRoomRepository.js";
import {createMultiplayerApp, type MultiplayerApp} from "./app.js";
import {installShutdownHandlers} from "./index.js";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1_000;

interface TestContext {
  app: MultiplayerApp;
  database: Database;
  metrics: MultiplayerMetrics;
  presence: PresenceService;
  repository: InMemoryRoomRepository;
  roomService: RoomService;
}

function createTestContext(): TestContext {
  const repository = new InMemoryRoomRepository();
  const catalog: PuzzleCatalog = {
    get: vi.fn(() => Promise.reject(new Error("Puzzle lookup is not used by app tests"))),
  };
  const roomService = new RoomService(repository, catalog);
  const presence = new PresenceService();
  const metrics = new MultiplayerMetrics();
  const database: Database = {
    query: vi.fn(),
    executeScript: vi.fn(),
    transaction: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const app = createMultiplayerApp({
    allowedOrigins: [],
    database,
    metrics,
    nodeEnv: "test",
    port: 0,
    presence,
    repository,
    roomService,
  });
  return {app, database, metrics, presence, repository, roomService};
}

async function request(app: MultiplayerApp, path: string): Promise<{body: unknown; statusCode: number}> {
  const handler = app.httpServer.listeners("request")[0];
  if (typeof handler !== "function") {
    throw new Error("Expected the app HTTP request handler to be registered");
  }

  return new Promise((resolve, reject) => {
    let body = "";
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      end(chunk?: string) {
        body += chunk ?? "";
        try {
          resolve({body: body.length === 0 ? null : JSON.parse(body), statusCode: this.statusCode});
        } catch (error) {
          reject(error);
        }
      },
    };

    Reflect.apply(handler, app.httpServer, [{method: "GET", url: path}, response as unknown as ServerResponse]);
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createMultiplayerApp", () => {
  it("reports process health without consulting the database", async () => {
    const {app, repository} = createTestContext();
    const ping = vi.spyOn(repository, "ping");

    await expect(request(app, "/health")).resolves.toEqual({
      body: {status: "ok"},
      statusCode: 200,
    });
    expect(ping).not.toHaveBeenCalled();
  });

  it("reports readiness only when the repository ping succeeds", async () => {
    const {app, repository} = createTestContext();

    await expect(request(app, "/ready")).resolves.toEqual({
      body: {status: "ready"},
      statusCode: 200,
    });

    vi.spyOn(repository, "ping").mockRejectedValueOnce(new Error("database unavailable"));
    await expect(request(app, "/ready")).resolves.toEqual({
      body: {status: "unavailable"},
      statusCode: 503,
    });
  });

  it("reports aggregate operational metrics without room or guest identifiers", async () => {
    const {app, metrics, presence} = createTestContext();
    const connected = presence.connect("ABC234", "guest-secret", "connection-secret");
    if (!connected.ok) {
      throw new Error("Expected test presence connection to be accepted");
    }
    presence.commit(connected.token);
    metrics.recordCommand(12);
    metrics.recordCommand(8);
    metrics.recordRejection("COMMAND_REJECTED");
    metrics.recordReconnect();
    metrics.recordDatabaseError();

    const response = await request(app, "/metrics");

    expect(response).toEqual({
      body: {
        activeRooms: 1,
        commands: {averageLatencyMs: 10, count: 2, totalLatencyMs: 20},
        connectedSockets: 0,
        databaseErrors: 1,
        reconnects: 1,
        rejections: {byCode: {COMMAND_REJECTED: 1}, total: 1},
      },
      statusCode: 200,
    });
    expect(JSON.stringify(response.body)).not.toContain("ABC234");
    expect(JSON.stringify(response.body)).not.toContain("guest-secret");
    expect(JSON.stringify(response.body)).not.toContain("connection-secret");
  });

  it("runs cleanup immediately and every fifteen minutes", async () => {
    vi.useFakeTimers();
    const {app, roomService} = createTestContext();
    const cleanup = vi.spyOn(roomService, "deleteExpiredRooms").mockResolvedValue(2);
    vi.spyOn(app.httpServer, "listen").mockImplementation(((...args: unknown[]) => {
      const callback = args.find((argument) => typeof argument === "function") as (() => void) | undefined;
      callback?.();
      return app.httpServer;
    }) as unknown as typeof app.httpServer.listen);
    vi.spyOn(app.io, "close").mockImplementation(async (callback?: () => void) => {
      callback?.();
    });
    vi.spyOn(app.httpServer, "close").mockImplementation(((callback?: (error?: Error) => void) => {
      callback?.();
      return app.httpServer;
    }) as typeof app.httpServer.close);

    await app.start();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenLastCalledWith(new Set());

    await vi.advanceTimersByTimeAsync(CLEANUP_INTERVAL_MS);
    expect(cleanup).toHaveBeenCalledTimes(2);

    await app.stop();
    await vi.advanceTimersByTimeAsync(CLEANUP_INTERVAL_MS);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("stops Socket.IO, HTTP, timers, and database resources idempotently", async () => {
    vi.useFakeTimers();
    const {app, database, roomService} = createTestContext();
    vi.spyOn(app.httpServer, "listen").mockImplementation(((...args: unknown[]) => {
      const callback = args.find((argument) => typeof argument === "function") as (() => void) | undefined;
      callback?.();
      return app.httpServer;
    }) as unknown as typeof app.httpServer.listen);
    const closeIo = vi.spyOn(app.io, "close").mockImplementation(async (callback?: () => void) => {
      callback?.();
    });
    const closeHttp = vi.spyOn(app.httpServer, "close").mockImplementation(((callback?: (error?: Error) => void) => {
      callback?.();
      return app.httpServer;
    }) as typeof app.httpServer.close);
    const cleanup = vi.spyOn(roomService, "deleteExpiredRooms").mockResolvedValue(0);

    await app.start();
    await Promise.all([app.stop(), app.stop()]);
    await vi.advanceTimersByTimeAsync(CLEANUP_INTERVAL_MS);

    expect(closeIo).toHaveBeenCalledTimes(1);
    expect(closeHttp).toHaveBeenCalledTimes(1);
    expect(database.close).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe("installShutdownHandlers", () => {
  it("shares one idempotent stop across SIGTERM and SIGINT", async () => {
    const signals = new EventEmitter();
    const stop = vi.fn().mockResolvedValue(undefined);
    const processTarget = {
      exitCode: undefined as number | undefined,
      off(signal: "SIGINT" | "SIGTERM", listener: () => void) {
        signals.off(signal, listener);
      },
      once(signal: "SIGINT" | "SIGTERM", listener: () => void) {
        signals.once(signal, listener);
      },
    };
    const log = vi.fn();
    const removeHandlers = installShutdownHandlers({stop} as unknown as MultiplayerApp, processTarget, log);

    signals.emit("SIGTERM");
    signals.emit("SIGINT");
    await Promise.resolve();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({event: "shutdown_started", signal: "SIGTERM"});
    expect(log).toHaveBeenCalledWith({event: "shutdown_complete"});
    removeHandlers();
  });
});
