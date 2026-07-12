import {describe, expect, it} from "vitest";

import {parseSudoku, squareIndex, stringifySudoku} from "./index.js";

const EASY = "534920700060007309900000010008700000496803002721594806000200940800046100003000000";

describe("sudoku grid", () => {
  it("round-trips an 81-character puzzle", () => {
    expect(stringifySudoku(parseSudoku(EASY))).toBe(EASY);
  });

  it("parses the multiline underscore format", () => {
    const puzzle = [
      "53492_7__",
      "_6___73_9",
      "9______1_",
      "__87_____",
      "4968_3__2",
      "7215948_6",
      "___2__94_",
      "8___461__",
      "__3______",
    ].join("\n");

    expect(stringifySudoku(parseSudoku(puzzle))).toBe(EASY);
  });

  it("rejects malformed puzzles", () => {
    expect(() => parseSudoku("0".repeat(80))).toThrow("only 81 characters allowed");
    expect(() => parseSudoku(`${"0".repeat(80)}x`)).toThrow("only 0-9 allowed");
  });

  it("maps coordinates to their 3-by-3 square", () => {
    expect(squareIndex(0, 0)).toBe(0);
    expect(squareIndex(4, 5)).toBe(4);
    expect(squareIndex(8, 8)).toBe(8);
  });
});
