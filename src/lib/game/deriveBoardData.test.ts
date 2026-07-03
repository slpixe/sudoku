import {describe, expect, it, vi} from "vitest";

import {simpleSudokuToCells} from "src/lib/engine/utility";
import {deriveBoardData, getCellIndex} from "src/lib/game/deriveBoardData";
import SudokuGame from "src/lib/game/SudokuGame";

const cellsWithConflict = () =>
  simpleSudokuToCells([
    [1, 1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
  ]);

describe("deriveBoardData", () => {
  it("centralizes conflicts, paths, active-cell friends, occurrences, and notes", () => {
    const data = deriveBoardData(cellsWithConflict(), {x: 4, y: 4});

    expect(data.activeCell).toMatchObject({x: 4, y: 4});
    expect(data.occurrences[1]).toBe(2);
    expect(data.occurrences[2]).toBe(0);
    expect(data.notePossibilities[getCellIndex({x: 2, y: 0})]).not.toContain(1);
    expect(data.notePossibilities[getCellIndex({x: 8, y: 8})]).toContain(1);
    expect(data.pathCellIndexes.has(getCellIndex({x: 0, y: 0}))).toBe(true);
    expect(data.pathCellIndexes.has(getCellIndex({x: 1, y: 0}))).toBe(true);
    expect(data.friendCellIndexes.has(getCellIndex({x: 4, y: 0}))).toBe(true);
    expect(data.friendCellIndexes.has(getCellIndex({x: 0, y: 4}))).toBe(true);
    expect(data.friendCellIndexes.has(getCellIndex({x: 5, y: 5}))).toBe(true);
    expect(data.friendCellIndexes.has(getCellIndex({x: 8, y: 8}))).toBe(false);
  });

  it("calls the conflict derivation once per board derivation", () => {
    const conflictingFields = vi.spyOn(SudokuGame, "conflictingFields");

    try {
      deriveBoardData(cellsWithConflict(), {x: 0, y: 0});

      expect(conflictingFields).toHaveBeenCalledTimes(1);
    } finally {
      conflictingFields.mockRestore();
    }
  });
});
