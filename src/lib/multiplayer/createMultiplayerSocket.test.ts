import {MULTIPLAYER_PROTOCOL_VERSION} from "@sudoku/multiplayer-protocol";
import {afterEach, describe, expect, it, vi} from "vitest";

const {ioMock} = vi.hoisted(() => ({ioMock: vi.fn(() => ({socket: true}))}));

vi.mock("socket.io-client", () => ({io: ioMock}));

import {createMultiplayerSocket} from "./createMultiplayerSocket";

afterEach(() => {
  ioMock.mockClear();
  vi.unstubAllEnvs();
});

describe("createMultiplayerSocket", () => {
  it("configures a typed, lazy Socket.IO client with the protocol handshake and bounded backoff", () => {
    const socket = createMultiplayerSocket("https://multi.example.test");

    expect(socket).toEqual({socket: true});
    expect(ioMock).toHaveBeenCalledWith("https://multi.example.test", {
      auth: {protocolVersion: MULTIPLAYER_PROTOCOL_VERSION},
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      randomizationFactor: 0.5,
    });
  });

  it("reads the public multiplayer URL from Vite environment configuration", () => {
    vi.stubEnv("VITE_MULTIPLAYER_URL", "https://configured.example.test");

    createMultiplayerSocket();

    expect(ioMock).toHaveBeenCalledWith("https://configured.example.test", expect.any(Object));
  });
});
