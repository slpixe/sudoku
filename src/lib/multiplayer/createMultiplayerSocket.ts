import {
  MULTIPLAYER_PROTOCOL_VERSION,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@sudoku/multiplayer-protocol";
import {io, type Socket} from "socket.io-client";

const DEFAULT_MULTIPLAYER_URL = "https://multi.sudoku.slpixe.com";

export type MultiplayerSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createMultiplayerSocket(
  url: string = import.meta.env.VITE_MULTIPLAYER_URL ?? DEFAULT_MULTIPLAYER_URL,
): MultiplayerSocket {
  return io(url, {
    auth: {protocolVersion: MULTIPLAYER_PROTOCOL_VERSION},
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    randomizationFactor: 0.5,
  }) as MultiplayerSocket;
}
