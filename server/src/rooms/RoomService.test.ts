import type {RoomCommand} from "@sudoku/multiplayer-protocol";
import type {CanonicalPuzzle, PuzzleCatalog} from "../catalog/PuzzleCatalog.js";
import {InMemoryRoomRepository} from "../testing/InMemoryRoomRepository.js";
import type {Clock} from "./Clock.js";
import {PerRoomQueue} from "./PerRoomQueue.js";
import {RoomService} from "./RoomService.js";
import {describe, expect, it} from "vitest";

const DAY_MS = 24 * 60 * 60 * 1_000;
const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179"
  .split("")
  .map(Number);
const GIVENS = SOLUTION.map((value, index) => ([1, 2, 3].includes(index) ? 0 : value));
const FINGERPRINT = GIVENS.join("");

class FakeClock implements Clock {
  #now: Date;

  constructor(iso = "2026-07-13T10:00:00.000Z") {
    this.#now = new Date(iso);
  }

  now(): Date {
    return new Date(this.#now);
  }

  advance(milliseconds: number): void {
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }
}

class FakeCatalog implements PuzzleCatalog {
  readonly puzzle: CanonicalPuzzle = {
    collectionId: "easy",
    puzzleNumber: 1,
    givens: GIVENS,
    solution: SOLUTION,
  };

  async get(): Promise<CanonicalPuzzle> {
    return structuredClone(this.puzzle);
  }
}

function id(index: number): string {
  return `123e4567-e89b-42d3-a456-${String(426614174000 + index).padStart(12, "0")}`;
}

function command(roomCode: string, index: number, action: RoomCommand["action"], baseRevision = 0): RoomCommand {
  return {commandId: id(index), roomCode, baseRevision, action};
}

function setup(codes: string[] = ["ABC234", "DEF567"]) {
  const clock = new FakeClock();
  const repository = new InMemoryRoomRepository();
  let codeIndex = 0;
  let roomIdIndex = 900;
  const service = new RoomService(
    repository,
    new FakeCatalog(),
    clock,
    () => codes[codeIndex++] ?? "GHJ678",
    () => id(roomIdIndex++),
  );
  return {clock, repository, service};
}

async function create(service: RoomService) {
  return service.createRoom({collectionId: "easy", puzzleNumber: 1, givensFingerprint: FINGERPRINT});
}

describe("PerRoomQueue", () => {
  it("keeps arrival order and isolates a failed item", async () => {
    const queue = new PerRoomQueue();
    const order: number[] = [];
    const failed = queue.run("ABC234", async () => {
      order.push(1);
      throw new Error("expected");
    });
    const succeeded = queue.run("ABC234", async () => {
      order.push(2);
      return "ok";
    });

    await expect(failed).rejects.toThrow("expected");
    await expect(succeeded).resolves.toBe("ok");
    expect(order).toEqual([1, 2]);
  });
});

describe("RoomService", () => {
  it("creates an authoritative empty room with revision zero and 24-hour expiry", async () => {
    const {clock, service} = setup();
    const snapshot = await create(service);

    expect(snapshot).toMatchObject({
      roomCode: "ABC234",
      revision: 0,
      status: "running",
      timerStarted: false,
      elapsedMs: 0,
      runningSince: null,
      serverNow: clock.now().getTime(),
      canUndo: false,
      connectedGuests: 0,
      expiresAt: new Date(clock.now().getTime() + DAY_MS).toISOString(),
    });
    expect(snapshot.board.givens).toEqual(GIVENS);
    expect(snapshot.board.solution).toEqual(SOLUTION);
    expect(snapshot.board.values).toEqual(Array(81).fill(0));
    expect(snapshot.board.notes).toEqual(Array.from({length: 81}, () => []));
    expect(Object.keys(snapshot).sort()).toEqual([
      "board",
      "canUndo",
      "collectionId",
      "connectedGuests",
      "elapsedMs",
      "expiresAt",
      "puzzleNumber",
      "revision",
      "roomCode",
      "runningSince",
      "serverNow",
      "status",
      "timerStarted",
    ]);
  });

  it("rejects a fingerprint mismatch against the independently loaded catalog", async () => {
    const {service} = setup();
    await expect(
      service.createRoom({collectionId: "easy", puzzleNumber: 1, givensFingerprint: "0".repeat(81)}),
    ).rejects.toThrow(/fingerprint|version/i);
  });

  it("starts on the first board mutation, then pauses and resumes from server time", async () => {
    const {clock, service} = setup();
    const room = await create(service);
    clock.advance(2_000);

    const started = await service.execute(command(room.roomCode, 1, {type: "setNotes", cellIndex: 1, notes: [2, 4]}));
    expect(started.snapshot).toMatchObject({timerStarted: true, elapsedMs: 0, runningSince: clock.now().getTime()});

    clock.advance(3_500);
    const paused = await service.execute(command(room.roomCode, 2, {type: "pause"}, 1));
    expect(paused.snapshot).toMatchObject({status: "paused", elapsedMs: 3_500, runningSince: null});

    clock.advance(5_000);
    const resumed = await service.execute(command(room.roomCode, 3, {type: "resume"}, 0));
    expect(resumed.snapshot).toMatchObject({
      status: "running",
      timerStarted: true,
      elapsedMs: 3_500,
      runningSince: clock.now().getTime(),
    });
  });

  it("keeps the timer dormant when pausing and resuming before the first board mutation", async () => {
    const {clock, service} = setup();
    const room = await create(service);

    clock.advance(2_000);
    const paused = await service.execute(command(room.roomCode, 1, {type: "pause"}));
    expect(paused.snapshot).toMatchObject({
      status: "paused",
      timerStarted: false,
      elapsedMs: 0,
      runningSince: null,
    });

    clock.advance(5_000);
    const resumed = await service.execute(command(room.roomCode, 2, {type: "resume"}));
    expect(resumed.snapshot).toMatchObject({
      status: "running",
      timerStarted: false,
      elapsedMs: 0,
      runningSince: null,
    });

    clock.advance(3_000);
    const started = await service.execute(command(room.roomCode, 3, {type: "setNotes", cellIndex: 1, notes: [2]}));
    expect(started.snapshot).toMatchObject({
      timerStarted: true,
      elapsedMs: 0,
      runningSince: clock.now().getTime(),
    });
  });

  it("makes ordinary board changes and hints room-wide undoable", async () => {
    const {service} = setup();
    const room = await create(service);
    await service.execute(command(room.roomCode, 1, {type: "setNumber", cellIndex: 1, number: 4}));
    const hinted = await service.execute(command(room.roomCode, 2, {type: "hint", cellIndex: 2}, 0));
    expect(hinted.snapshot.board.values.slice(1, 3)).toEqual([4, SOLUTION[2]]);
    expect(hinted.snapshot.canUndo).toBe(true);

    const firstUndo = await service.execute(command(room.roomCode, 3, {type: "undo"}));
    expect(firstUndo.snapshot.board.values.slice(1, 3)).toEqual([4, 0]);
    expect(firstUndo.snapshot.canUndo).toBe(true);
    const secondUndo = await service.execute(command(room.roomCode, 4, {type: "undo"}));
    expect(secondUndo.snapshot.board.values.slice(1, 3)).toEqual([0, 0]);
    expect(secondUndo.snapshot.canUndo).toBe(false);
  });

  it("clears board, timer, completion and undo while retaining command receipts", async () => {
    const {clock, repository, service} = setup();
    const room = await create(service);
    const original = await service.execute(command(room.roomCode, 1, {type: "setNotes", cellIndex: 1, notes: [2, 4]}));
    clock.advance(1_000);
    const cleared = await service.execute(command(room.roomCode, 2, {type: "clear"}, 1));

    expect(cleared.snapshot).toMatchObject({
      status: "running",
      timerStarted: false,
      elapsedMs: 0,
      runningSince: null,
      canUndo: false,
    });
    expect(cleared.snapshot.board.values).toEqual(Array(81).fill(0));
    expect(cleared.snapshot.board.notes).toEqual(Array.from({length: 81}, () => []));
    expect(repository.processedCommandCount(room.roomCode)).toBe(2);
    expect(repository.undoCount(room.roomCode)).toBe(0);

    clock.advance(1_000);
    const later = await service.execute(command(room.roomCode, 3, {type: "setNumber", cellIndex: 1, number: 9}));

    const duplicate = await service.execute(command(room.roomCode, 1, {type: "setNumber", cellIndex: 1, number: 9}));
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.event).toEqual(original.event);
    expect(duplicate.snapshot).toEqual(original.snapshot);
    await expect(repository.getSnapshot(room.roomCode, clock.now())).resolves.toMatchObject({
      revision: later.snapshot.revision,
      board: {values: later.snapshot.board.values},
    });
  });

  it("accepts valid stale intentions and applies same-cell commands in arrival order", async () => {
    const {service} = setup();
    const room = await create(service);
    const first = service.execute(command(room.roomCode, 1, {type: "setNumber", cellIndex: 1, number: 8}, 0));
    const second = service.execute(command(room.roomCode, 2, {type: "setNumber", cellIndex: 1, number: 4}, 0));

    await expect(first).resolves.toMatchObject({snapshot: {revision: 1}});
    const acceptedSecond = await second;
    expect(acceptedSecond.snapshot.revision).toBe(2);
    expect(acceptedSecond.snapshot.board.values[1]).toBe(4);
  });

  it("derives completion and final elapsed time on the server", async () => {
    const {clock, service} = setup();
    const room = await create(service);
    await service.execute(command(room.roomCode, 1, {type: "setNumber", cellIndex: 1, number: SOLUTION[1]}));
    clock.advance(750);
    await service.execute(command(room.roomCode, 2, {type: "setNumber", cellIndex: 2, number: SOLUTION[2]}));
    clock.advance(250);
    const completed = await service.execute(
      command(room.roomCode, 3, {type: "setNumber", cellIndex: 3, number: SOLUTION[3]}),
    );

    expect(completed.snapshot).toMatchObject({status: "completed", elapsedMs: 1_000, runningSince: null});
    await expect(service.execute(command(room.roomCode, 4, {type: "undo"}))).rejects.toThrow(/completed/i);
  });

  it("allows confirmed Clear while paused or completed and resets the room to a dormant timer", async () => {
    const pausedSetup = setup();
    const pausedRoom = await create(pausedSetup.service);
    await pausedSetup.service.execute(command(pausedRoom.roomCode, 1, {type: "setNotes", cellIndex: 1, notes: [4]}));
    pausedSetup.clock.advance(1_000);
    await pausedSetup.service.execute(command(pausedRoom.roomCode, 2, {type: "pause"}));
    const clearedPaused = await pausedSetup.service.execute(command(pausedRoom.roomCode, 3, {type: "clear"}));
    expect(clearedPaused.snapshot).toMatchObject({
      status: "running",
      timerStarted: false,
      elapsedMs: 0,
      runningSince: null,
      canUndo: false,
    });
    expect(clearedPaused.snapshot.board.notes).toEqual(Array.from({length: 81}, () => []));

    const completedSetup = setup();
    const completedRoom = await create(completedSetup.service);
    await completedSetup.service.execute(
      command(completedRoom.roomCode, 10, {type: "setNumber", cellIndex: 1, number: SOLUTION[1]}),
    );
    await completedSetup.service.execute(
      command(completedRoom.roomCode, 11, {type: "setNumber", cellIndex: 2, number: SOLUTION[2]}),
    );
    await completedSetup.service.execute(
      command(completedRoom.roomCode, 12, {type: "setNumber", cellIndex: 3, number: SOLUTION[3]}),
    );
    const clearedCompleted = await completedSetup.service.execute(command(completedRoom.roomCode, 13, {type: "clear"}));
    expect(clearedCompleted.snapshot).toMatchObject({
      status: "running",
      timerStarted: false,
      elapsedMs: 0,
      runningSince: null,
      canUndo: false,
    });
    expect(clearedCompleted.snapshot.board.values).toEqual(Array(81).fill(0));
  });

  it("retains only 500 inverse rows", async () => {
    const {repository, service} = setup();
    const room = await create(service);
    for (let index = 0; index < 505; index++) {
      await service.execute(
        command(room.roomCode, index + 1, {type: "setNumber", cellIndex: 1, number: index % 2 === 0 ? 8 : 4}),
      );
    }
    expect(repository.undoCount(room.roomCode)).toBe(500);
    expect(repository.processedCommandCount(room.roomCode)).toBe(505);
  });

  it("retries room-code collisions with a newly generated code", async () => {
    const {service} = setup(["ABC234", "ABC234", "DEF567"]);
    await expect(create(service)).resolves.toMatchObject({roomCode: "ABC234"});
    await expect(create(service)).resolves.toMatchObject({roomCode: "DEF567"});
  });

  it("refreshes join and accepted-command activity and expiry", async () => {
    const {clock, repository, service} = setup();
    const room = await create(service);
    clock.advance(2_000);
    const joined = await service.joinRoom(room.roomCode);
    expect(joined?.expiresAt).toBe(new Date(clock.now().getTime() + DAY_MS).toISOString());
    expect(repository.lastActivityAt(room.roomCode)).toEqual(clock.now());

    clock.advance(3_000);
    const changed = await service.execute(command(room.roomCode, 1, {type: "setNotes", cellIndex: 1, notes: [4]}));
    expect(changed.snapshot.expiresAt).toBe(new Date(clock.now().getTime() + DAY_MS).toISOString());
    expect(repository.lastActivityAt(room.roomCode)).toEqual(clock.now());
  });

  it("sets disconnect expiry from server time and deletes only expired inactive rooms", async () => {
    const {clock, service} = setup();
    const room = await create(service);
    clock.advance(10_000);
    await service.markRoomInactive(room.roomCode);
    const refreshed = await service.joinRoom(room.roomCode);
    expect(refreshed?.expiresAt).toBe(new Date(clock.now().getTime() + DAY_MS).toISOString());

    clock.advance(DAY_MS + 1);
    await expect(service.deleteExpiredRooms(new Set([room.roomCode]))).resolves.toBe(0);
    clock.advance(DAY_MS + 1);
    await expect(service.deleteExpiredRooms(new Set())).resolves.toBe(1);
  });

  it("refreshes active room expiry so joins and commands keep working past 24 hours", async () => {
    const {clock, service} = setup();
    const room = await create(service);

    clock.advance(DAY_MS + 1);
    await expect(service.deleteExpiredRooms(new Set([room.roomCode]))).resolves.toBe(0);
    await expect(service.joinRoom(room.roomCode)).resolves.toMatchObject({roomCode: room.roomCode});
    await expect(
      service.execute(command(room.roomCode, 1, {type: "setNotes", cellIndex: 1, notes: [4]})),
    ).resolves.toMatchObject({snapshot: {revision: 1}});
  });

  it("does not let a delayed disconnect shorten a newer activity expiry", async () => {
    const {clock, repository, service} = setup();
    const room = await create(service);
    clock.advance(10_000);
    const changed = await service.execute(command(room.roomCode, 1, {type: "setNotes", cellIndex: 1, notes: [4]}));

    clock.advance(-5_000);
    await service.markRoomInactive(room.roomCode);

    await expect(repository.getSnapshot(room.roomCode, clock.now())).resolves.toMatchObject({
      expiresAt: changed.snapshot.expiresAt,
    });
  });

  it("allows resume or Clear while paused and rejects other no-op state controls", async () => {
    const {service} = setup();
    const room = await create(service);
    await expect(service.execute(command(room.roomCode, 1, {type: "resume"}))).rejects.toThrow(/running/i);
    await service.execute(command(room.roomCode, 2, {type: "pause"}));
    await expect(service.execute(command(room.roomCode, 3, {type: "pause"}))).rejects.toThrow(/paused/i);
    await expect(service.execute(command(room.roomCode, 4, {type: "clear"}))).resolves.toMatchObject({
      snapshot: {status: "running", timerStarted: false},
    });
    await service.execute(command(room.roomCode, 5, {type: "pause"}));
    await expect(
      service.execute(command(room.roomCode, 6, {type: "setNumber", cellIndex: 1, number: 4})),
    ).rejects.toThrow(/paused/i);
    await expect(service.execute(command(room.roomCode, 7, {type: "resume"}))).resolves.toMatchObject({
      snapshot: {status: "running", timerStarted: false, runningSince: null},
    });
  });
});
