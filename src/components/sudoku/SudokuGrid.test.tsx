import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import {load} from "cheerio";

import {GridCellNumber} from "./SudokuGrid";

function renderCellNumber({
  initial = false,
  highlight = false,
  conflict = false,
}: {
  initial?: boolean;
  highlight?: boolean;
  conflict?: boolean;
}) {
  return load(
    renderToStaticMarkup(
      <GridCellNumber initial={initial} highlight={highlight} conflict={conflict} left={50} top={50} testId="cell-value">
        5
      </GridCellNumber>,
    ),
  )('[data-testid="cell-value"]').attr("class");
}

describe("GridCellNumber", () => {
  it("uses pending amber text for editable entries", () => {
    const className = renderCellNumber({});

    expect(className).toContain("text-amber-600");
    expect(className).not.toContain("text-teal-600");
  });

  it("keeps pending amber text when an editable entry matches the active number", () => {
    const className = renderCellNumber({highlight: true});

    expect(className).toContain("text-amber-600");
    expect(className).not.toContain("text-teal-600");
  });

  it("uses red text for editable entries in conflict or wrong-entry states", () => {
    const className = renderCellNumber({conflict: true});

    expect(className).toContain("text-red-600");
    expect(className).not.toContain("text-amber-600");
    expect(className).not.toContain("text-teal-600");
  });

  it("uses neutral text for given entries", () => {
    const className = renderCellNumber({initial: true});

    expect(className).toContain("text-black");
    expect(className).toContain("dark:text-white");
    expect(className).not.toContain("text-amber-600");
    expect(className).not.toContain("text-teal-600");
  });
});
