import {describe, expect, it} from "vitest";
import {createRoomCode} from "./roomCode.js";

describe("createRoomCode", () => {
  it("maps deterministic bytes to an unambiguous six-character code", () => {
    const bytes = Uint8Array.from([0, 7, 8, 15, 16, 31]);

    expect(createRoomCode((size) => bytes.slice(0, size))).toBe("29AHJZ");
  });

  it("uses only the documented alphabet", () => {
    const code = createRoomCode((size) => Uint8Array.from({length: size}, (_, index) => index));

    expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  });
});
