import {fileURLToPath} from "node:url";
import path from "node:path";

import {createMultiplayerApp, type AggregateLogEntry, type MultiplayerApp} from "../app.js";
import {FilePuzzleCatalog} from "../catalog/FilePuzzleCatalog.js";
import type {Database, QueryResult} from "../db/Database.js";
import {installShutdownHandlers} from "../index.js";
import {PresenceService} from "../rooms/PresenceService.js";
import {RoomService} from "../rooms/RoomService.js";
import {InMemoryRoomRepository} from "./InMemoryRoomRepository.js";

const sudokusDirectory = fileURLToPath(new URL("../../../sudokus/", import.meta.url));
const MAX_TEST_RECONNECT_GRACE_SECONDS = 5;

type Environment = Readonly<Record<string, string | undefined>>;

export interface TestServerOptions {
  port: number;
  reconnectGraceSeconds: number;
}

export interface TestMultiplayerComposition {
  app: MultiplayerApp;
  catalog: FilePuzzleCatalog;
  presence: PresenceService;
  repository: InMemoryRoomRepository;
  roomService: RoomService;
}

function requiredInteger(environment: Environment, name: "PORT" | "RECONNECT_GRACE_SECONDS"): number {
  const rawValue = environment[name]?.trim();
  if (!rawValue || !/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be an integer`);
  }
  return Number(rawValue);
}

export function readTestServerOptions(environment: Environment = process.env): TestServerOptions {
  if (environment.NODE_ENV !== "test") {
    throw new Error("The disposable multiplayer server only runs with NODE_ENV=test");
  }

  const port = requiredInteger(environment, "PORT");
  const reconnectGraceSeconds = requiredInteger(environment, "RECONNECT_GRACE_SECONDS");
  if (port <= 1_024 || port > 65_535) {
    throw new Error("PORT must be between 1025 and 65535");
  }
  if (reconnectGraceSeconds > MAX_TEST_RECONNECT_GRACE_SECONDS) {
    throw new Error(`RECONNECT_GRACE_SECONDS must not exceed ${MAX_TEST_RECONNECT_GRACE_SECONDS}`);
  }

  return {port, reconnectGraceSeconds};
}

function createDisposableDatabase(): Database {
  return {
    async close(): Promise<void> {},
    async query<Row>(): Promise<QueryResult<Row>> {
      throw new Error("The disposable multiplayer server does not use database queries");
    },
    async transaction<T>(): Promise<T> {
      throw new Error("The disposable multiplayer server does not use database transactions");
    },
  };
}

function writeLog(entry: AggregateLogEntry): void {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

export function createTestMultiplayerComposition(
  environment: Environment = process.env,
  log: (entry: AggregateLogEntry) => void = writeLog,
): TestMultiplayerComposition {
  const {port, reconnectGraceSeconds} = readTestServerOptions(environment);
  const repository = new InMemoryRoomRepository();
  const catalog = new FilePuzzleCatalog(path.resolve(sudokusDirectory));
  const roomService = new RoomService(repository, catalog);
  const presence = new PresenceService(undefined, reconnectGraceSeconds * 1_000);

  const app = createMultiplayerApp({
    allowedOrigins: [],
    database: createDisposableDatabase(),
    host: "127.0.0.1",
    log,
    nodeEnv: "test",
    port,
    presence,
    repository,
    roomService,
  });

  return {app, catalog, presence, repository, roomService};
}

export async function main(): Promise<void> {
  const {app} = createTestMultiplayerComposition();
  const removeShutdownHandlers = installShutdownHandlers(app);
  try {
    await app.start();
  } catch (error) {
    removeShutdownHandlers();
    try {
      await app.stop();
    } catch {
      // The startup failure remains the primary failure.
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.exitCode = 1;
    process.stderr.write(`${error instanceof Error ? error.message : "Test server failed to start"}\n`);
  }
}
