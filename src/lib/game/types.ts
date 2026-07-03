import type {SimpleSudoku} from "src/lib/engine/types";

export interface SudokuRaw {
  iterations: number;
  sudoku: SimpleSudoku;
  solution: SimpleSudoku;
}
