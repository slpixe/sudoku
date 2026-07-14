// @vitest-environment jsdom

import type {
  ClientToServerEvents,
  RoomAck,
  RoomBoard,
  RoomEvent,
  RoomSnapshot,
  ServerToClientEvents,
} from "@sudoku/multiplayer-protocol";
import {act, cleanup, renderHook} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

import type {MultiplayerSocket} from "./createMultiplayerSocket";
import {GUEST_ID_STORAGE_KEY} from "./guestIdentity";
import {useMultiplayerRoom} from "./useMultiplayerRoom";

type Handler = (...args: never[]) => void;

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

function createBoard(): RoomBoard {
  return {
    givens: Array<number>(81).fill(0),
    solution: Array<number>(81).fill(9),
    values: Array<number>(81).fill(0),
    notes: Array.from({length: 81}, () => []),
  };
}

function createSnapshot(revision = 0, board = createBoard(), roomCode = "ABC234"): RoomSnapshot {
  return {
    roomCode,
    collectionId: "easy",
    puzzleNumber: 1,
    board,
    revision,
    status: "running",
    elapsedMs: 0,
    runningSince: null,
    serverNow: 1_000,
    canUndo: false,
    connectedGuests: 1,
    expiresAt: "2026-07-15T00:00:00.000Z",
  };
}

class FakeSocket {
  connected = false;
  readonly emitted: {event: string; args: unknown[]}[] = [];
  disconnectCalls = 0;
  connectCalls = 0;
  readonly #handlers = new Map<string, Set<Handler>>();

  readonly io = {
    on: () => this.io,
    off: () => this.io,
  };

  on(event: string, handler: Handler) {
    const handlers = this.#handlers.get(event) ?? new Set<Handler>();
    handlers.add(handler);
    this.#handlers.set(event, handlers);
    return this;
  }

  off(event: string, handler?: Handler) {
    if (handler === undefined) {
      this.#handlers.delete(event);
    } else {
      this.#handlers.get(event)?.delete(handler);
    }
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    this.emitted.push({event, args});
    return this;
  }

  connect() {
    this.connectCalls += 1;
    this.connected = true;
    this.serverEmit("connect");
    return this;
  }

  disconnect() {
    this.disconnectCalls += 1;
    const wasConnected = this.connected;
    this.connected = false;
    if (wasConnected) {
      this.serverEmit("disconnect", "io client disconnect");
    }
    return this;
  }

  serverDisconnect() {
    this.connected = false;
    this.serverEmit("disconnect", "transport close");
  }

  serverEmit(event: string, ...args: unknown[]) {
    for (const handler of this.#handlers.get(event) ?? []) {
      handler(...(args as never[]));
    }
  }

  listenerCount(event: string) {
    return this.#handlers.get(event)?.size ?? 0;
  }

  asSocket(): MultiplayerSocket {
    return this as unknown as MultiplayerSocket;
  }
}

function events(socket: FakeSocket, event: keyof ClientToServerEvents) {
  return socket.emitted.filter((entry) => entry.event === event);
}

function acknowledge(entry: {args: unknown[]}, ack: RoomAck) {
  const callback = entry.args.at(-1) as (result: RoomAck) => void;
  callback(ack);
}

function remoteEvent(revision: number, board: RoomBoard): Parameters<ServerToClientEvents["room:event"]>[0] {
  return {
    commandId: crypto.randomUUID(),
    action: {type: "setNumber", cellIndex: 4, number: 8},
    revision,
    board,
    status: "running",
    elapsedMs: 0,
    runningSince: 1_000,
    serverNow: 1_100,
    canUndo: true,
  } satisfies RoomEvent;
}

afterEach(cleanup);

describe("useMultiplayerRoom", () => {
  it("retains one fallback guest identity across remounts when localStorage access throws", () => {
    const localStorageGetter = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Storage access denied", "SecurityError");
    });
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();

    try {
      const first = renderHook(() => useMultiplayerRoom("ABC234", {socketFactory: () => firstSocket.asSocket()}));
      const firstRequest = events(firstSocket, "room:join")[0].args[0] as {
        guestId: string;
        connectionId: string;
      };
      first.unmount();

      const second = renderHook(() => useMultiplayerRoom("ABC234", {socketFactory: () => secondSocket.asSocket()}));
      const secondRequest = events(secondSocket, "room:join")[0].args[0] as {
        guestId: string;
        connectionId: string;
      };

      expect(secondRequest.guestId).toBe(firstRequest.guestId);
      expect(secondRequest.connectionId).not.toBe(firstRequest.connectionId);
      second.unmount();
    } finally {
      localStorageGetter.mockRestore();
    }
  });

  it("shares the stored guest identity but creates a fresh connection identity for every mount", () => {
    const storage = createStorage();
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();

    const first = renderHook(() =>
      useMultiplayerRoom("ABC234", {storage, socketFactory: () => firstSocket.asSocket()}),
    );
    const second = renderHook(() =>
      useMultiplayerRoom("ABC234", {storage, socketFactory: () => secondSocket.asSocket()}),
    );

    const firstRequest = events(firstSocket, "room:join")[0].args[0] as {guestId: string; connectionId: string};
    const secondRequest = events(secondSocket, "room:join")[0].args[0] as {guestId: string; connectionId: string};
    expect(firstRequest.guestId).toBe(storage.getItem(GUEST_ID_STORAGE_KEY));
    expect(secondRequest.guestId).toBe(firstRequest.guestId);
    expect(secondRequest.connectionId).not.toBe(firstRequest.connectionId);

    first.unmount();
    second.unmount();
  });

  it("requests a full snapshot on the initial connection and every reconnect without duplicating listeners", () => {
    const socket = new FakeSocket();
    const {result, rerender} = renderHook(() =>
      useMultiplayerRoom("ABC234", {storage: createStorage(), socketFactory: () => socket.asSocket()}),
    );

    expect(events(socket, "room:join")).toHaveLength(1);
    expect(socket.listenerCount("room:event")).toBe(1);
    rerender();
    expect(socket.listenerCount("room:event")).toBe(1);

    act(() => socket.serverEmit("room:snapshot", createSnapshot()));
    expect(result.current.status).toBe("connected");
    expect(result.current.presence).toBe(1);

    act(() => socket.serverDisconnect());
    expect(result.current.status).toBe("reconnecting");
    act(() => socket.connect());

    expect(events(socket, "room:join")).toHaveLength(2);
    const firstConnectionId = (events(socket, "room:join")[0].args[0] as {connectionId: string}).connectionId;
    const secondConnectionId = (events(socket, "room:join")[1].args[0] as {connectionId: string}).connectionId;
    expect(secondConnectionId).toBe(firstConnectionId);
  });

  it("cleans up the old room and resets all room state before joining a changed room code", () => {
    const socket = new FakeSocket();
    const storage = createStorage();
    const {result, rerender} = renderHook(
      ({roomCode}) => useMultiplayerRoom(roomCode, {storage, socketFactory: () => socket.asSocket()}),
      {initialProps: {roomCode: "ABC234"}},
    );
    const roomABoard = createBoard();
    roomABoard.values[1] = 4;
    act(() => {
      socket.serverEmit("room:snapshot", createSnapshot(3, roomABoard));
      socket.serverEmit("room:presence", {connectedGuests: 2});
      socket.serverEmit("room:error", {code: "COMMAND_REJECTED", message: "Room A error"});
      result.current.send({type: "setNumber", cellIndex: 2, number: 6});
    });
    const roomACommand = events(socket, "room:command")[0];

    rerender({roomCode: "DEF567"});

    const joins = events(socket, "room:join");
    expect(joins).toHaveLength(2);
    const roomAJoin = joins[0].args[0] as {roomCode: string; connectionId: string};
    const roomBJoin = joins[1].args[0] as {roomCode: string; connectionId: string};
    expect(roomAJoin.roomCode).toBe("ABC234");
    expect(roomBJoin.roomCode).toBe("DEF567");
    expect(roomBJoin.connectionId).toBe(roomAJoin.connectionId);
    const leaveIndex = socket.emitted.findIndex((entry) => entry.event === "room:leave");
    const roomBJoinIndex = socket.emitted.findIndex(
      (entry) => entry.event === "room:join" && (entry.args[0] as {roomCode: string}).roomCode === "DEF567",
    );
    expect(leaveIndex).toBeGreaterThan(-1);
    expect(leaveIndex).toBeLessThan(roomBJoinIndex);
    expect(result.current.confirmed).toBeNull();
    expect(result.current.projected).toBeNull();
    expect(result.current.presence).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("connecting");
    expect(result.current.send({type: "pause"})).toBeNull();
    expect(events(socket, "room:command")).toHaveLength(1);

    act(() => {
      acknowledge(roomACommand, {ok: true, snapshot: createSnapshot(4, roomABoard)});
      acknowledge(joins[0], {ok: true, snapshot: createSnapshot(4, roomABoard)});
    });
    expect(result.current.confirmed).toBeNull();

    act(() => socket.serverEmit("room:snapshot", createSnapshot(0, createBoard(), "DEF567")));
    expect(result.current.confirmed?.roomCode).toBe("DEF567");
    expect(result.current.status).toBe("connected");
    expect(events(socket, "room:command")).toHaveLength(1);
  });

  it("stops reconnecting after a terminal protocol version mismatch", () => {
    const socket = new FakeSocket();
    const {result} = renderHook(() =>
      useMultiplayerRoom("ABC234", {storage: createStorage(), socketFactory: () => socket.asSocket()}),
    );
    const mismatch = Object.assign(new Error("Protocol version mismatch"), {
      data: {code: "VERSION_MISMATCH", message: "Refresh the app"},
    });

    act(() => socket.serverEmit("connect_error", mismatch));

    expect(result.current.error).toEqual({code: "VERSION_MISMATCH", message: "Refresh the app"});
    expect(result.current.status).toBe("disconnected");
    expect(socket.disconnectCalls).toBe(1);
    const joinCount = events(socket, "room:join").length;
    act(() => socket.serverEmit("connect"));
    expect(events(socket, "room:join")).toHaveLength(joinCount);
  });

  it("keeps retrying after an ordinary transport connection error", () => {
    const socket = new FakeSocket();
    const {result} = renderHook(() =>
      useMultiplayerRoom("ABC234", {storage: createStorage(), socketFactory: () => socket.asSocket()}),
    );

    act(() => socket.serverEmit("connect_error", new Error("Transport unavailable")));

    expect(result.current.error).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "Transport unavailable",
    });
    expect(result.current.status).toBe("reconnecting");
    expect(socket.disconnectCalls).toBe(0);
  });

  it("sends optimistically, rolls back rejection, and reconnects for an authoritative snapshot", () => {
    const socket = new FakeSocket();
    const {result} = renderHook(() =>
      useMultiplayerRoom("ABC234", {storage: createStorage(), socketFactory: () => socket.asSocket()}),
    );
    act(() => socket.serverEmit("room:snapshot", createSnapshot()));

    act(() => {
      result.current.send({type: "setNumber", cellIndex: 3, number: 6});
    });

    expect(result.current.projected?.values[3]).toBe(6);
    const command = events(socket, "room:command")[0];
    act(() =>
      acknowledge(command, {
        ok: false,
        error: {code: "COMMAND_REJECTED", message: "The command was rejected"},
      }),
    );

    expect(result.current.projected?.values[3]).toBe(0);
    expect(result.current.status).toBe("resyncing");
    expect(result.current.error?.code).toBe("COMMAND_REJECTED");
    expect(socket.disconnectCalls).toBe(1);
    expect(events(socket, "room:join")).toHaveLength(2);
  });

  it("does not apply a revision gap and reconnects to replace it from a full snapshot", () => {
    const socket = new FakeSocket();
    const {result} = renderHook(() =>
      useMultiplayerRoom("ABC234", {storage: createStorage(), socketFactory: () => socket.asSocket()}),
    );
    act(() => socket.serverEmit("room:snapshot", createSnapshot(1)));
    const gapBoard = createBoard();
    gapBoard.values[4] = 8;

    act(() => socket.serverEmit("room:event", remoteEvent(3, gapBoard)));

    expect(result.current.confirmed?.revision).toBe(1);
    expect(result.current.projected?.values[4]).toBe(0);
    expect(result.current.status).toBe("resyncing");
    expect(socket.disconnectCalls).toBe(1);
    expect(events(socket, "room:join")).toHaveLength(2);
  });

  it("replays pending commands after reconnect snapshot replacement", () => {
    const socket = new FakeSocket();
    const {result} = renderHook(() =>
      useMultiplayerRoom("ABC234", {storage: createStorage(), socketFactory: () => socket.asSocket()}),
    );
    act(() => socket.serverEmit("room:snapshot", createSnapshot()));
    act(() => {
      result.current.send({type: "setNotes", cellIndex: 9, notes: [2, 7]});
      socket.serverDisconnect();
      socket.connect();
      socket.serverEmit("room:snapshot", createSnapshot(2));
    });

    expect(events(socket, "room:command")).toHaveLength(2);
    const firstCommand = events(socket, "room:command")[0].args[0] as {commandId: string};
    const replayedCommand = events(socket, "room:command")[1].args[0] as {commandId: string};
    expect(replayedCommand.commandId).toBe(firstCommand.commandId);
    expect(result.current.projected?.notes[9]).toEqual([2, 7]);
  });

  it("does not replay or unlock sends for a stale recovery snapshot", () => {
    const socket = new FakeSocket();
    const {result} = renderHook(() =>
      useMultiplayerRoom("ABC234", {storage: createStorage(), socketFactory: () => socket.asSocket()}),
    );
    act(() => socket.serverEmit("room:snapshot", createSnapshot(3)));
    act(() => {
      result.current.send({type: "setNotes", cellIndex: 9, notes: [2, 7]});
    });
    const originalCommand = events(socket, "room:command")[0].args[0] as {commandId: string};
    const gapBoard = createBoard();
    gapBoard.values[4] = 8;
    act(() => socket.serverEmit("room:event", remoteEvent(5, gapBoard)));

    act(() => socket.serverEmit("room:snapshot", createSnapshot(2)));

    expect(result.current.confirmed?.revision).toBe(3);
    expect(result.current.status).toBe("resyncing");
    expect(result.current.send({type: "pause"})).toBeNull();
    expect(events(socket, "room:command")).toHaveLength(1);

    act(() => socket.serverEmit("room:snapshot", createSnapshot(3)));

    expect(result.current.status).toBe("connected");
    expect(events(socket, "room:command")).toHaveLength(2);
    const replayedCommand = events(socket, "room:command")[1].args[0] as {commandId: string};
    expect(replayedCommand.commandId).toBe(originalCommand.commandId);

    act(() => socket.serverEmit("room:snapshot", createSnapshot(3)));
    expect(events(socket, "room:command")).toHaveLength(2);
  });
});
