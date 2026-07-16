import {
  MULTIPLAYER_PROTOCOL_VERSION,
  type ClientToServerEvents,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type PartnerSelection,
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
import {MultiplayerMetrics} from "../metrics.js";
import type {Clock} from "../rooms/Clock.js";
import {PresenceService} from "../rooms/PresenceService.js";
import type {RoomRepository} from "../rooms/RoomRepository.js";
import {RoomService} from "../rooms/RoomService.js";
import {InMemoryRoomRepository} from "../testing/InMemoryRoomRepository.js";
import {createSocketServer, networkSourceFromHandshake, type TransportErrorContext} from "./createSocketServer.js";

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
  metrics: MultiplayerMetrics;
  presence: PresenceService;
  url: string;
}

class DeferredSnapshotRepository extends InMemoryRoomRepository {
  #nextRead: {started: () => void; wait: Promise<void>} | undefined;

  deferNextRead(): {started: Promise<void>; release: () => void} {
    let markStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#nextRead = {started: markStarted, wait};
    return {started, release};
  }

  override async getSnapshot(code: string, now: Date): Promise<RoomSnapshot | null> {
    const deferred = this.#nextRead;
    if (deferred) {
      this.#nextRead = undefined;
      deferred.started();
      await deferred.wait;
    }
    return super.getSnapshot(code, now);
  }
}

class FailingDisconnectRepository extends InMemoryRoomRepository {
  override async recordDisconnectExpiry(): Promise<void> {
    throw new Error("disconnect persistence failed");
  }
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
  repository: RoomRepository = new InMemoryRoomRepository(),
  options: {
    nodeEnv?: "test" | "production";
    allowedOrigins?: string[];
    onError?: (error: unknown, context: TransportErrorContext) => void | Promise<void>;
  } = {},
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
  const presence = new PresenceService(clock);
  const metrics = new MultiplayerMetrics();
  const io = createSocketServer(httpServer, {
    roomService: service,
    presence,
    nodeEnv: options.nodeEnv ?? "test",
    allowedOrigins: options.allowedOrigins ?? [],
    clock,
    metrics,
    onError: options.onError,
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
  const runtime = {httpServer, io, metrics, presence, url: `http://127.0.0.1:${address.port}`};
  runtimes.add(runtime);
  return runtime;
}

function connect(url: string, options: {protocolVersion?: number; origin?: string} = {}): Promise<TestClient> {
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

function nextPartnerSelection(socket: TestClient): Promise<PartnerSelection> {
  return new Promise((resolve) => socket.once("room:partner-selection", resolve));
}

function missingRoomCode(index: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `ZZZZ${alphabet[Math.floor(index / alphabet.length)]}${alphabet[index % alphabet.length]}`;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for the expected socket state");
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
  it("trusts Fly-Client-IP only in production and falls back safely", () => {
    expect(networkSourceFromHandshake("127.0.0.1", "203.0.113.8", "production")).toBe("203.0.113.8");
    expect(networkSourceFromHandshake("127.0.0.1", "203.0.113.8", "test")).toBe("127.0.0.1");
    expect(networkSourceFromHandshake("127.0.0.1", "not-an-ip", "production")).toBe("127.0.0.1");
    expect(networkSourceFromHandshake("127.0.0.1", ["203.0.113.8"], "production")).toBe("127.0.0.1");
  });

  it("rejects a protocol mismatch during the handshake", async () => {
    const runtime = await startRuntime();
    const socket = createClient(runtime.url, {
      auth: {protocolVersion: MULTIPLAYER_PROTOCOL_VERSION + 1},
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
    });

    const error = await new Promise<Error & {data?: {code?: string}}>((resolve) =>
      socket.once("connect_error", resolve),
    );
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

  it("relays latest-tab selection to only the other guest and clears on final disconnect", async () => {
    const repository = new InMemoryRoomRepository();
    const runtime = await startRuntime(repository);
    const creator = await connect(runtime.url);
    const created = await emitCreate(creator, createRequest());
    if (!created.ok) {
      throw new Error("Expected room creation to succeed");
    }
    const roomCode = created.snapshot.roomCode;

    const joiner = await connect(runtime.url);
    const initial = nextPartnerSelection(joiner);
    await emitJoin(joiner, {guestId: GUEST_TWO, connectionId: uuid(60), roomCode});
    await expect(initial).resolves.toEqual({roomCode, cellIndex: null});

    const creatorExtra = await connect(runtime.url);
    await emitJoin(creatorExtra, {guestId: GUEST_ONE, connectionId: uuid(61), roomCode});
    const sameGuestEvents: PartnerSelection[] = [];
    creatorExtra.on("room:partner-selection", (event) => sameGuestEvents.push(event));
    const joinerEvents: PartnerSelection[] = [];
    joiner.on("room:partner-selection", (event) => joinerEvents.push(event));

    creator.emit("room:selection", {roomCode, cellIndex: 4});
    await waitFor(() => joinerEvents.at(-1)?.cellIndex === 4);
    creatorExtra.emit("room:selection", {roomCode, cellIndex: 17});
    await waitFor(() => joinerEvents.at(-1)?.cellIndex === 17);
    expect(sameGuestEvents).toEqual([]);
    expect((await repository.getSnapshot(roomCode, new FixedClock().now()))?.revision).toBe(0);

    const joinerExtra = await connect(runtime.url);
    const restored = nextPartnerSelection(joinerExtra);
    await emitJoin(joinerExtra, {guestId: GUEST_TWO, connectionId: uuid(62), roomCode});
    await expect(restored).resolves.toEqual({roomCode, cellIndex: 17});

    creatorExtra.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(joinerEvents.at(-1)).toEqual({roomCode, cellIndex: 17});
    creator.close();
    await waitFor(() => joinerEvents.at(-1)?.cellIndex === null);
  });

  it("ignores malformed and non-member selections without blocking room commands", async () => {
    const runtime = await startRuntime();
    const creator = await connect(runtime.url);
    const created = await emitCreate(creator, createRequest());
    if (!created.ok) {
      throw new Error("Expected room creation to succeed");
    }
    const roomCode = created.snapshot.roomCode;
    const joiner = await connect(runtime.url);
    await emitJoin(joiner, {guestId: GUEST_TWO, connectionId: uuid(63), roomCode});
    const outsider = await connect(runtime.url);
    const relayed: PartnerSelection[] = [];
    joiner.on("room:partner-selection", (event) => relayed.push(event));

    outsider.emit("room:selection", {roomCode, cellIndex: 4});
    creator.emit("room:selection", {roomCode, cellIndex: 81} as never);
    creator.emit("room:selection", {roomCode, cellIndex: 4, extra: true} as never);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(relayed).toEqual([]);

    const command = await new Promise<RoomAck>((resolve) =>
      creator.emit(
        "room:command",
        {
          commandId: uuid(64),
          roomCode,
          baseRevision: 0,
          action: {type: "setNumber", cellIndex: 1, number: SOLUTION[1]},
        },
        resolve,
      ),
    );
    expect(command).toMatchObject({ok: true, snapshot: {revision: 1}});
  });

  it("counts only a committed fallback-reservation recovery as a reconnect", async () => {
    const runtime = await startRuntime();
    const creator = await connect(runtime.url);
    const created = await emitCreate(creator, createRequest());
    if (!created.ok) {
      throw new Error("Expected room creation to succeed");
    }

    const firstJoin = await connect(runtime.url);
    await expect(
      emitJoin(firstJoin, {
        guestId: GUEST_TWO,
        connectionId: uuid(30),
        roomCode: created.snapshot.roomCode,
      }),
    ).resolves.toMatchObject({ok: true});
    const extraTab = await connect(runtime.url);
    await expect(
      emitJoin(extraTab, {
        guestId: GUEST_TWO,
        connectionId: uuid(31),
        roomCode: created.snapshot.roomCode,
      }),
    ).resolves.toMatchObject({ok: true});
    expect(runtime.metrics.snapshot(3, 1).reconnects).toBe(0);

    firstJoin.close();
    extraTab.close();
    await waitFor(() => runtime.presence.connectedGuests(created.snapshot.roomCode) === 1);

    const recovered = await connect(runtime.url);
    await expect(
      emitJoin(recovered, {
        guestId: GUEST_TWO,
        connectionId: uuid(32),
        roomCode: created.snapshot.roomCode,
      }),
    ).resolves.toMatchObject({ok: true});
    expect(runtime.metrics.snapshot(2, 1).reconnects).toBe(1);
  });

  it("owns pending membership across join races and cleans it exactly once on disconnect", async () => {
    const repository = new DeferredSnapshotRepository();
    const runtime = await startRuntime(repository);
    const creator = await connect(runtime.url);
    const created = await emitCreate(creator, createRequest());
    if (!created.ok) {
      throw new Error("Expected room creation to succeed");
    }

    const joining = await connect(runtime.url);
    const deferred = repository.deferNextRead();
    void emitJoin(joining, {guestId: GUEST_TWO, connectionId: uuid(40), roomCode: created.snapshot.roomCode});
    await deferred.started;
    await expect(
      emitJoin(joining, {guestId: GUEST_THREE, connectionId: uuid(41), roomCode: created.snapshot.roomCode}),
    ).resolves.toMatchObject({ok: false, error: {code: "INVALID_REQUEST"}});

    const correction = new Promise<{connectedGuests: number}>((resolve) => creator.once("room:presence", resolve));
    joining.close();
    await expect(correction).resolves.toEqual({connectedGuests: 1});
    deferred.release();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(runtime.presence.connectedGuests(created.snapshot.roomCode)).toBe(1);
    const replacement = await connect(runtime.url);
    await expect(
      emitJoin(replacement, {guestId: GUEST_THREE, connectionId: uuid(42), roomCode: created.snapshot.roomCode}),
    ).resolves.toMatchObject({ok: true, snapshot: {connectedGuests: 2}});
  });

  it("recomputes presence after an awaited join before snapshot and broadcast", async () => {
    const repository = new DeferredSnapshotRepository();
    const runtime = await startRuntime(repository);
    const creator = await connect(runtime.url);
    const created = await emitCreate(creator, createRequest());
    if (!created.ok) {
      throw new Error("Expected room creation to succeed");
    }

    const joining = await connect(runtime.url);
    const deferred = repository.deferNextRead();
    const joined = emitJoin(joining, {
      guestId: GUEST_TWO,
      connectionId: uuid(43),
      roomCode: created.snapshot.roomCode,
    });
    await deferred.started;
    expect(runtime.presence.connectedGuests(created.snapshot.roomCode)).toBe(1);
    creator.emit("room:leave", {roomCode: created.snapshot.roomCode, connectionId: createRequest().connectionId});
    await waitFor(() => runtime.presence.connectedGuests(created.snapshot.roomCode) === 0);
    deferred.release();
    await expect(joined).resolves.toMatchObject({ok: true, snapshot: {connectedGuests: 1}});
  });

  it("strictly validates requests and enforces creation, failed-join, and command limits", async () => {
    const runtime = await startRuntime();
    const socket = await connect(runtime.url);

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

    await expect(
      Promise.all(
        Array.from({length: 20}, (_, index) =>
          emitJoin(socket, {
            guestId: GUEST_TWO,
            connectionId: uuid(200 + index),
            roomCode: missingRoomCode(index),
          }),
        ),
      ),
    ).resolves.toEqual(
      expect.arrayContaining(
        Array.from({length: 20}, () =>
          expect.objectContaining({ok: false, error: {code: "ROOM_NOT_FOUND", message: "The room was not found"}}),
        ),
      ),
    );
    await expect(
      emitJoin(socket, {guestId: GUEST_TWO, connectionId: uuid(221), roomCode: missingRoomCode(21)}),
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

  it("charges malformed create, join, and command bursts before schema validation", async () => {
    const runtime = await startRuntime();
    const socket = await connect(runtime.url);

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(emitCreate(socket, {...createRequest(), unexpected: attempt} as CreateRoomRequest)).resolves.toEqual(
        {ok: false, error: {code: "INVALID_REQUEST", message: "The request is invalid"}},
      );
    }
    await expect(emitCreate(socket, {...createRequest(), unexpected: true} as CreateRoomRequest)).resolves.toEqual({
      ok: false,
      error: {code: "INVALID_REQUEST", message: "Too many rooms were created from this network"},
    });

    for (let attempt = 0; attempt < 20; attempt++) {
      await expect(emitJoin(socket, {guestId: "malformed"} as JoinRoomRequest)).resolves.toEqual({
        ok: false,
        error: {code: "INVALID_REQUEST", message: "The request is invalid"},
      });
    }
    await expect(emitJoin(socket, {guestId: "malformed"} as JoinRoomRequest)).resolves.toEqual({
      ok: false,
      error: {code: "INVALID_REQUEST", message: "Too many unsuccessful room joins"},
    });

    for (let attempt = 0; attempt < 30; attempt++) {
      await expect(
        new Promise<RoomAck>((resolve) => socket.emit("room:command", {action: "malformed"} as never, resolve)),
      ).resolves.toEqual({ok: false, error: {code: "INVALID_REQUEST", message: "The request is invalid"}});
    }
    await expect(
      new Promise<RoomAck>((resolve) => socket.emit("room:command", {action: "malformed"} as never, resolve)),
    ).resolves.toEqual({
      ok: false,
      error: {code: "INVALID_REQUEST", message: "Too many room commands"},
    });
  });

  it("charges every ROOM_FULL join before async work", async () => {
    const runtime = await startRuntime();
    const first = await connect(runtime.url);
    const created = await emitCreate(first, createRequest());
    if (!created.ok) {
      throw new Error("Expected room creation to succeed");
    }
    const second = await connect(runtime.url);
    await emitJoin(second, {guestId: GUEST_TWO, connectionId: uuid(500), roomCode: created.snapshot.roomCode});
    const third = await connect(runtime.url);

    for (let attempt = 0; attempt < 20; attempt++) {
      await expect(
        emitJoin(third, {
          guestId: GUEST_THREE,
          connectionId: uuid(510 + attempt),
          roomCode: created.snapshot.roomCode,
        }),
      ).resolves.toMatchObject({ok: false, error: {code: "ROOM_FULL"}});
    }
    await expect(
      emitJoin(third, {guestId: GUEST_THREE, connectionId: uuid(540), roomCode: created.snapshot.roomCode}),
    ).resolves.toMatchObject({ok: false, error: {code: "INVALID_REQUEST"}});
  });

  it("contains persistence failures and async error-hook rejection", async () => {
    const failures: TransportErrorContext[] = [];
    const runtime = await startRuntime(new FailingDisconnectRepository(), {
      onError: async (_error, context) => {
        failures.push(context);
        await Promise.resolve();
        throw new Error("error hook rejected");
      },
    });
    const socket = await connect(runtime.url);
    const first = await emitCreate(socket, createRequest());
    if (!first.ok) {
      throw new Error("Expected room creation to succeed");
    }
    const leaveError = new Promise<{code: string}>((resolve) => socket.once("room:error", resolve));
    socket.emit("room:leave", {roomCode: first.snapshot.roomCode, connectionId: createRequest().connectionId});
    await expect(leaveError).resolves.toMatchObject({code: "SERVICE_UNAVAILABLE"});
    expect(failures).toContainEqual({operation: "room:leave", roomCode: first.snapshot.roomCode});

    const second = await emitCreate(socket, createRequest(GUEST_ONE, 600));
    if (!second.ok) {
      throw new Error("Expected second room creation to succeed");
    }
    socket.close();
    await waitFor(() => failures.some((failure) => failure.operation === "disconnect"));
    expect(failures).toContainEqual({operation: "disconnect", roomCode: second.snapshot.roomCode});
  });

  it("rejects oversized frames and missing/unlisted production origins while allowing configured origins", async () => {
    const runtime = await startRuntime();
    const oversized = await connect(runtime.url);
    const disconnected = new Promise<void>((resolve) => oversized.once("disconnect", () => resolve()));
    oversized.emit("room:create", {...createRequest(), guestId: "x".repeat(17 * 1024)} as CreateRoomRequest, () => {});
    await expect(disconnected).resolves.toBeUndefined();

    const production = await startRuntime(new InMemoryRoomRepository(), {
      nodeEnv: "production",
      allowedOrigins: ["https://allowed.example"],
    });
    const missingOrigin = createClient(production.url, {
      auth: {protocolVersion: MULTIPLAYER_PROTOCOL_VERSION},
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
    });
    await expect(new Promise((resolve) => missingOrigin.once("connect_error", resolve))).resolves.toBeTruthy();
    expect(missingOrigin.connected).toBe(false);
    missingOrigin.close();

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

    const allowed = await connect(production.url, {origin: "https://allowed.example"});
    expect(allowed.connected).toBe(true);
    allowed.close();
  });
});
