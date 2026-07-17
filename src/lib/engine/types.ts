import type {SimpleSudoku} from "@sudoku/core";

export type {SimpleSudoku};

export enum DIFFICULTY {
  EASY = "easy",
  MEDIUM = "medium",
  HARD = "hard",
  FIENDISH = "fiendish",
  DIABOLICAL = "diabolical",
}

export interface CellCoordinates {
  x: number;
  y: number;
}
export interface Cell extends CellCoordinates {
  number: number;
  initial: boolean;
  notes: number[];
  solution: number;
}
