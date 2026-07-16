import type {BaseCollectionId} from "@sudoku/core";

export interface CanonicalPuzzle {
  collectionId: BaseCollectionId;
  puzzleNumber: number;
  givens: number[];
  solution: number[];
}

export interface PuzzleCatalog {
  get(collectionId: BaseCollectionId, puzzleNumber: number): Promise<CanonicalPuzzle>;
}
