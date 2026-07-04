import {expect, type Locator, type Page, test} from "@playwright/test";

const FIRST_PUZZLE = "534920700060007309900000010008700000496803002721594806000200940800046100003000000";
const SECOND_PUZZLE = "009043005867002003040060027002086050930420000058397040300270900001000002724059030";
const FIRST_SOLUTION = "534921768162487359987635214358762491496813572721594836615278943879346125243159687";
const ONE_EMPTY_CELL_PUZZLE = `${FIRST_SOLUTION.slice(0, -1)}0`;

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

async function openGame(page: Page, sudoku = FIRST_PUZZLE, sudokuIndex = 1, collection = "easy", label = "Easy") {
  await page.goto(gameUrl(sudoku, sudokuIndex, collection));
  await expect(page.getByTestId("current-game-label")).toHaveText(`${label} #${sudokuIndex}`);
  await expect(page.getByTestId("sudoku-board")).toBeVisible();
  await continueIfPaused(page);
  await expect(cellValue(page, 5, 0)).toHaveText(sudoku[5] === "0" ? "" : sudoku[5]);
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

async function expectWithinViewport(page: Page, locator: Locator, name: string) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  if (!box || !viewport) {
    throw new Error(`${name} must have a visible box`);
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

async function expectTopToBottom(locators: Locator[], name: string) {
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

    expect(current.y, `${name} order`).toBeGreaterThan(previous.y + previous.height - 1);
  }
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

async function expectSingleLine(locator: Locator, name: string) {
  const box = await locator.boundingBox();
  const lineHeight = await locator.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight));

  if (!box) {
    throw new Error(`${name} must have a visible box`);
  }

  expect(box.height, `${name} line count`).toBeLessThanOrEqual(lineHeight + 1);
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

test("solves a sudoku and starts the next game from the completion panel", async ({page}) => {
  await openGame(page, ONE_EMPTY_CELL_PUZZLE);

  await selectCell(page, 8, 8);
  await page.getByRole("button", {name: "Set 7"}).click();

  const completionPanel = page.getByTestId("sudoku-completion-panel");
  await expect(completionPanel).toBeVisible();
  await expect(completionPanel.getByRole("heading", {name: "Solved"})).toBeVisible();
  await expect(page.getByText(/Congrats, you won/)).toHaveCount(0);
  await expect(page.getByTestId("sudoku-board")).toBeVisible();
  await expect(cellValue(page, 8, 8)).toHaveText("7");
  await expect(page.getByRole("button", {name: "Set 7"})).toHaveCount(0);
  await expect(page.getByTestId("sudoku-toggle-occurrences")).toHaveCount(0);
  await expect(page.getByTestId("sudoku-completion-next")).toBeFocused();

  await page.getByTestId("sudoku-completion-next").click();

  await expect(page.getByTestId("current-game-label")).toHaveText("Easy #2");
  await expect(page.getByTestId("sudoku-completion-panel")).toHaveCount(0);
  await expect(cellValue(page, 2, 0)).toHaveText("9");
  await expectGameSearch(page, SECOND_PUZZLE, 2, "easy");
});

test("opens game selection from the completion panel", async ({page}) => {
  await openGame(page, ONE_EMPTY_CELL_PUZZLE);

  await selectCell(page, 8, 8);
  await page.getByRole("button", {name: "Set 7"}).click();

  await expect(page.getByTestId("sudoku-completion-panel")).toBeVisible();
  await page.getByTestId("sudoku-completion-new-game").click();

  await expect(page.getByRole("heading", {name: "Select Game"})).toBeVisible();
  await expect(page.getByText("Select a new sudoku to play or continue with an already started game.")).toBeVisible();
});

const completionViewports = [
  {name: "mobile portrait", width: 390, height: 844, landscape: false},
  {name: "mobile landscape", width: 844, height: 390, landscape: true},
  {name: "tablet portrait", width: 768, height: 1024, landscape: false},
  {name: "tablet landscape", width: 1024, height: 768, landscape: true},
  {name: "desktop portrait", width: 900, height: 1200, landscape: false},
  {name: "desktop landscape", width: 1280, height: 800, landscape: true},
];

for (const viewport of completionViewports) {
  test(`shows the completion screen in ${viewport.name}`, async ({page}, testInfo) => {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    await openGame(page, ONE_EMPTY_CELL_PUZZLE);

    const board = page.getByTestId("sudoku-board");
    const boardBefore = await board.boundingBox();
    if (!boardBefore) {
      throw new Error(`${viewport.name} board must be visible before solving`);
    }

    await selectCell(page, 8, 8);
    await page.getByRole("button", {name: "Set 7"}).click();

    const completionPanel = page.getByTestId("sudoku-completion-panel");
    const completionCopy = page.locator(".sudoku-completion-copy");
    const completionActions = page.locator(".sudoku-completion-actions");
    await expect(completionPanel).toBeVisible();
    await expect(completionPanel.getByRole("heading", {name: "Solved"})).toBeVisible();
    await expectWithinViewport(page, board, `${viewport.name} completed board`);
    await expectWithinViewport(page, completionPanel, `${viewport.name} completion panel`);
    await expectInsideElement(completionCopy, completionPanel, `${viewport.name} completion copy`);
    await expectInsideElement(completionActions, completionPanel, `${viewport.name} completion actions`);
    await expect(page.getByRole("button", {name: "Set 7"})).toHaveCount(0);
    await expect(page.getByTestId("sudoku-toggle-occurrences")).toHaveCount(0);

    const boardAfter = await board.boundingBox();
    if (!boardAfter) {
      throw new Error(`${viewport.name} board must be visible after solving`);
    }

    expect(Math.abs(boardAfter.x - boardBefore.x), `${viewport.name} completed board x shift`).toBeLessThanOrEqual(1);
    expect(Math.abs(boardAfter.y - boardBefore.y), `${viewport.name} completed board y shift`).toBeLessThanOrEqual(1);
    expect(Math.abs(boardAfter.width - boardBefore.width), `${viewport.name} completed board width shift`).toBeLessThanOrEqual(1);
    expect(Math.abs(boardAfter.height - boardBefore.height), `${viewport.name} completed board height shift`).toBeLessThanOrEqual(1);

    if (viewport.name === "mobile landscape") {
      await expectLeftToRight([board, completionPanel], `${viewport.name} completion layout`);
    } else {
      await expectTopToBottom([board, completionPanel], `${viewport.name} completion layout`);
    }

    if (viewport.landscape) {
      await expect(page.locator(".sudoku-completion-copy")).toHaveCSS("text-align", "center");
      for (const metricName of ["solved-count", "best-time", "this-time"]) {
        const metricLabel = page.getByTestId(`sudoku-completion-${metricName}-label`);
        const metricValue = page.getByTestId(`sudoku-completion-${metricName}-value`);

        await expectTopToBottom([metricLabel, metricValue], `${viewport.name} ${metricName} metric`);
        await expect(metricValue).toHaveText(metricName === "solved-count" ? "1 time" : "00:00 min");
        await expectSingleLine(metricValue, `${viewport.name} ${metricName} value`);
      }
    }

    await testInfo.attach(`completion-${viewport.name.replaceAll(" ", "-")}`, {
      body: await page.screenshot({fullPage: true}),
      contentType: "image/png",
    });
  });
}
