import React from "react";
import {renderToString} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import SudokuMenuControls from "./SudokuMenuControls";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const noop = () => undefined;

function renderControls({showConflicts = true, showOccurrences = false}: {showConflicts?: boolean; showOccurrences?: boolean}) {
  return renderToString(
    <SudokuMenuControls
      notesMode={false}
      activeCellCoordinates={{x: 0, y: 0}}
      showConflicts={showConflicts}
      showOccurrences={showOccurrences}
      clearCell={noop}
      activateNotesMode={noop}
      deactivateNotesMode={noop}
      toggleShowConflicts={noop}
      toggleShowOccurrences={noop}
      getHint={noop}
      canUndo
      undo={noop}
    />,
  );
}

describe("SudokuMenuControls", () => {
  it("renders conflict and count toggles with pressed state", () => {
    const html = renderControls({showConflicts: true, showOccurrences: false});

    expect(html).toContain('data-testid="sudoku-toggle-conflicts"');
    expect(html).toContain('data-testid="sudoku-toggle-occurrences"');
    expect(html).toContain("conflicts_btn");
    expect(html).toContain("counts_btn");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
  });
});
