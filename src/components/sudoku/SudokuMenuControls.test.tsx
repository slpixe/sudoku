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

function renderControls({
  showConflicts = true,
  showOccurrences = false,
  showMatchingNumbers = true,
}: {
  showConflicts?: boolean;
  showOccurrences?: boolean;
  showMatchingNumbers?: boolean;
}) {
  return renderToString(
    <SudokuMenuControls
      notesMode={false}
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

describe("SudokuMenuControls", () => {
  it("renders visible preference toggles with pressed state", () => {
    const html = renderControls({showConflicts: true, showOccurrences: false, showMatchingNumbers: true});

    expect(html).toContain('data-testid="sudoku-toggle-conflicts"');
    expect(html).toContain('data-testid="sudoku-toggle-occurrences"');
    expect(html).toContain('data-testid="sudoku-toggle-matching-numbers"');
    expect(html).toContain("conflicts_btn");
    expect(html).toContain("counts_btn");
    expect(html).toContain("matching_btn");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
  });
});
