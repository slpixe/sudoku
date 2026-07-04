import {expect, type Locator, type Page, test} from "@playwright/test";

const FIRST_PUZZLE = "534920700060007309900000010008700000496803002721594806000200940800046100003000000";
const SECOND_PUZZLE = "009043005867002003040060027002086050930420000058397040300270900001000002724059030";
const MEDIUM_FIRST_PUZZLE = "502000000003400000000005093700006002000003608008021070870032504106080020400070300";
const SHORTCUT_MODIFIER = "Control";

function gameUrl(sudoku = FIRST_PUZZLE, sudokuIndex = 1, sudokuCollectionName = "easy") {
  const params = new URLSearchParams({
    sudokuIndex: String(sudokuIndex),
    sudoku,
    sudokuCollectionName,
  });

  return `/#/?${params.toString()}`;
}

function cell(page: Page, x: number, y: number) {
  return page.getByTestId(`sudoku-cell-${x}-${y}`);
}

function cellValue(page: Page, x: number, y: number) {
  return page.getByTestId(`sudoku-cell-value-${x}-${y}`);
}

function cellNotes(page: Page, x: number, y: number) {
  return page.getByTestId(`sudoku-cell-notes-${x}-${y}`);
}

async function openGame(page: Page, sudoku = FIRST_PUZZLE, sudokuIndex = 1, collection = "easy", label = "Easy") {
  await page.goto(gameUrl(sudoku, sudokuIndex, collection));
  await expect(page.getByTestId("current-game-label")).toHaveText(`${label} #${sudokuIndex}`);
  await expect(page.getByTestId("sudoku-board")).toBeVisible();
  await continueIfPaused(page);
  await expect(cellValue(page, 5, 0)).toHaveText(sudoku[5] === "0" ? "" : sudoku[5]);
}

async function expectGameSearch(page: Page, sudoku: string, sudokuIndex: number, sudokuCollectionName: string) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const search = window.location.hash.includes("?")
          ? window.location.hash.split("?")[1]
          : window.location.search.replace(/^\?/, "");
        const params = new URLSearchParams(search);

        return {
          sudoku: params.get("sudoku"),
          sudokuIndex: params.get("sudokuIndex"),
          sudokuCollectionName: params.get("sudokuCollectionName"),
        };
      }),
    )
    .toEqual({
      sudoku,
      sudokuIndex: String(sudokuIndex),
      sudokuCollectionName,
    });
}

async function continueIfPaused(page: Page) {
  const continueButton = page.getByRole("button", {name: "Continue"});
  if (await continueButton.isVisible()) {
    await continueButton.click();
  }
  await expect(page.getByRole("button", {name: "Pause"})).toBeVisible();
}

async function selectCell(page: Page, x: number, y: number) {
  await cell(page, x, y).click();
  await expect(cell(page, x, y)).toHaveAttribute("data-cell-active", "true");
}

async function expectStoredPreferences(page: Page, preferences: Record<string, boolean>) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const rawPreferences = localStorage.getItem("sudoku-user-preferences");
        return rawPreferences ? JSON.parse(rawPreferences) : null;
      }),
    )
    .toMatchObject(preferences);
}

async function expectNoVerticalDocumentScroll(page: Page, name: string) {
  const overflow = await page.evaluate(() => {
    return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - document.documentElement.clientHeight;
  });

  expect(overflow, `${name} vertical overflow`).toBeLessThanOrEqual(1);
}

async function expectWithinViewport(page: Page, locator: Locator, name: string) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  if (!box || !viewport) {
    throw new Error(`${name} must have a visible box and viewport`);
  }

  expect(box.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${name} top edge`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${name} right edge`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height, `${name} bottom edge`).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectInsideElement(inner: Locator, outer: Locator, name: string) {
  const innerBox = await inner.boundingBox();
  const outerBox = await outer.boundingBox();

  if (!innerBox || !outerBox) {
    throw new Error(`${name} must have visible boxes`);
  }

  expect(innerBox.x, `${name} left edge`).toBeGreaterThanOrEqual(outerBox.x - 1);
  expect(innerBox.y, `${name} top edge`).toBeGreaterThanOrEqual(outerBox.y - 1);
  expect(innerBox.x + innerBox.width, `${name} right edge`).toBeLessThanOrEqual(outerBox.x + outerBox.width + 1);
  expect(innerBox.y + innerBox.height, `${name} bottom edge`).toBeLessThanOrEqual(outerBox.y + outerBox.height + 1);
}

async function expectLeftToRight(locators: Locator[], name: string) {
  const boxes = await Promise.all(locators.map((locator) => locator.boundingBox()));

  if (boxes.some((box) => !box)) {
    throw new Error(`${name} must have visible boxes`);
  }

  for (let i = 1; i < boxes.length; i += 1) {
    const previous = boxes[i - 1];
    const current = boxes[i];

    if (!previous || !current) {
      throw new Error(`${name} must have visible boxes`);
    }

    expect(current.x, `${name} order`).toBeGreaterThan(previous.x + previous.width - 1);
  }
}

async function expectSameRow(locators: Locator[], name: string) {
  const boxes = await Promise.all(locators.map((locator) => locator.boundingBox()));

  if (boxes.some((box) => !box)) {
    throw new Error(`${name} must have visible boxes`);
  }

  const first = boxes[0];
  if (!first) {
    throw new Error(`${name} must have visible boxes`);
  }

  for (const box of boxes.slice(1)) {
    if (!box) {
      throw new Error(`${name} must have visible boxes`);
    }

    expect(Math.abs(box.y - first.y), `${name} row alignment`).toBeLessThanOrEqual(1);
  }
}

async function expectCompactHeader(page: Page, name: string) {
  const headerBox = await page.locator("header").boundingBox();

  if (!headerBox) {
    throw new Error(`${name} header must have a visible box`);
  }

  const maxHeaderHeight = name.includes("landscape") ? 64 : 56;
  expect(headerBox.height, `${name} header height`).toBeLessThanOrEqual(maxHeaderHeight);
}

async function expectOccurrenceBadgeWithinButton(page: Page, number: number, name: string) {
  const buttonBox = await page.getByTestId(`sudoku-number-${number}`).boundingBox();
  const badge = page.getByTestId(`sudoku-number-occurrences-${number}`);
  const badgeBox = await badge.boundingBox();

  if (!buttonBox || !badgeBox) {
    throw new Error(`${name} occurrence badge must have visible button and badge boxes`);
  }

  await expect(badge).toHaveText(/\d+/);
  const rightInset = buttonBox.x + buttonBox.width - (badgeBox.x + badgeBox.width);
  const bottomInset = buttonBox.y + buttonBox.height - (badgeBox.y + badgeBox.height);

  expect(rightInset, `${name} occurrence badge right edge`).toBeGreaterThanOrEqual(0);
  expect(bottomInset, `${name} occurrence badge bottom edge`).toBeGreaterThanOrEqual(0);
  expect(badgeBox.width, `${name} occurrence badge width`).toBeGreaterThanOrEqual(16);
  expect(badgeBox.height, `${name} occurrence badge height`).toBeGreaterThanOrEqual(16);
}

async function expectNumberPadLabelLayout(page: Page, number: number, compact: boolean, name: string) {
  const button = page.getByTestId(`sudoku-number-${number}`);
  const label = page.getByTestId(`sudoku-number-label-${number}`);
  const badge = page.getByTestId(`sudoku-number-occurrences-${number}`);
  const buttonBox = await button.boundingBox();
  const labelBox = await label.boundingBox();
  const badgeBox = await badge.boundingBox();

  if (!buttonBox || !labelBox || !badgeBox) {
    throw new Error(`${name} number pad label must have visible button, label, and badge boxes`);
  }

  const fontSize = await label.evaluate((element) => Number.parseFloat(window.getComputedStyle(element).fontSize));
  const buttonCenterX = buttonBox.x + buttonBox.width / 2;
  const buttonCenterY = buttonBox.y + buttonBox.height / 2;
  const labelCenterX = labelBox.x + labelBox.width / 2;
  const labelCenterY = labelBox.y + labelBox.height / 2;

  if (compact) {
    expect(fontSize, `${name} compact number label font size`).toBeGreaterThanOrEqual(20);
    expect(labelCenterX, `${name} compact number label x position`).toBeLessThan(buttonCenterX);
    expect(labelCenterY, `${name} compact number label y position`).toBeLessThan(buttonCenterY);
    expect(labelBox.x + labelBox.width, `${name} compact label clears occurrence badge horizontally`).toBeLessThanOrEqual(
      badgeBox.x + 1,
    );
  } else {
    expect(Math.abs(labelCenterX - buttonCenterX), `${name} number label centered horizontally`).toBeLessThanOrEqual(6);
    expect(Math.abs(labelCenterY - buttonCenterY), `${name} number label centered vertically`).toBeLessThanOrEqual(6);
  }
}

async function seedFinishedSudoku(page: Page, sudoku: string, sudokuIndex: number, collection: string) {
  await page.addInitScript(
    ({collection, sudoku, sudokuIndex}) => {
      const cells = sudoku.split("").map((value, index) => ({
        x: index % 9,
        y: Math.floor(index / 9),
        number: Number(value),
        initial: value !== "0",
        notes: [],
        solution: Number(value),
      }));

      localStorage.setItem(
        `sudoku-played-${sudoku}`,
        JSON.stringify({
          game: {
            activeCellCoordinates: undefined,
            sudokuCollectionName: collection,
            notesMode: false,
            showNotes: false,
            showMenu: false,
            state: "PAUSED",
            sudokuIndex: sudokuIndex - 1,
            won: true,
            timesSolved: 1,
            previousTimes: [123],
            secondsPlayed: 123,
            clipboardNotes: null,
          },
          sudoku: cells,
        }),
      );
    },
    {collection, sudoku, sudokuIndex},
  );
}

test("supports number entry, erase, undo, redo, notes, hints, and keyboard shortcuts", async ({page}) => {
  await openGame(page);

  await selectCell(page, 5, 0);
  await page.getByRole("button", {name: "Set 1"}).click();
  await expect(cellValue(page, 5, 0)).toHaveText("1");

  await page.getByRole("button", {name: "Erase"}).click();
  await expect(cellValue(page, 5, 0)).toHaveText("");

  await page.getByRole("button", {name: "Set 2"}).click();
  await expect(cellValue(page, 5, 0)).toHaveText("2");

  await page.getByRole("button", {name: "Undo"}).click();
  await expect(cellValue(page, 5, 0)).toHaveText("");

  await page.keyboard.press(`${SHORTCUT_MODIFIER}+Y`);
  await expect(cellValue(page, 5, 0)).toHaveText("2");

  await page.keyboard.press("Backspace");
  await expect(cellValue(page, 5, 0)).toHaveText("");

  await page.keyboard.press("ArrowRight");
  await expect(cell(page, 6, 0)).toHaveAttribute("data-cell-active", "true");
  await page.keyboard.press("ArrowRight");
  await expect(cell(page, 7, 0)).toHaveAttribute("data-cell-active", "true");
  await page.keyboard.press("6");
  await expect(cellValue(page, 7, 0)).toHaveText("6");

  await selectCell(page, 8, 0);
  await page.keyboard.press("h");
  await expect(cellValue(page, 8, 0)).toHaveText("8");

  await selectCell(page, 5, 0);
  await page.keyboard.press("n");
  await expect(cell(page, 5, 0)).toHaveAttribute("data-cell-notes-mode", "true");
  await page.keyboard.press("3");
  await page.keyboard.press("4");
  await expect(cellNotes(page, 5, 0)).toContainText("3");
  await expect(cellNotes(page, 5, 0)).toContainText("4");

  await page.keyboard.press(`${SHORTCUT_MODIFIER}+C`);
  await selectCell(page, 0, 1);
  await page.keyboard.press(`${SHORTCUT_MODIFIER}+V`);
  await expect(cellNotes(page, 0, 1)).toContainText("3");
  await expect(cellNotes(page, 0, 1)).toContainText("4");

  await page.keyboard.press("n");
  await page.keyboard.press("5");
  await expect(cellValue(page, 0, 1)).toHaveText("5");
  await expect(cellNotes(page, 0, 1)).toHaveText("");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", {name: "Continue"})).toBeVisible();
  await expect(page.getByRole("button", {name: "Set 1"})).toBeDisabled();
  await expect(page.getByRole("button", {name: "Undo"})).toBeDisabled();
  await expect(page.getByRole("button", {name: "Erase"})).toBeDisabled();
  await expect(page.getByRole("button", {name: /Notes (ON|OFF)/})).toBeDisabled();
  await expect(page.getByRole("button", {name: /Hint\s+Active cell/})).toBeDisabled();
  await expect(page.getByRole("button", {name: /Clash\s+(ON|OFF)/})).toBeDisabled();
  await expect(page.getByRole("button", {name: /Count\s+(ON|OFF)/})).toBeDisabled();
  await expect(page.getByRole("button", {name: "Resume game"})).toBeVisible();
  await page.getByRole("button", {name: "Resume game"}).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", {name: "Pause"})).toBeVisible();
});

test("keeps the game layout visible in constrained viewports", async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "sudoku-user-preferences",
      JSON.stringify({
        showHints: false,
        showWrongEntries: false,
        showConflicts: true,
        showCircleMenu: false,
        showOccurrences: true,
        showMatchingNumbers: true,
      }),
    );
  });

  const viewports = [
    {name: "phone portrait", width: 390, height: 667},
    {name: "phone landscape", width: 667, height: 390},
    {name: "wide phone landscape", width: 844, height: 390},
    {name: "tablet constrained", width: 768, height: 700},
    {name: "desktop", width: 1280, height: 800},
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    await openGame(page);

    await expect(page.getByText("Sudoku", {exact: true})).toHaveCount(0);
    await expectCompactHeader(page, viewport.name);
    await expectNoVerticalDocumentScroll(page, viewport.name);
    await expectWithinViewport(page, page.getByRole("button", {name: "Toggle dark mode"}), `${viewport.name} theme toggle`);
    await expectWithinViewport(page, page.getByRole("button", {name: "Clear"}), `${viewport.name} clear button`);
    await expectWithinViewport(page, page.getByRole("button", {name: "Pause"}), `${viewport.name} pause button`);
    await expectWithinViewport(page, page.getByRole("button", {name: "New game"}), `${viewport.name} new game button`);
    await expectWithinViewport(page, page.getByTestId("sudoku-board"), `${viewport.name} board`);
    await expectInsideElement(cellValue(page, 0, 0), cell(page, 0, 0), `${viewport.name} board digit`);
    await expectWithinViewport(page, page.getByRole("button", {name: "Set 5"}), `${viewport.name} number button`);
    await expectOccurrenceBadgeWithinButton(page, 5, viewport.name);
    await expectWithinViewport(page, page.getByRole("button", {name: "Undo"}), `${viewport.name} undo button`);
    await expectWithinViewport(
      page,
      page.getByTestId("sudoku-toggle-occurrences"),
      `${viewport.name} count toggle`,
    );
    await expectWithinViewport(
      page,
      page.getByTestId("sudoku-toggle-matching-numbers"),
      `${viewport.name} matching toggle`,
    );

    if (viewport.name.includes("landscape")) {
      await expectLeftToRight(
        [
          page.getByRole("button", {name: "Toggle dark mode"}),
          page.getByRole("button", {name: "Undo"}),
          page.getByRole("button", {name: "Clear"}),
        ],
        `${viewport.name} header actions`,
      );
    }

    if (viewport.name === "wide phone landscape") {
      await expectSameRow(
        [
          page.getByRole("button", {name: "Erase"}),
          page.getByRole("button", {name: /Notes\s+(ON|OFF)/}),
          page.getByRole("button", {name: /Hint\s+Active cell/}),
          page.getByTestId("sudoku-toggle-conflicts"),
          page.getByTestId("sudoku-toggle-occurrences"),
          page.getByTestId("sudoku-toggle-matching-numbers"),
        ],
        `${viewport.name} lower controls`,
      );
    }

    if (viewport.name === "phone landscape") {
      await selectCell(page, 5, 0);
      await page.getByRole("button", {name: /Notes\s+OFF/}).click();
      await page.getByRole("button", {name: "Set 3"}).click();
      await page.getByRole("button", {name: "Set 4"}).click();
      await expectInsideElement(
        cellNotes(page, 5, 0).getByText("3", {exact: true}),
        cell(page, 5, 0),
        `${viewport.name} note digit`,
      );
    }
  }
});

const numberPadLayoutViewports = [
  {name: "mobile portrait", width: 360, height: 640, compact: true},
  {name: "mobile landscape", width: 640, height: 360, compact: false},
  {name: "tablet portrait", width: 768, height: 1024, compact: false},
  {name: "tablet landscape", width: 1024, height: 768, compact: false},
  {name: "desktop portrait", width: 900, height: 1200, compact: false},
  {name: "desktop landscape", width: 1280, height: 800, compact: false},
];

for (const viewport of numberPadLayoutViewports) {
  test(`keeps number pad labels readable in ${viewport.name}`, async ({page}, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "sudoku-user-preferences",
        JSON.stringify({
          showHints: false,
          showWrongEntries: false,
          showConflicts: true,
          showCircleMenu: false,
          showOccurrences: true,
          showMatchingNumbers: true,
        }),
      );
    });

    await page.setViewportSize({width: viewport.width, height: viewport.height});
    await openGame(page);
    await expectOccurrenceBadgeWithinButton(page, 5, viewport.name);

    await testInfo.attach(`number-pad-${viewport.name.replaceAll(" ", "-")}`, {
      body: await page.screenshot({fullPage: true}),
      contentType: "image/png",
    });

    await expectNumberPadLabelLayout(page, 5, viewport.compact, viewport.name);
  });
}

test("uses visible game preference toggles and dark mode", async ({page}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded-user-preferences")) {
      return;
    }

    localStorage.setItem(
      "sudoku-user-preferences",
      JSON.stringify({
        showHints: true,
        showWrongEntries: true,
        showConflicts: false,
        showCircleMenu: true,
        showOccurrences: false,
        showMatchingNumbers: true,
      }),
    );
    sessionStorage.setItem("seeded-user-preferences", "true");
  });

  await openGame(page);

  await expect(page.getByRole("heading", {name: "Shortcuts"})).toHaveCount(0);
  await expect(page.getByRole("heading", {name: "Settings"})).toHaveCount(0);
  await expect(page.getByRole("heading", {name: "About"})).toHaveCount(0);
  await expect(page.locator("#generated_notes")).toHaveCount(0);
  await expect(page.locator("#highlight_wrong_entries")).toHaveCount(0);
  await expect(page.locator("#highlight_conflicts")).toHaveCount(0);
  await expect(page.locator("#circle_menu")).toHaveCount(0);
  await expect(page.locator("#show_occurrences")).toHaveCount(0);
  await expect(page.getByTestId("share-sudoku")).toHaveCount(0);

  await expect(cellNotes(page, 5, 0)).toHaveText("");
  await expect(page.getByTestId("sudoku-toggle-conflicts")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("sudoku-toggle-occurrences")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("sudoku-toggle-matching-numbers")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sudoku-number-occurrences-5")).toHaveCount(0);

  const boardBox = await page.getByTestId("sudoku-board").boundingBox();
  const keypadBox = await page.getByTestId("sudoku-number-5").boundingBox();
  if (!boardBox || !keypadBox) {
    throw new Error("Sudoku board and keypad must be visible");
  }
  expect(keypadBox.y).toBeGreaterThan(boardBox.y + boardBox.height - 1);
  expect(Math.abs(keypadBox.width - keypadBox.height)).toBeLessThanOrEqual(1);

  const undoBox = await page.getByRole("button", {name: "Undo"}).boundingBox();
  if (!undoBox) {
    throw new Error("Undo button must be visible");
  }
  expect(undoBox.y).toBeGreaterThan(keypadBox.y + keypadBox.height - 1);

  await selectCell(page, 5, 0);
  await page.getByRole("button", {name: "Set 2"}).click();
  await expect(cell(page, 5, 0)).toHaveAttribute("data-cell-conflict", "false");
  await expect(cell(page, 4, 0)).toHaveAttribute("data-cell-matching-number", "true");

  await page.getByRole("button", {name: /Match\s+ON/}).click();
  await expect(page.getByTestId("sudoku-toggle-matching-numbers")).toHaveAttribute("aria-pressed", "false");
  await expect(cell(page, 4, 0)).toHaveAttribute("data-cell-matching-number", "false");

  await page.getByRole("button", {name: /Match\s+OFF/}).click();
  await expect(page.getByTestId("sudoku-toggle-matching-numbers")).toHaveAttribute("aria-pressed", "true");
  await expect(cell(page, 4, 0)).toHaveAttribute("data-cell-matching-number", "true");

  await page.getByRole("button", {name: /Clash\s+OFF/}).click();
  await expect(cell(page, 5, 0)).toHaveAttribute("data-cell-conflict", "true");
  await expect(page.getByTestId("sudoku-toggle-conflicts")).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", {name: /Count\s+OFF/}).click();
  await expect(page.getByTestId("sudoku-number-occurrences-5")).toBeVisible();
  await expect(page.getByTestId("sudoku-toggle-occurrences")).toHaveAttribute("aria-pressed", "true");

  await selectCell(page, 7, 0);
  await expect(page.getByTestId("sudoku-menu-circle")).toHaveCount(0);

  await expectStoredPreferences(page, {
    showHints: false,
    showWrongEntries: false,
    showConflicts: true,
    showCircleMenu: false,
    showOccurrences: true,
    showMatchingNumbers: true,
  });

  await page.reload();
  await expect(page.getByTestId("sudoku-toggle-conflicts")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sudoku-toggle-occurrences")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sudoku-toggle-matching-numbers")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sudoku-number-occurrences-5")).toBeVisible();
  await expect(page.getByTestId("sudoku-menu-circle")).toHaveCount(0);

  await page.getByRole("button", {name: "Toggle dark mode"}).click();
  await expect(page.locator("body")).toHaveClass(/dark/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("sudoku-dark-mode"))).toBe("true");
  await expect(page.getByLabel("Select language")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", {name: "New game"})).toBeVisible();
});

test("uses browser language automatically", async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "language", {value: "es-ES", configurable: true});
    Object.defineProperty(navigator, "languages", {value: ["es-ES", "es", "en-US"], configurable: true});
  });

  await page.goto(gameUrl());

  await expect(page.getByTestId("current-game-label")).toHaveText("Fácil #1");
  await expect(page.getByRole("button", {name: "Nuevo juego"})).toBeVisible();
  await expect(page.getByLabel("Select language")).toHaveCount(0);
});

test("clears the current game only after confirmation", async ({page}) => {
  await openGame(page);

  await selectCell(page, 5, 0);
  await page.getByRole("button", {name: "Set 1"}).click();
  await expect(cellValue(page, 5, 0)).toHaveText("1");

  await page.getByRole("button", {name: "Clear"}).click();
  const clearDialog = page.getByRole("dialog");
  await expect(clearDialog).toContainText("Are you sure you want to restart this game? Your progress will be lost.");
  await clearDialog.getByRole("button", {name: "Cancel"}).click();
  await expect(clearDialog).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Pause"})).toBeVisible();
  await expect(cellValue(page, 5, 0)).toHaveText("1");

  await page.getByRole("button", {name: "Clear"}).click();
  await expect(clearDialog).toContainText("Are you sure you want to restart this game? Your progress will be lost.");
  await clearDialog.getByRole("button", {name: "OK"}).click();
  await expect(clearDialog).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Pause"})).toBeVisible();
  await expect(cellValue(page, 5, 0)).toHaveText("");
  await expectGameSearch(page, FIRST_PUZZLE, 1, "easy");
});

test("changes games through the selection screen", async ({page}) => {
  await seedFinishedSudoku(page, MEDIUM_FIRST_PUZZLE, 1, "medium");
  await openGame(page);

  await page.getByRole("button", {name: "New game"}).click();
  await expect(page.getByRole("heading", {name: "Select Game"})).toBeVisible();
  await expect(page.getByRole("button", {name: "+ New Collection"})).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Add sudoku +"})).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Delete Collection"})).toHaveCount(0);
  await expect(page.getByText("Create new sudoku")).toHaveCount(0);

  await page.getByRole("button", {name: "Medium"}).click();
  const mediumPreview = page.getByRole("button", {name: "Select sudoku 1", exact: true});
  await mediumPreview.focus();
  await expect(mediumPreview).toBeFocused();
  await page.keyboard.press("Enter");

  const restartDialog = page.getByRole("dialog");
  await expect(restartDialog).toContainText("This will restart the sudoku and reset the timer");
  await restartDialog.getByRole("button", {name: "Cancel"}).click();
  await expect(restartDialog).toHaveCount(0);
  await expect(page.getByRole("heading", {name: "Select Game"})).toBeVisible();

  await mediumPreview.focus();
  await page.keyboard.press("Enter");
  await expect(restartDialog).toContainText("This will restart the sudoku and reset the timer");
  await restartDialog.getByRole("button", {name: "OK"}).click();

  await expect(page.getByTestId("current-game-label")).toHaveText("Medium #1");
  await expect(page).toHaveURL(/sudokuCollectionName=medium/);
});
