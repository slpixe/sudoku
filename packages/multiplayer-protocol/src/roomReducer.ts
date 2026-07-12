import type {BoardAction, CellInverse, RoomBoard, UndoEntry} from "./types.js";

function assertCellIndex(cellIndex: number): void {
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 80) {
    throw new RangeError(`Cell index must be an integer from 0 to 80: ${cellIndex}`);
  }
}

function assertDigit(digit: number): void {
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
    throw new RangeError(`Sudoku digit must be an integer from 1 to 9: ${digit}`);
  }
}

function cloneBoard(board: RoomBoard): RoomBoard {
  return {
    givens: board.givens.slice(),
    solution: board.solution.slice(),
    values: board.values.slice(),
    notes: board.notes.map((notes) => notes.slice()),
  };
}

function isPeer(firstIndex: number, secondIndex: number): boolean {
  const firstRow = Math.floor(firstIndex / 9);
  const firstColumn = firstIndex % 9;
  const secondRow = Math.floor(secondIndex / 9);
  const secondColumn = secondIndex % 9;

  return (
    firstRow === secondRow ||
    firstColumn === secondColumn ||
    (Math.floor(firstRow / 3) === Math.floor(secondRow / 3) &&
      Math.floor(firstColumn / 3) === Math.floor(secondColumn / 3))
  );
}

function cellInverse(board: RoomBoard, cellIndex: number): CellInverse {
  return {
    cellIndex,
    value: board.values[cellIndex],
    notes: board.notes[cellIndex].slice(),
  };
}

function cellsDiffer(board: RoomBoard, nextBoard: RoomBoard, cellIndex: number): boolean {
  const notes = board.notes[cellIndex];
  const nextNotes = nextBoard.notes[cellIndex];

  return (
    board.values[cellIndex] !== nextBoard.values[cellIndex] ||
    notes.length !== nextNotes.length ||
    notes.some((note, index) => note !== nextNotes[index])
  );
}

function normalizeNotes(notes: number[]): number[] {
  for (const note of notes) {
    assertDigit(note);
  }

  return [...new Set(notes)].sort((first, second) => first - second);
}

export function applyBoardAction(board: RoomBoard, action: BoardAction): {board: RoomBoard; inverse: UndoEntry} {
  assertCellIndex(action.cellIndex);

  if (board.givens[action.cellIndex] !== 0) {
    return {board, inverse: {cells: []}};
  }

  const nextBoard = cloneBoard(board);

  switch (action.type) {
    case "setNumber":
      assertDigit(action.number);
      nextBoard.values[action.cellIndex] = action.number;
      nextBoard.notes[action.cellIndex] = [];

      for (let cellIndex = 0; cellIndex < 81; cellIndex++) {
        if (isPeer(action.cellIndex, cellIndex)) {
          nextBoard.notes[cellIndex] = nextBoard.notes[cellIndex].filter((note) => note !== action.number);
        }
      }
      break;
    case "setNotes":
      nextBoard.values[action.cellIndex] = 0;
      nextBoard.notes[action.cellIndex] = normalizeNotes(action.notes);
      break;
    case "clearCell":
      nextBoard.values[action.cellIndex] = 0;
      nextBoard.notes[action.cellIndex] = [];
      break;
    case "hint":
      assertDigit(board.solution[action.cellIndex]);
      nextBoard.values[action.cellIndex] = board.solution[action.cellIndex];
      nextBoard.notes[action.cellIndex] = [];
      break;
  }

  const cells: CellInverse[] = [];
  for (let cellIndex = 0; cellIndex < 81; cellIndex++) {
    if (cellsDiffer(board, nextBoard, cellIndex)) {
      cells.push(cellInverse(board, cellIndex));
    }
  }

  return {board: nextBoard, inverse: {cells}};
}

export function applyInverse(board: RoomBoard, inverse: UndoEntry): RoomBoard {
  const nextBoard = cloneBoard(board);

  for (const cell of inverse.cells) {
    assertCellIndex(cell.cellIndex);
    nextBoard.values[cell.cellIndex] = cell.value;
    nextBoard.notes[cell.cellIndex] = cell.notes.slice();
  }

  return nextBoard;
}
