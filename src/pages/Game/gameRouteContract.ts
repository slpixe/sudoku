export type GameRouteSearch = {
  collection?: string;
  puzzle?: number;
  sudoku?: string;
  restart?: string;
};

export type GameRouteIntent =
  | {kind: "none"; forceRestart: boolean}
  | {kind: "invalid"; forceRestart: boolean}
  | {kind: "collection"; collectionId: string; puzzleNumber: number; forceRestart: boolean}
  | {
      kind: "payload";
      sudoku: string;
      collectionId: string;
      puzzleNumber: number;
      hasPuzzleMetadata: boolean;
      forceRestart: boolean;
    };

const EXACT_PAYLOAD_COLLECTION_ID = "custom";
const EXACT_PAYLOAD_PUZZLE_NUMBER = 1;

function stripWrappingQuotes(value: string) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

function getRawSearchParam(rawSearch: string | undefined, name: string) {
  if (!rawSearch) {
    return undefined;
  }

  const value = new URLSearchParams(rawSearch.replace(/^\?/, "")).get(name);
  return value === null ? undefined : stripWrappingQuotes(value);
}

function getSearchString(search: Record<string, unknown>, rawSearch: string | undefined, name: string) {
  const rawValue = getRawSearchParam(rawSearch, name);
  if (rawValue !== undefined) {
    return rawValue;
  }

  const value = search[name];
  if (typeof value === "string") {
    return stripWrappingQuotes(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value.toString();
  }
  return undefined;
}

function getSearchStringAlias(
  search: Record<string, unknown>,
  rawSearch: string | undefined,
  preferredName: string,
  legacyName: string,
) {
  return getSearchString(search, rawSearch, preferredName) ?? getSearchString(search, rawSearch, legacyName);
}

function parsePuzzleNumber(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function getSearchBoolean(search: Record<string, unknown>, rawSearch: string | undefined, name: string) {
  const value = getSearchString(search, rawSearch, name);
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
}

export function parseGameRouteIntent(search: Record<string, unknown>, rawSearch?: string): GameRouteIntent {
  const forceRestart = getSearchBoolean(search, rawSearch, "restart");
  const sudoku = getSearchString(search, rawSearch, "sudoku");
  const collectionId = getSearchStringAlias(search, rawSearch, "collection", "sudokuCollectionName");
  const puzzleValue = getSearchStringAlias(search, rawSearch, "puzzle", "sudokuIndex");
  const puzzleNumber = parsePuzzleNumber(puzzleValue);
  const hasCollection = collectionId !== undefined;
  const hasPuzzle = puzzleValue !== undefined;
  const hasPuzzleMetadata = hasCollection && puzzleNumber !== undefined;

  if (sudoku !== undefined) {
    return {
      kind: "payload",
      sudoku,
      collectionId: collectionId ?? EXACT_PAYLOAD_COLLECTION_ID,
      puzzleNumber: puzzleNumber ?? EXACT_PAYLOAD_PUZZLE_NUMBER,
      hasPuzzleMetadata,
      forceRestart,
    };
  }

  if (!hasCollection && !hasPuzzle) {
    return {kind: "none", forceRestart};
  }

  if (!collectionId || puzzleNumber === undefined) {
    return {kind: "invalid", forceRestart};
  }

  return {
    kind: "collection",
    collectionId,
    puzzleNumber,
    forceRestart,
  };
}

export function createCompactGameSearch(collectionId: string, puzzleNumber: number, restart = false): GameRouteSearch {
  return {
    collection: collectionId,
    puzzle: puzzleNumber,
    ...(restart ? {restart: "1"} : {}),
  };
}

export function createPayloadGameSearch(
  sudoku: string,
  collectionId: string,
  puzzleNumber: number,
  restart = false,
): GameRouteSearch {
  return {
    sudoku,
    collection: collectionId,
    puzzle: puzzleNumber,
    ...(restart ? {restart: "1"} : {}),
  };
}

export function createGameRouteSearchKey(search: GameRouteSearch) {
  return JSON.stringify(
    Object.entries(search)
      .filter(([, value]) => value !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)),
  );
}

export function createGameRouteSudokuKey({
  collectionId,
  puzzleNumber,
  sudoku,
}: {
  collectionId: string;
  puzzleNumber: number;
  sudoku: string;
}) {
  return JSON.stringify([collectionId, puzzleNumber, sudoku]);
}

export function shouldUseCompactGameSearch({
  sudoku,
  collectionSudoku,
  hasPuzzleMetadata,
}: {
  sudoku: string;
  collectionSudoku: string | undefined;
  hasPuzzleMetadata: boolean;
}) {
  return hasPuzzleMetadata && collectionSudoku === sudoku;
}
