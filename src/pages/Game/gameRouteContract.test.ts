import {describe, expect, it} from "vitest";

import {
  createCompactGameSearch,
  createGameRouteSearchKey,
  createGameRouteSudokuKey,
  createPayloadGameSearch,
  parseGameRouteIntent,
  shouldUseCompactGameSearch,
} from "./gameRouteContract";

describe("game route contract", () => {
  it("parses an empty route as no explicit puzzle", () => {
    expect(parseGameRouteIntent({})).toEqual({kind: "none", forceRestart: false});
  });

  it("parses compact collection and puzzle params", () => {
    expect(parseGameRouteIntent({collection: "easy", puzzle: 2})).toEqual({
      kind: "collection",
      collectionId: "easy",
      puzzleNumber: 2,
      forceRestart: false,
    });
  });

  it("parses legacy collection and puzzle aliases", () => {
    expect(parseGameRouteIntent({sudokuCollectionName: "medium", sudokuIndex: "3"})).toEqual({
      kind: "collection",
      collectionId: "medium",
      puzzleNumber: 3,
      forceRestart: false,
    });
  });

  it("parses full payload params with metadata", () => {
    expect(parseGameRouteIntent({collection: "easy", puzzle: "1", sudoku: "123", restart: "1"})).toEqual({
      kind: "payload",
      sudoku: "123",
      collectionId: "easy",
      puzzleNumber: 1,
      hasPuzzleMetadata: true,
      forceRestart: true,
    });
  });

  it("parses full payload params without metadata as an exact custom puzzle", () => {
    expect(parseGameRouteIntent({sudoku: "123"})).toEqual({
      kind: "payload",
      sudoku: "123",
      collectionId: "custom",
      puzzleNumber: 1,
      hasPuzzleMetadata: false,
      forceRestart: false,
    });
  });

  it("treats incomplete compact params as invalid", () => {
    expect(parseGameRouteIntent({collection: "easy"})).toEqual({kind: "invalid", forceRestart: false});
    expect(parseGameRouteIntent({puzzle: 1})).toEqual({kind: "invalid", forceRestart: false});
    expect(parseGameRouteIntent({collection: "easy", puzzle: 0})).toEqual({kind: "invalid", forceRestart: false});
  });

  it("prefers raw hash/search values and strips tanstack wrapping quotes", () => {
    expect(parseGameRouteIntent({}, 'collection=%22easy%22&puzzle=4')).toEqual({
      kind: "collection",
      collectionId: "easy",
      puzzleNumber: 4,
      forceRestart: false,
    });
  });

  it("builds compact search without sudoku payload", () => {
    expect(createCompactGameSearch("easy", 1)).toEqual({collection: "easy", puzzle: 1});
    expect(createCompactGameSearch("easy", 1, true)).toEqual({collection: "easy", puzzle: 1, restart: "1"});
  });

  it("builds payload search with exact sudoku data", () => {
    expect(createPayloadGameSearch("123", "custom", 1)).toEqual({sudoku: "123", collection: "custom", puzzle: 1});
  });

  it("creates stable search and sudoku keys", () => {
    expect(createGameRouteSearchKey({puzzle: 1, collection: "easy"})).toBe(
      createGameRouteSearchKey({collection: "easy", puzzle: 1}),
    );
    expect(createGameRouteSudokuKey({collectionId: "easy", puzzleNumber: 1, sudoku: "123"})).toBe(
      JSON.stringify(["easy", 1, "123"]),
    );
  });

  it("uses compact search when collection puzzle metadata matches the payload", () => {
    expect(shouldUseCompactGameSearch({sudoku: "123", collectionSudoku: "123", hasPuzzleMetadata: true})).toBe(true);
  });

  it("keeps payload search when collection puzzle metadata does not match the payload", () => {
    expect(shouldUseCompactGameSearch({sudoku: "123", collectionSudoku: "456", hasPuzzleMetadata: true})).toBe(false);
    expect(shouldUseCompactGameSearch({sudoku: "123", collectionSudoku: undefined, hasPuzzleMetadata: false})).toBe(
      false,
    );
  });
});
