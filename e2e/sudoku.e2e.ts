import {expect, Page, test} from "@playwright/test";

const FIRST_PUZZLE = "534920700060007309900000010008700000496803002721594806000200940800046100003000000";
const SECOND_PUZZLE = "009043005867002003040060027002086050930420000058397040300270900001000002724059030";
const FIRST_SOLUTION = "534921768162487359987635214358762491496813572721594836615278943879346125243159687";
const ONE_EMPTY_CELL_PUZZLE = `${FIRST_SOLUTION.slice(0, -1)}0`;
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
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", {name: "Pause"})).toBeVisible();
});

test("uses fixed game preferences and dark mode", async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "sudoku-user-preferences",
      JSON.stringify({
        showHints: true,
        showWrongEntries: true,
        showConflicts: false,
        showCircleMenu: true,
        showOccurrences: false,
      }),
    );
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
  await expect(page.getByTestId("sudoku-number-occurrences-5")).toBeVisible();

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
  await expect(cell(page, 5, 0)).toHaveAttribute("data-cell-conflict", "true");

  await selectCell(page, 7, 0);
  await expect(page.getByTestId("sudoku-menu-circle")).toHaveCount(0);

  await expectStoredPreferences(page, {
    showHints: false,
    showWrongEntries: false,
    showConflicts: true,
    showCircleMenu: false,
    showOccurrences: true,
  });

  await page.reload();
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

test("solves a sudoku and starts the next game from the win screen", async ({page}) => {
  await openGame(page, ONE_EMPTY_CELL_PUZZLE);

  await selectCell(page, 8, 8);
  await page.getByRole("button", {name: "Set 7"}).click();

  await expect(page.getByText(/Congrats, you won/)).toBeVisible();
  await page.getByRole("button", {name: "Select next sudoku: Easy #2"}).click();

  await expect(page.getByTestId("current-game-label")).toHaveText("Easy #2");
  await expect(page.getByText(/Congrats, you won/)).toHaveCount(0);
  await expect(cellValue(page, 2, 0)).toHaveText("9");
  await expectGameSearch(page, SECOND_PUZZLE, 2, "easy");
});

test("clears the current game only after confirmation", async ({page}) => {
  await openGame(page);

  await selectCell(page, 5, 0);
  await page.getByRole("button", {name: "Set 1"}).click();
  await expect(cellValue(page, 5, 0)).toHaveText("1");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Are you sure you want to restart this game? Your progress will be lost.");
    await dialog.dismiss();
  });
  await page.getByRole("button", {name: "Clear"}).click();
  await expect(page.getByRole("button", {name: "Pause"})).toBeVisible();
  await expect(cellValue(page, 5, 0)).toHaveText("1");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Are you sure you want to restart this game? Your progress will be lost.");
    await dialog.accept();
  });
  await page.getByRole("button", {name: "Clear"}).click();
  await expect(page.getByRole("button", {name: "Pause"})).toBeVisible();
  await expect(cellValue(page, 5, 0)).toHaveText("");
  await expectGameSearch(page, FIRST_PUZZLE, 1, "easy");
});

test("changes games through the selection screen", async ({page}) => {
  await openGame(page);

  await page.getByRole("button", {name: "New game"}).click();
  await expect(page.getByRole("heading", {name: "Select Game"})).toBeVisible();
  await expect(page.getByRole("button", {name: "+ New Collection"})).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Add sudoku +"})).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Delete Collection"})).toHaveCount(0);
  await expect(page.getByText("Create new sudoku")).toHaveCount(0);

  await page.getByRole("button", {name: "Medium"}).click();
  await page.getByTestId("sudoku-preview-1").click();

  await expect(page.getByTestId("current-game-label")).toHaveText("Medium #1");
  await expect(page).toHaveURL(/sudokuCollectionName=medium/);
});
