import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import {load} from "cheerio";

import {GridCell, GridCellNumber} from "./SudokuGrid";

function renderGridCell({active = false, partnerActive = false}: {active?: boolean; partnerActive?: boolean}) {
  return load(
    renderToStaticMarkup(
      <GridCell
        active={active}
        ariaLabel="Editable cell row 1 column 1 empty"
        bounds={{left: 0, top: 0, width: 11.11, height: 11.11}}
        conflict={false}
        highlight={false}
        highlightNumber={false}
        initial={false}
        notesMode={false}
        number={0}
        partnerActive={partnerActive}
        testId="cell"
        onClick={() => {}}
        onRightClick={() => {}}
      />,
    ),
  );
}

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
      <GridCellNumber
        initial={initial}
        highlight={highlight}
        conflict={conflict}
        left={50}
        top={50}
        testId="cell-value"
      >
        5
      </GridCellNumber>,
    ),
  )('[data-testid="cell-value"]').attr("class");
}

describe("GridCell", () => {
  it("adds a no-fill dashed emerald partner outline", () => {
    const $ = renderGridCell({active: false, partnerActive: true});
    const cell = $('[data-testid="cell"]');
    const partner = $('[data-testid="cell-partner"]');
    expect(cell.attr("data-cell-partner-active")).toBe("true");
    expect(partner.attr("class")).toContain("border-dashed");
    expect(partner.attr("class")).toContain("border-emerald-500");
    expect(partner.attr("class")).not.toContain("bg-");
  });

  it("keeps the local solid border and insets the partner outline on the same cell", () => {
    const $ = renderGridCell({active: true, partnerActive: true});
    expect($('[data-testid="cell"]').attr("class")).toContain("border-teal-400");
    expect($('[data-testid="cell"]').attr("class")).not.toContain("border-dashed");
    expect($('[data-testid="cell-partner"]').attr("style")).toContain("scale(0.8)");
  });
});

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
