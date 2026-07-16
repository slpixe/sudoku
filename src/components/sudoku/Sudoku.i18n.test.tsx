// @vitest-environment jsdom
import * as React from "react";
import {cleanup, render, screen} from "@testing-library/react";
import {createInstance} from "i18next";
import {I18nextProvider} from "react-i18next";
import {afterEach, expect, it, vi} from "vitest";

import {emptyGrid} from "src/context/SudokuContext";
import {deriveBoardData} from "src/lib/game/deriveBoardData";
import en from "src/locales/en.json";
import es from "src/locales/es.json";

import {Sudoku} from "./Sudoku";

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

const cells = emptyGrid.map((cell, index) => ({
  ...cell,
  solution: (index % 9) + 1,
}));

async function renderPartnerCell(language: "en" | "es", translation: typeof en | typeof es) {
  const i18n = createInstance();
  await i18n.init({
    fallbackLng: false,
    lng: language,
    resources: {[language]: {translation}},
    interpolation: {escapeValue: false},
  });

  render(
    <I18nextProvider i18n={i18n}>
      <Sudoku
        boardData={deriveBoardData(cells)}
        clearNumber={vi.fn()}
        hideMenu={vi.fn()}
        notesMode={false}
        partnerCellCoordinates={{x: 1, y: 0}}
        selectCell={vi.fn()}
        setNotes={vi.fn()}
        setNumber={vi.fn()}
        shouldShowMenu={false}
        showConflicts={false}
        showHints={false}
        showMatchingNumbers={false}
        showMenu={vi.fn()}
        showWrongEntries={false}
        sudoku={cells}
      >
        {null}
      </Sudoku>
    </I18nextProvider>,
  );
}

it.each([
  {language: "en" as const, locale: en, phrase: "other player selected"},
  {language: "es" as const, locale: es, phrase: "seleccionada por el otro jugador"},
])("localizes the partner-selected cell label in $language", async ({language, locale, phrase}) => {
  await renderPartnerCell(language, locale);

  expect(screen.getByLabelText(new RegExp(`, ${phrase}$`))).toBe(screen.getByTestId("sudoku-cell-1-0"));
});
