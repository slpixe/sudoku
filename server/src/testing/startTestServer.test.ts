import {describe, expect, it} from "vitest";

import {FilePuzzleCatalog} from "../catalog/FilePuzzleCatalog.js";
import {PresenceService} from "../rooms/PresenceService.js";
import {RoomService} from "../rooms/RoomService.js";
import {InMemoryRoomRepository} from "./InMemoryRoomRepository.js";
import {createTestMultiplayerComposition, readTestServerOptions} from "./startTestServer.js";

const VALID_ENVIRONMENT = {
  NODE_ENV: "test",
  PORT: "5046",
  RECONNECT_GRACE_SECONDS: "1",
} as const;

describe("readTestServerOptions", () => {
  it("refuses to run outside NODE_ENV=test", () => {
    expect(() => readTestServerOptions({...VALID_ENVIRONMENT, NODE_ENV: "production"})).toThrow(
      /only runs with NODE_ENV=test/,
    );
    expect(() => readTestServerOptions({...VALID_ENVIRONMENT, NODE_ENV: "development"})).toThrow(
      /only runs with NODE_ENV=test/,
    );
  });

  it("reads only the isolated port and short reconnect grace", () => {
    expect(
      readTestServerOptions({
        ...VALID_ENVIRONMENT,
        ALLOWED_ORIGINS: "https://ignored.example",
        DATABASE_URL: "postgres://ignored.example/sudoku",
        ROOM_TTL_HOURS: "999",
      }),
    ).toEqual({port: 5046, reconnectGraceSeconds: 1});
  });

  it.each([
    [{...VALID_ENVIRONMENT, PORT: "1024"}, /PORT/],
    [{...VALID_ENVIRONMENT, PORT: "65536"}, /PORT/],
    [{...VALID_ENVIRONMENT, PORT: "not-a-port"}, /PORT/],
    [{...VALID_ENVIRONMENT, RECONNECT_GRACE_SECONDS: "6"}, /RECONNECT_GRACE_SECONDS/],
    [{...VALID_ENVIRONMENT, RECONNECT_GRACE_SECONDS: "-1"}, /RECONNECT_GRACE_SECONDS/],
  ])("rejects unsafe disposable-server options", (environment, message) => {
    expect(() => readTestServerOptions(environment)).toThrow(message);
  });
});

describe("createTestMultiplayerComposition", () => {
  it("uses the real catalog, services, transport app, and disposable repository", () => {
    const composition = createTestMultiplayerComposition(VALID_ENVIRONMENT, () => {});

    expect(composition.catalog).toBeInstanceOf(FilePuzzleCatalog);
    expect(composition.repository).toBeInstanceOf(InMemoryRoomRepository);
    expect(composition.roomService).toBeInstanceOf(RoomService);
    expect(composition.roomService.repository).toBe(composition.repository);
    expect(composition.roomService.catalog).toBe(composition.catalog);
    expect(composition.presence).toBeInstanceOf(PresenceService);
    expect(composition.presence.reconnectGraceMs).toBe(1_000);
    expect(composition.app.httpServer).toBeDefined();
    expect(composition.app.io).toBeDefined();

    composition.app.io.close();
  });
});
