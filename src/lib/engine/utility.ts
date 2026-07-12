import groupBy from "lodash-es/groupBy";
import sortBy from "lodash-es/sortBy";
import {SUDOKU_COORDINATES} from "@sudoku/core";

import {Cell, SimpleSudoku} from "./types";

export {
  parseSudoku,
  SUDOKU_COORDINATES,
  SUDOKU_NUMBERS,
  squareIndex,
  stringifySudoku,
} from "@sudoku/core";

// SQUARE TABLE
/*
    _x = 0       _x = 1     _x = 2
.-----0-----------1----------2------|
|   x < 3   | 3 < x < 6 |   x > 6   |  _y = 0
|   y < 3   | y < 3     |   y < 3   |h
|-----3-----------4----------5------|
|   x < 3   | 3 < x < 6 |   x > 6   |  _y = 1
| 3 < y < 6 | 3 < y < 6 | 3 < y < 6 |
.-----6-----------7----------8------|
|   x < 3   | 3 < x < 6 |   x > 6   |  _y = 2
|   y > 6   | y > 6     |   y > 6   |
|-----------------------------------|
square = _y * 3 + _x;
*/
export const SQUARE_TABLE = (function () {
  const cells: Array<[number, number]> = ([] as Array<[number, number]>).concat(
    ...SUDOKU_COORDINATES.map((x) => {
      return SUDOKU_COORDINATES.map((y) => {
        return [x, y] as [number, number];
      });
    }),
  );
  const grouped = groupBy(cells, ([x, y]) => {
    return Math.floor(y / 3) * 3 + Math.floor(x / 3);
  });
  // we sort them, so we can use an optimization
  const squares = sortBy(Object.keys(grouped), (k) => k).map((k) =>
    sortBy(grouped[Number(k)], ([x, y]) => `${y}-${x}`),
  );
  return squares;
})();

export function simpleSudokuToCells(grid: SimpleSudoku, solution?: SimpleSudoku): Cell[] {
  return ([] as Cell[]).concat(
    ...grid.map((row, y) => {
      return row.map((n, x) => {
        return {
          x,
          y,
          number: n,
          notes: [],
          initial: n !== 0,
          solution: solution ? solution[y][x] : 0,
        };
      });
    }),
  );
}

export function cellsToSimpleSudoku(cells: Cell[]): SimpleSudoku {
  const simple: number[][] = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];
  cells.forEach((cell) => {
    if (cell.initial) {
      simple[cell.y][cell.x] = cell.number;
    }
  });
  return simple;
}
