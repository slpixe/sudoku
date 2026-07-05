import {describe, expect, it} from "vitest";

import {shouldClaimCurrentSudoku, shouldLockForActiveGame} from "./useActiveGameLock";

describe("useActiveGameLock", () => {
  it("locks when another owner claims a different puzzle", () => {
    expect(
      shouldLockForActiveGame({sudokuKey: "puzzle-b", ownerId: "owner-b", updatedAt: 1}, "owner-a", "puzzle-a"),
    ).toBe(true);
  });

  it("does not lock when another owner claims the same puzzle", () => {
    expect(
      shouldLockForActiveGame({sudokuKey: "puzzle-a", ownerId: "owner-b", updatedAt: 1}, "owner-a", "puzzle-a"),
    ).toBe(false);
  });

  it("does not lock for this tab's own claim", () => {
    expect(
      shouldLockForActiveGame({sudokuKey: "puzzle-b", ownerId: "owner-a", updatedAt: 1}, "owner-a", "puzzle-a"),
    ).toBe(false);
  });

  it("does not claim again when the current puzzle was already claimed", () => {
    expect(
      shouldClaimCurrentSudoku({
        initialized: true,
        locked: false,
        lastClaimedSudokuKey: "puzzle-a",
        currentSudokuKey: "puzzle-a",
      }),
    ).toBe(false);
  });

  it("claims when the current puzzle changes", () => {
    expect(
      shouldClaimCurrentSudoku({
        initialized: true,
        locked: false,
        lastClaimedSudokuKey: "puzzle-a",
        currentSudokuKey: "puzzle-b",
      }),
    ).toBe(true);
  });

  it("does not claim before initialization", () => {
    expect(
      shouldClaimCurrentSudoku({
        initialized: false,
        locked: false,
        lastClaimedSudokuKey: undefined,
        currentSudokuKey: "puzzle-a",
      }),
    ).toBe(false);
  });

  it("does not claim while locked", () => {
    expect(
      shouldClaimCurrentSudoku({
        initialized: true,
        locked: true,
        lastClaimedSudokuKey: undefined,
        currentSudokuKey: "puzzle-a",
      }),
    ).toBe(false);
  });
});
