import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {load} from "cheerio";

import {simpleSudokuToCells} from "src/lib/engine/utility";
import {deriveBoardData} from "src/lib/game/deriveBoardData";

import SudokuMenuNumbers from "./SudokuMenuNumbers";

const cellsWithOneDigitCompleted = () =>
  simpleSudokuToCells([
    [1, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 1],
  ]);

const cellsWithOneDigitIncomplete = () =>
  cellsWithOneDigitCompleted().map((cell) => (cell.x === 8 && cell.y === 8 ? {...cell, number: 0} : cell));

function renderNumberPad(cells = cellsWithOneDigitCompleted()) {
  return load(
    renderToStaticMarkup(
      <SudokuMenuNumbers
        notesMode={false}
        boardData={deriveBoardData(cells)}
        showOccurrences={true}
        showHints={false}
        setNumber={vi.fn()}
        setNotes={vi.fn()}
      />,
    ),
  );
}

describe("SudokuMenuNumbers", () => {
  it("visually mutes completed digits without disabling their buttons", () => {
    const $ = renderNumberPad();
    const completedButton = $('[data-testid="sudoku-number-1"]');
    const incompleteButton = $('[data-testid="sudoku-number-2"]');

    expect(completedButton.attr("class")).toContain("bg-gray-300");
    expect(completedButton.attr("class")).toContain("opacity-70");
    expect(completedButton.attr("disabled")).toBeUndefined();
    expect(incompleteButton.attr("class")).not.toContain("bg-gray-300");
  });

  it("returns completed digits to the normal visual state when counts drop below nine", () => {
    const $ = renderNumberPad(cellsWithOneDigitIncomplete());
    const numberButton = $('[data-testid="sudoku-number-1"]');

    expect(numberButton.attr("class")).not.toContain("bg-gray-300");
    expect(numberButton.attr("class")).not.toContain("opacity-70");
  });
});
