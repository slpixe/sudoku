import {Cell, CellCoordinates} from "src/lib/engine/types";
import {SUDOKU_NUMBERS} from "src/lib/engine/utility";
import SudokuGame, {ConflictingCell, ConflictingPath} from "src/lib/game/SudokuGame";

export interface DerivedBoardData {
  activeCell?: Cell;
  conflicting: ConflictingCell[];
  friendCellIndexes: Set<number>;
  notePossibilities: number[][];
  occurrences: Record<number, number>;
  pathCellIndexes: Set<number>;
  uniquePaths: ConflictingPath[];
}

export function getCellIndex(cell: CellCoordinates): number {
  return cell.y * 9 + cell.x;
}

export function deriveBoardData(sudoku: Cell[], activeCellCoordinates?: CellCoordinates): DerivedBoardData {
  const activeCell = activeCellCoordinates
    ? sudoku.find((cell) => cell.x === activeCellCoordinates.x && cell.y === activeCellCoordinates.y)
    : undefined;
  const conflicting = SudokuGame.conflictingFields(sudoku);
  const paths: ConflictingPath[] = [];

  conflicting.forEach((conflictingCell) => {
    paths.push(...SudokuGame.getPathsFromConflicting(conflictingCell, sudoku));
  });

  const uniquePaths = SudokuGame.uniquePaths(paths);
  const pathCellIndexes = new Set<number>();

  uniquePaths.forEach((path) => {
    SudokuGame.getPathBetweenCell(path.from, path.to).forEach((cell) => {
      pathCellIndexes.add(getCellIndex(cell));
    });
  });

  const friendsOfActiveCell = activeCell ? SudokuGame.sameSquareColumnRow(activeCell, sudoku) : [];
  const friendCellIndexes = new Set<number>();

  friendsOfActiveCell.forEach((cell) => {
    friendCellIndexes.add(getCellIndex(cell));
  });

  const occurrences = SUDOKU_NUMBERS.reduce<Record<number, number>>((counts, number) => {
    counts[number] = 0;
    return counts;
  }, {});

  sudoku.forEach((cell) => {
    if (cell.number !== 0) {
      occurrences[cell.number] = (occurrences[cell.number] ?? 0) + 1;
    }
  });

  return {
    activeCell,
    conflicting,
    friendCellIndexes,
    notePossibilities: conflicting.map((cell) => cell.possibilities),
    occurrences,
    pathCellIndexes,
    uniquePaths,
  };
}
