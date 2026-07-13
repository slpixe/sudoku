import {
  MULTIPLAYER_PROTOCOL_VERSION,
  type ClientToServerEvents,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type RoomAck,
  type RoomEvent,
  type RoomSnapshot,
  type ServerToClientEvents,
} from "@sudoku/multiplayer-protocol";
import {createServer, type Server as HttpServer} from "node:http";
import type {AddressInfo} from "node:net";
import {io as createClient, type Socket as ClientSocket} from "socket.io-client";
import type {Server as SocketServer} from "socket.io";
import {afterEach, describe, expect, it} from "vitest";

import type {CanonicalPuzzle, PuzzleCatalog} from "../catalog/PuzzleCatalog.js";
import type {Clock} from "../rooms/Clock.js";
import {PresenceService} from "../rooms/PresenceService.js";
import {RoomService} from "../rooms/RoomService.js";
import {InMemoryRoomRepository} from "../testing/InMemoryRoomRepository.js";
import {createSocketServer} from "./createSocketServer.js";

const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179"
  .split("")
  .map(Number);
const GIVENS = SOLUTION.map((value, index) => (index === 1 ? 0 : value));
const FINGERPRINT = GIVENS.join("");
const GUEST_ONE = "123e4567-e89b-42d3-a456-426614174000";
const GUEST_TWO = "123e4567-e89b-42d3-a456-426614174001";
const GUEST_THREE = "123e4567-e89b-42d3-a456-426614174002";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

class FakeCatalog implements PuzzleCatalog {
  async get(): Promise<CanonicalPuzzle> {
    return {collectionId: "easy", puzzleNumber: 1, givens: [...GIVENS], solution: [...SOLUTION]};
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-07-13T10:00:00.000Z");
  }
}

interface TestRuntime {
  httpServer: HttpServer;
  io: SocketServer;
  url: string;
}

const clients = new Set<TestClient>();
const runtimes = new Set<TestRuntime>();

function uuid(index: number): string {
  return `123e4567-e89b-42d3-a456-${String(426614174000 + index).padStart(12, "0")}`;
}

function createRequest(guestId = GUEST_ONE, connectionIndex = 10): CreateRoomRequest {
  return {
    guestId,
    connectionId: uuid(connectionIndex),
    collectionId: "easy",
    puzzleNumber: 1,
    puzzleFingerprint: FINGERPRINT,
  };
}

async function startRuntime(
  repository = new InMemoryRoomRepository(),
  options: {nodeEnv?: "test" | "production"; allowedOrigins?: string[]} = {},
): Promise<TestRuntime> {
  const httpServer = createServer();
  const clock = new FixedClock();
  let roomSequence = 0;
  const codes = ["ABC234", "DEF567", "GHJ678", "KLM789", "NPQ234"];
  const service = new RoomService(
    repository,
    new FakeCatalog(),
    clock,
    () => codes[roomSequence++] ?? "RST567",
    () => uuid(900 + roomSequence),
  );
  const io = createSocketServer(httpServer, {
    roomService: service,
    presence: new PresenceService(clock),
    nodeEnv: options.nodeEnv ?? "test",
    allowedOrigins: options.allowedOrigins ?? [],
    clock,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      httpServer.once("error", onError);
      httpServer.listen(0, "127.0.0.1", () => {
        httpServer.off("error", onError);
        resolve();
      });
    });
  } catch (error) {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    throw error;
  }
  const address = httpServer.address() as AddressInfo;
  const runtime = {httpServer, io, url: `http://127.0.0.1:${address.port}`};
  runtimes.add(runtime);
  return runtime;
}

function connect(
  url: string,
  options: {protocolVersion?: number; origin?: string} = {},
): Promise<TestClient> {
  const socket: TestClient = createClient(url, {
    auth: {protocolVersion: options.protocolVersion ?? MULTIPLAYER_PROTOCOL_VERSION},
    extraHeaders: options.origin ? {Origin: options.origin} : undefined,
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  });
  clients.add(socket);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function emitCreate(socket: TestClient, request: CreateRoomRequest): Promise<RoomAck> {
  return new Promise((resolve) => socket.emit("room:create", request, resolve));
}

function emitJoin(socket: TestClient, request: JoinRoomRequest): Promise<RoomAck> {
  return new Promise((resolve) => socket.emit("room:join", request, resolve));
}

async function stopRuntime(runtime: TestRuntime): Promise<void> {
  runtimes.delete(runtime);
  runtime.io.disconnectSockets(true);
  await new Promise<void>((resolve) => runtime.io.close(() => resolve()));
  if (runtime.httpServer.listening) {
    await new Promise<void>((resolve, reject) =>
      runtime.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

afterEach(async () => {
  for (const client of clients) {
    client.close();
  }
  clients.clear();
  for (const runtime of [...runtimes]) {
    await stopRuntime(runtime);
  }
});

describe("createSocketServer", () => {
  it("rejects a protocol mismatch during the handshake", async () => {
    const runtime = await startRuntime();
    const socket = createClient(runtime.url, {
      auth: {protocolVersion: MULTIPLAYER_PROTOCOL_VERSION + 1},
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
    });

    const error = await new Promise<Error & {data?: {code?: string}}>((resolve) => socket.once("connect_error", resolve));
    socket.close();
    expect(error.data?.code).toBe("VERSION_MISMATCH");
    expect(socket.connected).toBe(false);
  });

  it("creates, joins, commits and broadcasts, reconnects, and recovers after restart", async () => {
    const repository = new InMemoryRoomRepository();
    const firstRuntime = await startRuntime(repository);
    const first = await connect(firstRuntime.url);
    const created = await emitCreate(first, createRequest());
    expect(created).toMatchObject({ok: true, snapshot: {roomCode: "ABC234", connectedGuests: 1}});
    if (!created.ok) {
      throw new Error("Expected room creation to succeed");
    }

    const second = await connect(firstRuntime.url);
    const secondSnapshot = new Promise<RoomSnapshot>((resolve) => second.once("room:snapshot", resolve));
    await expect(
      emitJoin(second, {guestId: GUEST_TWO, connectionId: uuid(11), roomCode: created.snapshot.roomCode}),
    ).resolves.toMatchObject({ok: true, snapshot: {connectedGuests: 2}});
    await expect(secondSnapshot).resolves.toMatchObject({connectedGuests: 2});

    const third = await connect(firstRuntime.url);
    await expect(
      emitJoin(third, {guestId: GUEST_THREE, connectionId: uuid(12), roomCode: created.snapshot.roomCode}),
    ).resolves.toEqual({ok: false, error: {code: "ROOM_FULL", message: "This room already has two guests"}});

    const receivedEvent = new Promise<RoomEvent>((resolve) => second.once("room:event", resolve));
    const commandAck = await new Promise<RoomAck>((resolve) =>
      first.emit(
        "room:command",
        {
          commandId: uuid(20),
          roomCode: created.snapshot.roomCode,
          baseRevision: 0,
          action: {type: "setNumber", cellIndex: 1, number: SOLUTION[1]},
        },
        resolve,
      ),
    );
    expect(commandAck).toMatchObject({ok: true, snapshot: {revision: 1, board: {values: expect.any(Array)}}});
    await expect(receivedEvent).resolves.toMatchObject({revision: 1, board: {values: expect.any(Array)}});

    second.close();
    const reconnected = await connect(firstRuntime.url);
    const recoveredSnapshot = new Promise<RoomSnapshot>((resolve) => reconnected.once("room:snapshot", resolve));
    await expect(
      emitJoin(reconnected, {guestId: GUEST_TWO, connectionId: uuid(13), roomCode: created.snapshot.roomCode}),
    ).resolves.toMatchObject({ok: true, snapshot: {revision: 1}});
    expect((await recoveredSnapshot).board.values[1]).toBe(SOLUTION[1]);

    first.close();
    reconnected.close();
    third.close();
    await stopRuntime(firstRuntime);

    const secondRuntime = await startRuntime(repository);
    const afterRestart = await connect(secondRuntime.url);
    const restartAck = await emitJoin(afterRestart, {
      guestId: GUEST_ONE,
      connectionId: uuid(14),
      roomCode: created.snapshot.roomCode,
    });
    expect(restartAck).toMatchObject({ok: true, snapshot: {revision: 1}});
    if (restartAck.ok) {
      expect(restartAck.snapshot.board.values[1]).toBe(SOLUTION[1]);
    }
  });

  it("strictly validates requests and enforces creation, failed-join, and command limits", async () => {
    const runtime = await startRuntime();
    const socket = await connect(runtime.url);
    await expect(
      emitCreate(socket, {...createRequest(), unexpected: true} as CreateRoomRequest),
    ).resolves.toMatchObject({ok: false, error: {code: "INVALID_REQUEST"}});

    const created: RoomSnapshot[] = [];
    for (let index = 0; index < 5; index++) {
      const ack = await emitCreate(socket, createRequest(GUEST_ONE, 100 + index));
      expect(ack.ok).toBe(true);
      if (ack.ok) {
        created.push(ack.snapshot);
      }
    }
    await expect(emitCreate(socket, createRequest(GUEST_ONE, 106))).resolves.toMatchObject({
      ok: false,
      error: {code: "INVALID_REQUEST"},
    });

    for (let index = 0; index < 20; index++) {
      await expect(
        emitJoin(socket, {guestId: GUEST_TWO, connectionId: uuid(200 + index), roomCode: "ZZZ999"}),
      ).resolves.toMatchObject({ok: false, error: {code: "ROOM_NOT_FOUND"}});
    }
    await expect(
      emitJoin(socket, {guestId: GUEST_TWO, connectionId: uuid(221), roomCode: "ZZZ999"}),
    ).resolves.toMatchObject({ok: false, error: {code: "INVALID_REQUEST"}});

    for (let index = 0; index < 30; index++) {
      const ack = await new Promise<RoomAck>((resolve) =>
        socket.emit(
          "room:command",
          {
            commandId: uuid(300 + index),
            roomCode: created[0].roomCode,
            baseRevision: index,
            action: {type: "setNumber", cellIndex: 1, number: index % 2 === 0 ? 4 : 8},
          },
          resolve,
        ),
      );
      expect(ack.ok).toBe(true);
    }
    await expect(
      new Promise<RoomAck>((resolve) =>
        socket.emit(
          "room:command",
          {
            commandId: uuid(331),
            roomCode: created[0].roomCode,
            baseRevision: 30,
            action: {type: "setNumber", cellIndex: 1, number: 7},
          },
          resolve,
        ),
      ),
    ).resolves.toMatchObject({ok: false, error: {code: "INVALID_REQUEST"}});
  });

  it("rejects frames over 16 KiB and disallowed production origins", async () => {
    const runtime = await startRuntime();
    const oversized = await connect(runtime.url);
    const disconnected = new Promise<void>((resolve) => oversized.once("disconnect", () => resolve()));
    oversized.emit("room:create", {...createRequest(), guestId: "x".repeat(17 * 1024)} as CreateRoomRequest, () => {});
    await expect(disconnected).resolves.toBeUndefined();

    const production = await startRuntime(new InMemoryRoomRepository(), {
      nodeEnv: "production",
      allowedOrigins: ["https://allowed.example"],
    });
    const blocked = createClient(production.url, {
      auth: {protocolVersion: MULTIPLAYER_PROTOCOL_VERSION},
      extraHeaders: {Origin: "https://blocked.example"},
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
    });
    await expect(new Promise((resolve) => blocked.once("connect_error", resolve))).resolves.toBeTruthy();
    expect(blocked.connected).toBe(false);
    blocked.close();
  });
});
