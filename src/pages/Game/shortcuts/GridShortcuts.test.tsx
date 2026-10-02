// @vitest-environment jsdom

import * as React from "react";
import {cleanup, fireEvent, render} from "@testing-library/react";
import hotkeys from "hotkeys-js";
import {afterEach, describe, expect, it, vi} from "vitest";

import {emptyGrid} from "src/context/SudokuContext";
import {deriveBoardData} from "src/lib/game/deriveBoardData";

import GridShortcuts from "./GridShortcuts";
import {ShortcutScope} from "./ShortcutScope";

afterEach(() => {
  cleanup();
  hotkeys.setScope("all");
});

function renderShortcuts(overrides: Partial<React.ComponentProps<typeof GridShortcuts>> = {}) {
  const setNumber = vi.fn();
  const activeCell = emptyGrid[0];
  render(
    <GridShortcuts
      activeCell={activeCell}
      activateNotesMode={vi.fn()}
      boardData={deriveBoardData(emptyGrid, activeCell)}
      clearNumber={vi.fn()}
      clipboardNotes={null}
      continueGame={vi.fn()}
      copyNotes={vi.fn()}
      deactivateNotesMode={vi.fn()}
      getHint={vi.fn()}
      notesMode={false}
      pauseGame={vi.fn()}
      redo={vi.fn()}
      selectCell={vi.fn()}
      setNotes={vi.fn()}
      setNumber={setNumber}
      showHints={false}
      sudoku={emptyGrid}
      undo={vi.fn()}
      {...overrides}
    />,
  );
  hotkeys.setScope(ShortcutScope.Game);
  return {setNumber};
}

function digitEvent(type: "keyDown" | "keyUp", digit: number) {
  fireEvent[type](document.body, {key: String(digit), code: `Digit${digit}`, keyCode: 48 + digit});
}

describe("GridShortcuts rapid input", () => {
  it("accepts ordinary sequential digits", () => {
    const {setNumber} = renderShortcuts();
    for (const digit of [1, 2, 3]) {
      digitEvent("keyDown", digit);
      digitEvent("keyUp", digit);
    }
    expect(setNumber.mock.calls.map(([, digit]) => digit)).toEqual([1, 2, 3]);
  });

  it("accepts every digit when the next key is pressed before the previous key is released", () => {
    const {setNumber} = renderShortcuts();

    digitEvent("keyDown", 1);
    digitEvent("keyDown", 2);
    digitEvent("keyUp", 1);
    digitEvent("keyUp", 2);
    digitEvent("keyDown", 3);
    digitEvent("keyUp", 3);

    expect(setNumber.mock.calls.map(([, digit]) => digit)).toEqual([1, 2, 3]);
  });

  it("keeps digit input out of paused games and focused form fields", () => {
    const {setNumber} = renderShortcuts();
    hotkeys.setScope(ShortcutScope.Menu);
    digitEvent("keyDown", 1);
    digitEvent("keyUp", 1);
    hotkeys.setScope(ShortcutScope.Game);
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, {key: "2", code: "Digit2", keyCode: 50});
    fireEvent.keyUp(input, {key: "2", code: "Digit2", keyCode: 50});
    input.remove();
    expect(setNumber).not.toHaveBeenCalled();
  });

  it.each(["ctrlKey", "metaKey", "altKey", "isComposing"])("ignores digits with %s", (flag) => {
    const {setNumber} = renderShortcuts();
    fireEvent.keyDown(document.body, {key: "1", code: "Digit1", keyCode: 49, [flag]: true});
    fireEvent.keyUp(document.body, {key: "1", code: "Digit1", keyCode: 49});
    expect(setNumber).not.toHaveBeenCalled();
  });

  it("supports shifted digit keys and the numeric keypad in notes mode", () => {
    const setNotes = vi.fn();
    const {setNumber} = renderShortcuts({notesMode: true, setNotes});
    fireEvent.keyDown(document.body, {key: "!", code: "Digit1", keyCode: 49, shiftKey: true});
    fireEvent.keyUp(document.body, {key: "!", code: "Digit1", keyCode: 49});
    fireEvent.keyDown(document.body, {key: "2", code: "Numpad2", keyCode: 98});
    fireEvent.keyUp(document.body, {key: "2", code: "Numpad2", keyCode: 98});
    expect(setNotes.mock.calls.map(([, notes]) => notes)).toEqual([[1], [2]]);
    expect(setNumber).not.toHaveBeenCalled();
  });

  it("does not enter digits for keypad navigation with Num Lock off", () => {
    const {setNumber} = renderShortcuts();
    fireEvent.keyDown(document.body, {key: "End", code: "Numpad1", keyCode: 35});
    fireEvent.keyUp(document.body, {key: "End", code: "Numpad1", keyCode: 35});
    expect(setNumber).not.toHaveBeenCalled();
  });
});
