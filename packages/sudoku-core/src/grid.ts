export type SimpleSudoku = number[][];

export type BaseCollectionId = "easy" | "medium" | "hard" | "expert" | "evil";

export const BASE_COLLECTION_IDS: readonly BaseCollectionId[] = ["easy", "medium", "hard", "expert", "evil"];

export const SUDOKU_COORDINATES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
export const SUDOKU_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function squareIndex(x: number, y: number): number {
  return Math.floor(y / 3) * 3 + Math.floor(x / 3);
}

export function stringifySudoku(grid: SimpleSudoku): string {
  return grid
    .map((row) => {
      return row.map((cell) => (cell === 0 ? "0" : cell.toString())).join("");
    })
    .join("");
}

export function parseSudoku(sudoku: string): SimpleSudoku {
  if (sudoku.includes("\n")) {
    const lines = sudoku.split("\n").filter((line) => line.trim() !== "");
    if (lines.length !== 9) {
      throw new Error(`Wrong number of lines! Only 9 allowed: ${sudoku}`);
    }
    return lines.map((line) => {
      const characters = line.split("");
      if (characters.length !== 9) {
        throw new Error(`Wrong number of characters in line! Only 9 allowed: ${line} - ${sudoku}`);
      }
      return characters.map((character) => {
        if (character === "_" || character === "0") {
          return 0;
        }
        const number = Number(character);
        if (isNaN(number) || number < 1 || number > 9) {
          throw new Error(`The input data is incorrect, only 1-9 and _/0 allowed, but found ${character}`);
        }
        return number;
      });
    });
  }

  if (sudoku.length !== 9 * 9) {
    throw new Error(
      `The input data is incorrect, only 81 characters allowed, but found ${sudoku.length} characters. Input: ${sudoku}`,
    );
  }

  for (const character of sudoku) {
    if (["0"].concat(SUDOKU_NUMBERS.map((number) => String(number))).indexOf(character) < 0) {
      throw new Error(`The input data is incorrect, only 0-9 allowed, but found ${character}`);
    }
  }

  const lines: string[] = [];
  for (let index = 0; index < 9; index++) {
    lines.push(sudoku.slice(index * 9, (index + 1) * 9));
  }

  if (lines.length !== 9) {
    throw new Error(`Wrong number of lines! Only 9 allowed: ${sudoku}`);
  }

  return lines.map((line) => {
    const characters = line.split("");
    if (characters.length !== 9) {
      throw new Error(`Wrong number of characters in line! Only 9 allowed: ${line} - ${sudoku}`);
    }
    return characters.map((character) => (character === "0" ? 0 : Number(character)));
  });
}
