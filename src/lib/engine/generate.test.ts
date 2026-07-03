import generateSudoku, {DIFFICULTY_RANGES, isSudokuUnique} from "./generate";
import {createSeededRandom} from "./seededRandom";
import {solve} from "./solverAC3";
import {EMPTY_SUDOKU, ISSUE_33_CUSTOM_SUDOKU, SOLVED_SUDOKUS} from "./testutils";
import {DIFFICULTY} from "./types";
import {parseSudoku, stringifySudoku} from "./utility";
import {describe, it, expect} from "vitest";

const INVALID_GIVENS_SUDOKU = parseSudoku(
  "110000000000000000000000000000000000000000000000000000000000000000000000000000000",
);

describe("generate", () => {
  it("uses non-overlapping difficulty ranges", () => {
    const difficulties = [DIFFICULTY.EASY, DIFFICULTY.MEDIUM, DIFFICULTY.HARD, DIFFICULTY.EXPERT, DIFFICULTY.EVIL];

    for (let i = 1; i < difficulties.length; i++) {
      const previousDifficulty = difficulties[i - 1];
      const currentDifficulty = difficulties[i];

      expect(DIFFICULTY_RANGES[currentDifficulty][0]).toBeGreaterThan(DIFFICULTY_RANGES[previousDifficulty][1]);
    }
  });

  it("generates the same sudoku using a seed", () => {
    const randomFn = createSeededRandom(10);
    const sudoku = generateSudoku(DIFFICULTY.EASY, randomFn);
    const stringified = stringifySudoku(sudoku.sudoku);
    expect(stringified).toBe("080902506061078040040050003050104020400000900013090085000020000725800000800705030");
    // Check if it is unique.
    expect(isSudokuUnique(sudoku.sudoku)).toBe(true);
    // Check if it can be solved.
    expect(solve(sudoku.sudoku).iterations).toBe(4);
  });

  it("generates the difficult sudoku using a seed", () => {
    const randomFn = createSeededRandom(10);
    const sudoku = generateSudoku(DIFFICULTY.EVIL, randomFn);
    // Check if it is unique.
    expect(isSudokuUnique(sudoku.sudoku)).toBe(true);
    // Check if it can be solved.
    // The difficulty is capped, as we don't do too many changes.
    expect(solve(sudoku.sudoku).iterations).toBe(47);
  });

});

describe("checkForUniqueness", () => {
  it("empty sudoku is not unique", () => {
    expect(isSudokuUnique(EMPTY_SUDOKU)).toBe(false);
  });

  it("invalid givens are not unique", () => {
    expect(isSudokuUnique(INVALID_GIVENS_SUDOKU)).toBe(false);
  });

  it("test sudokus are unique", () => {
    SOLVED_SUDOKUS.forEach((s) => {
      expect(isSudokuUnique(s.unsolved)).toBe(true);
    });
  });

  it("recognizes the custom sudoku from issue #33 as unique", {timeout: 30_000}, () => {
    expect(isSudokuUnique(ISSUE_33_CUSTOM_SUDOKU.unsolved)).toBe(true);
  });
});
