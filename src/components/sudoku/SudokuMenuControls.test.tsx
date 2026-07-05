import React from "react";
import {renderToString} from "react-dom/server";
import {load} from "cheerio";
import {describe, expect, it, vi} from "vitest";

import SudokuMenuControls from "./SudokuMenuControls";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const noop = () => undefined;

function renderControls({
  notesMode = false,
  showConflicts = true,
  showOccurrences = false,
  showMatchingNumbers = true,
}: {
  notesMode?: boolean;
  showConflicts?: boolean;
  showOccurrences?: boolean;
  showMatchingNumbers?: boolean;
}) {
  return renderToString(
    <SudokuMenuControls
      notesMode={notesMode}
      activeCellCoordinates={{x: 0, y: 0}}
      showConflicts={showConflicts}
      showOccurrences={showOccurrences}
      showMatchingNumbers={showMatchingNumbers}
      clearCell={noop}
      activateNotesMode={noop}
      deactivateNotesMode={noop}
      toggleShowConflicts={noop}
      toggleShowOccurrences={noop}
      toggleShowMatchingNumbers={noop}
      getHint={noop}
      canUndo
      undo={noop}
    />,
  );
}

function renderedButton(html: string, label: string) {
  const $ = load(html);
  const button = $("button")
    .filter((_, element) => $(element).text().includes(label))
    .first();

  expect(button.length).toBe(1);
  return button;
}

describe("SudokuMenuControls", () => {
  it("renders visible preference toggles with pressed state", () => {
    const html = renderControls({showConflicts: true, showOccurrences: false, showMatchingNumbers: true});

    expect(html).toContain('data-testid="sudoku-control-undo"');
    expect(html).toContain('data-testid="sudoku-control-erase"');
    expect(html).toContain('data-testid="sudoku-control-notes"');
    expect(html).toContain('data-testid="sudoku-control-hint"');
    expect(html).toContain('data-testid="sudoku-toggle-conflicts"');
    expect(html).toContain('data-testid="sudoku-toggle-occurrences"');
    expect(html).toContain('data-testid="sudoku-toggle-matching-numbers"');
    expect(html).toContain("conflicts_btn");
    expect(html).toContain("counts_btn");
    expect(html).toContain("matching_btn");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
  });

  it("keeps toggle state colours in status pills", () => {
    const html = renderControls({
      notesMode: true,
      showConflicts: true,
      showOccurrences: false,
      showMatchingNumbers: true,
    });

    const notes = renderedButton(html, "note_btn");
    const clash = renderedButton(html, "conflicts_btn");
    const count = renderedButton(html, "counts_btn");
    const match = renderedButton(html, "matching_btn");

    expect(notes.attr("class")).not.toContain("bg-sky");
    expect(clash.attr("class")).not.toContain("bg-sky");
    expect(count.attr("class")).not.toContain("bg-sky");
    expect(match.attr("class")).not.toContain("bg-sky");

    expect(notes.find("div").last().attr("class")).toContain("bg-teal-700");
    expect(clash.find("div").last().attr("class")).toContain("bg-teal-700");
    expect(count.find("div").last().attr("class")).toContain("bg-gray-700");
    expect(match.find("div").last().attr("class")).toContain("bg-teal-700");
  });
});
