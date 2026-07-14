// @vitest-environment jsdom

import {cleanup, renderHook} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {simpleSudokuToCells} from "src/lib/engine/utility";
import {START_SUDOKU} from "src/lib/game/startSudoku";

import {useSoloCompletionDetection} from "./useSoloCompletionDetection";

afterEach(cleanup);

const completedCells = simpleSudokuToCells(START_SUDOKU.solution, START_SUDOKU.solution);
const freshCells = simpleSudokuToCells(START_SUDOKU.sudoku, START_SUDOKU.solution);

describe("useSoloCompletionDetection", () => {
  it("does not re-win a fresh puzzle from the completed grid rendered before route synchronization", () => {
    const onWon = vi.fn();
    const {rerender} = renderHook(({cells, routeReady}) => useSoloCompletionDetection({cells, routeReady, onWon}), {
      initialProps: {cells: completedCells, routeReady: false},
    });

    expect(onWon).not.toHaveBeenCalled();

    rerender({cells: freshCells, routeReady: true});

    expect(onWon).not.toHaveBeenCalled();
  });

  it("marks a synchronized solved puzzle as won", () => {
    const onWon = vi.fn();

    renderHook(() => useSoloCompletionDetection({cells: completedCells, routeReady: true, onWon}));

    expect(onWon).toHaveBeenCalledOnce();
  });
});
