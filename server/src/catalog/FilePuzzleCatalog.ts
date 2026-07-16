import {BASE_COLLECTION_IDS, parseSudoku, solveBacktracking} from "@sudoku/core";
import type {BaseCollectionId, SimpleSudoku} from "@sudoku/core";
import {readFile} from "node:fs/promises";
import {isAbsolute, join} from "node:path";
import type {CanonicalPuzzle, PuzzleCatalog} from "./PuzzleCatalog.js";

const BASE_COLLECTION_ID_SET = new Set<string>(BASE_COLLECTION_IDS);

function flattenGrid(grid: SimpleSudoku): number[] {
  return grid.flatMap((row) => row);
}

export class FilePuzzleCatalog implements PuzzleCatalog {
  readonly #sudokusDirectory: string;

  constructor(sudokusDirectory: string) {
    if (!isAbsolute(sudokusDirectory)) {
      throw new TypeError("The sudokus directory must be an absolute path");
    }
    this.#sudokusDirectory = sudokusDirectory;
  }

  async get(collectionId: BaseCollectionId, puzzleNumber: number): Promise<CanonicalPuzzle> {
    if (!BASE_COLLECTION_ID_SET.has(collectionId)) {
      throw new RangeError(`Unknown base collection: ${String(collectionId)}`);
    }
    if (!Number.isSafeInteger(puzzleNumber) || puzzleNumber < 1) {
      throw new RangeError("Puzzle number must be a positive integer");
    }

    const contents = await readFile(join(this.#sudokusDirectory, `${collectionId}.txt`), "utf8");
    const puzzles = contents
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const fingerprint = puzzles[puzzleNumber - 1];
    if (fingerprint === undefined) {
      throw new RangeError(`Puzzle ${puzzleNumber} does not exist in ${collectionId}`);
    }

    const givensGrid = parseSudoku(fingerprint);
    const solutionGrid = solveBacktracking(givensGrid).sudoku;
    if (solutionGrid === null) {
      throw new Error(`Canonical puzzle ${collectionId}/${puzzleNumber} has no solution`);
    }

    return {
      collectionId,
      puzzleNumber,
      givens: flattenGrid(givensGrid),
      solution: flattenGrid(solutionGrid),
    };
  }
}
