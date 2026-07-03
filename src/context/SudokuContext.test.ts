import {describe, expect, it} from "vitest";

import {Cell, CellCoordinates} from "src/lib/engine/types";
import {emptyGrid, sudokuReducer, SudokuState} from "./SudokuContext";

function createSudokuState(current: Cell[] = emptyGrid): SudokuState {
  return {
    current,
    history: [current],
    historyIndex: 0,
  };
}

function cellAt(cells: Cell[], coordinates: CellCoordinates): Cell {
  const cell = cells.find((candidate) => candidate.x === coordinates.x && candidate.y === coordinates.y);
  expect(cell).toBeDefined();
  return cell!;
}

function setNumber(cellCoordinates: CellCoordinates, number: number) {
  return {type: "sudoku/SET_NUMBER" as const, cellCoordinates, number};
}

describe("sudokuReducer", () => {
  it("sets numbers and removes matching notes from affected peers", () => {
    const current = emptyGrid.map((cell) => ({
      ...cell,
      notes:
        cell.x === 1 && cell.y === 0
          ? [4, 5]
          : cell.x === 0 && cell.y === 1
            ? [4]
            : cell.x === 1 && cell.y === 1
              ? [4]
              : cell.x === 4 && cell.y === 4
                ? [4]
                : [],
    }));
    const state = createSudokuState(current);

    const next = sudokuReducer(state, setNumber({x: 0, y: 0}, 4));

    expect(cellAt(next.current, {x: 0, y: 0})).toMatchObject({number: 4, notes: []});
    expect(cellAt(next.current, {x: 1, y: 0}).notes).toEqual([5]);
    expect(cellAt(next.current, {x: 0, y: 1}).notes).toEqual([]);
    expect(cellAt(next.current, {x: 1, y: 1}).notes).toEqual([]);
    expect(cellAt(next.current, {x: 4, y: 4}).notes).toEqual([4]);
    expect(next.history).toEqual([next.current, state.current]);
    expect(next.historyIndex).toBe(0);
  });

  it("updates notes, hints, and clearing for playable cells", () => {
    const target = {x: 0, y: 0};
    const state = createSudokuState(
      emptyGrid.map((cell) => ({
        ...cell,
        solution: cell.x === target.x && cell.y === target.y ? 4 : cell.solution,
      })),
    );

    const noted = sudokuReducer(state, {type: "sudoku/SET_NOTES", cellCoordinates: target, notes: [1, 2, 3]});
    expect(cellAt(noted.current, target)).toMatchObject({number: 0, notes: [1, 2, 3]});

    const hinted = sudokuReducer(noted, {type: "sudoku/GET_HINT", cellCoordinates: target});
    expect(cellAt(hinted.current, target)).toMatchObject({number: 4, notes: []});

    const clearedNumber = sudokuReducer(
      createSudokuState(
        hinted.current.map((cell) => (cell.x === target.x && cell.y === target.y ? {...cell, notes: [7]} : cell)),
      ),
      {type: "sudoku/CLEAR_NUMBER", cellCoordinates: target},
    );
    expect(cellAt(clearedNumber.current, target)).toMatchObject({number: 0, notes: [7]});

    const clearedCell = sudokuReducer(clearedNumber, {type: "sudoku/CLEAR_CELL", cellCoordinates: target});
    expect(cellAt(clearedCell.current, target)).toMatchObject({number: 0, notes: []});
  });

  it("undoes, redoes, and discards redo history after a new edit", () => {
    const initial = createSudokuState();
    const firstMove = sudokuReducer(initial, setNumber({x: 0, y: 0}, 1));
    const secondMove = sudokuReducer(firstMove, setNumber({x: 1, y: 0}, 2));

    const undone = sudokuReducer(secondMove, {type: "sudoku/UNDO"});
    expect(undone.current).toEqual(firstMove.current);
    expect(undone.historyIndex).toBe(1);

    const redone = sudokuReducer(undone, {type: "sudoku/REDO"});
    expect(redone.current).toEqual(secondMove.current);
    expect(redone.historyIndex).toBe(0);
    expect(sudokuReducer(redone, {type: "sudoku/REDO"})).toBe(redone);

    const branched = sudokuReducer(undone, setNumber({x: 2, y: 0}, 3));
    expect(branched.history).toEqual([branched.current, firstMove.current, initial.current]);
    expect(sudokuReducer(branched, {type: "sudoku/UNDO"}).current).toEqual(firstMove.current);
  });
});
