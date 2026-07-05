import easySudokus from "../../../sudokus/easy.txt?raw";
import mediumSudokus from "../../../sudokus/medium.txt?raw";
import hardSudokus from "../../../sudokus/hard.txt?raw";
import expertSudokus from "../../../sudokus/expert.txt?raw";
import evilSudokus from "../../../sudokus/evil.txt?raw";
import {parseSudoku} from "src/lib/engine/utility";
import {solve} from "src/lib/engine/solverAC3";
import {useCallback, useState} from "react";
import {BaseCollection, Collection} from "../database/collections";
import {BASE_COLLECTION_IDS, isBaseCollectionId} from "src/lib/game/baseCollections";
import {appPersistence} from "src/lib/persistence/appPersistence";
import type {SudokuRaw} from "src/lib/game/types";

export type {SudokuRaw};

export interface PaginatedSudokus {
  sudokus: SudokuRaw[];
  totalRows: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const BASE_SUDOKU_COLLECTIONS: Record<BaseCollection, string> = {
  [BaseCollection.Easy]: easySudokus,
  [BaseCollection.Medium]: mediumSudokus,
  [BaseCollection.Hard]: hardSudokus,
  [BaseCollection.Expert]: expertSudokus,
  [BaseCollection.Evil]: evilSudokus,
} as const;

function getLineCount(collection: Collection): number {
  return collection.sudokusRaw.split("\n").filter((line) => line.trim()).length;
}

export function getSudokusPaginated(collection: Collection, page: number = 0, pageSize: number = 12): PaginatedSudokus {
  const totalRows = getLineCount(collection);
  const totalPages = Math.ceil(totalRows / pageSize);
  const startIndex = page * pageSize;
  const endIndex = startIndex + pageSize;

  if (collection.sudokusRaw === "") {
    return {
      sudokus: [],
      totalRows: 0,
      page,
      pageSize,
      totalPages: 0,
    };
  }

  const rawLines = collection.sudokusRaw.split("\n");
  const sudokus: SudokuRaw[] = [];

  for (const line of rawLines.slice(startIndex, endIndex)) {
    const sudoku = parseSudoku(line);
    const solved = solve(sudoku);
    const result = {
      sudoku,
      solution: solved.sudoku,
      iterations: solved.iterations,
    };
    if (result.solution !== null) {
      sudokus.push(result as SudokuRaw);
    } else {
      console.warn("Invalid sudoku: ", sudoku, solved);
    }
  }

  return {
    sudokus,
    totalRows,
    page,
    pageSize,
    totalPages,
  };
}

export function getCollections() {
  const baseCollections = BASE_COLLECTION_IDS;
  const collections = appPersistence.collections.loadIndex();
  return [...baseCollections.map((collection) => ({id: collection, name: collection})), ...collections];
}

export function getSudokuCollection(collectionId: string) {
  if (isBaseCollectionId(collectionId)) {
    return {
      id: collectionId,
      name: collectionId,
      sudokusRaw: BASE_SUDOKU_COLLECTIONS[collectionId as BaseCollection],
    };
  }
  return appPersistence.collections.load(collectionId);
}

export function useSudokuCollections() {
  const collections = getCollections();
  const [activeCollectionId, setActiveCollectionId] = useState<string>("easy");

  const getCollection = useCallback(
    (collectionId: string) => {
      return getSudokuCollection(collectionId);
    },
    [],
  );

  const activeCollection = getCollection(activeCollectionId);

  return {
    collections,
    getCollection,
    activeCollection,
    setActiveCollectionId,
  };
}
