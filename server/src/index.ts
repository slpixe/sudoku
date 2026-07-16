import {fileURLToPath} from "node:url";
import path from "node:path";

import {createMultiplayerApp, type AggregateLogEntry, type MultiplayerApp} from "./app.js";
import {FilePuzzleCatalog} from "./catalog/FilePuzzleCatalog.js";
import {loadServerConfig, type ServerConfig} from "./config.js";
import {PgDatabase} from "./db/PgDatabase.js";
import {MultiplayerMetrics} from "./metrics.js";
import {PostgresRoomRepository} from "./rooms/PostgresRoomRepository.js";
import {PresenceService} from "./rooms/PresenceService.js";
import {RoomService} from "./rooms/RoomService.js";

const sudokusDirectory = fileURLToPath(new URL("../../sudokus/", import.meta.url));

type Signal = "SIGINT" | "SIGTERM";

interface SignalProcess {
  exitCode?: number | string;
  once(signal: Signal, listener: () => void): unknown;
  off(signal: Signal, listener: () => void): unknown;
}

export interface ProductionComposition {
  app: MultiplayerApp;
  config: ServerConfig;
}

function writeLog(entry: AggregateLogEntry): void {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

export function createProductionMultiplayerApp(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  log: (entry: AggregateLogEntry) => void = writeLog,
): ProductionComposition {
  const config = loadServerConfig(environment);
  if (config.databaseUrl === undefined) {
    throw new Error("DATABASE_URL is required to start the multiplayer server");
  }

  const database = new PgDatabase(config.databaseUrl);
  const repository = new PostgresRoomRepository(database);
  const catalog = new FilePuzzleCatalog(path.resolve(sudokusDirectory));
  const roomService = new RoomService(
    repository,
    catalog,
    undefined,
    undefined,
    undefined,
    config.roomTtlHours * 60 * 60 * 1_000,
  );
  const presence = new PresenceService(undefined, config.reconnectGraceSeconds * 1_000);
  const metrics = new MultiplayerMetrics();

  return {
    app: createMultiplayerApp({
      allowedOrigins: config.allowedOrigins,
      database,
      log,
      metrics,
      nodeEnv: config.nodeEnv,
      port: config.port,
      presence,
      repository,
      roomService,
    }),
    config,
  };
}

export function installShutdownHandlers(
  app: MultiplayerApp,
  processTarget: SignalProcess = process,
  log: (entry: AggregateLogEntry) => void = writeLog,
): () => void {
  let shutdownPromise: Promise<void> | null = null;

  const shutdown = (signal: Signal): void => {
    if (shutdownPromise === null) {
      log({event: "shutdown_started", signal});
      shutdownPromise = app.stop().then(
        () => {
          log({event: "shutdown_complete"});
        },
        () => {
          processTarget.exitCode = 1;
          log({event: "shutdown_failed"});
        },
      );
    }
  };

  const onSigterm = (): void => shutdown("SIGTERM");
  const onSigint = (): void => shutdown("SIGINT");
  processTarget.once("SIGTERM", onSigterm);
  processTarget.once("SIGINT", onSigint);

  return () => {
    processTarget.off("SIGTERM", onSigterm);
    processTarget.off("SIGINT", onSigint);
  };
}

export async function main(): Promise<void> {
  const {app} = createProductionMultiplayerApp();
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
  } catch {
    process.exitCode = 1;
    process.stderr.write(`${JSON.stringify({event: "server_start_failed"})}\n`);
  }
}
