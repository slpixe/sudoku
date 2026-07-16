import type {BaseCollectionId} from "@sudoku/core";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {FilePuzzleCatalog} from "./FilePuzzleCatalog.js";

const SUDOKUS_DIRECTORY = fileURLToPath(new URL("../../../sudokus", import.meta.url));
const EASY_PUZZLE_ONE =
  "534920700060007309900000010008700000496803002721594806000200940800046100003000000";

describe("FilePuzzleCatalog", () => {
  const catalog = new FilePuzzleCatalog(SUDOKUS_DIRECTORY);

  it("loads the canonical first easy puzzle and solves it", async () => {
    const puzzle = await catalog.get("easy", 1);

    expect(puzzle).toMatchObject({
      collectionId: "easy",
      puzzleNumber: 1,
    });
    expect(puzzle.givens.join("")).toBe(EASY_PUZZLE_ONE);
    expect(puzzle.givens).toHaveLength(81);
    expect(puzzle.solution).toHaveLength(81);
    expect(puzzle.solution.every((digit) => Number.isInteger(digit) && digit >= 1 && digit <= 9)).toBe(true);
  });

  it.each([
    ["puzzle zero", "easy" as BaseCollectionId, 0],
    ["an out-of-range puzzle", "easy" as BaseCollectionId, Number.MAX_SAFE_INTEGER],
    ["a custom collection", "custom" as BaseCollectionId, 1],
  ])("rejects %s", async (_description, collectionId, puzzleNumber) => {
    await expect(catalog.get(collectionId, puzzleNumber)).rejects.toThrow();
  });
});
