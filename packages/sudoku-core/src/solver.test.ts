import {describe, expect, it} from "vitest";

import {countSolutions, parseSudoku, solveBacktracking, stringifySudoku} from "./index.js";

const EASY = "534920700060007309900000010008700000496803002721594806000200940800046100003000000";

describe("sudoku solver", () => {
  it("solves a valid catalog puzzle", () => {
    const result = solveBacktracking(parseSudoku(EASY));

    expect(result.iterations).not.toBe(Infinity);
    expect(result.sudoku).not.toBeNull();
    expect(stringifySudoku(result.sudoku!)).not.toContain("0");
  });

  it("does not mutate the input grid", () => {
    const puzzle = parseSudoku(EASY);
    const before = stringifySudoku(puzzle);

    solveBacktracking(puzzle);

    expect(stringifySudoku(puzzle)).toBe(before);
  });

  it("stops counting when the solution limit is reached", () => {
    const empty = parseSudoku("0".repeat(81));
    const result = countSolutions(empty, 2);

    expect(result.count).toBe(2);
    expect(result.firstSolution).not.toBeNull();
  });

  it("rejects conflicting givens", () => {
    const invalid = parseSudoku(`55${"0".repeat(79)}`);

    expect(solveBacktracking(invalid).sudoku).toBeNull();
    expect(countSolutions(invalid).count).toBe(0);
  });
});
