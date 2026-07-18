import {expect, type Browser, type BrowserContext, type Page, test} from "@playwright/test";

const FIRST_PUZZLE = "534920700060007309900000010008700000496803002721594806000200940800046100003000000";
const FIRST_SOLUTION = "534921768162487359987635214358762491496813572721594836615278943879346125243159687";
const MULTIPLAYER_COMMAND_CADENCE_MS = 75;

function cell(page: Page, x: number, y: number) {
  return page.getByTestId(`sudoku-cell-${x}-${y}`);
}

function cellValue(page: Page, x: number, y: number) {
  return page.getByTestId(`sudoku-cell-value-${x}-${y}`);
}

function cellNotes(page: Page, x: number, y: number) {
  return page.getByTestId(`sudoku-cell-notes-${x}-${y}`);
}

async function newProfile(browser: Browser, baseURL: string): Promise<BrowserContext> {
  return browser.newContext({baseURL});
}

async function createEasyRoom(page: Page): Promise<string> {
  await page.goto("/#/select-game");
  await page.getByRole("button", {name: "Create online room"}).click();
  await page.getByTestId("select-game-card-1").click();
  await expect(page.getByTestId("current-game-label")).toHaveText("E-1");
  await expect(page.getByTestId("sudoku-board")).toBeVisible();
  const roomCode = (await page.getByTestId("multiplayer-room-code").textContent())?.trim();
  if (!roomCode) {
    throw new Error("Expected a visible multiplayer room code");
  }
  return roomCode;
}

async function joinRoom(page: Page, roomCode: string): Promise<void> {
  await page.goto("/#/select-game");
  await page.getByRole("button", {name: "Join existing room"}).click();
  await page.getByLabel("Room code").fill(roomCode);
  await page.getByRole("button", {name: "Join room"}).click();
  await expect(page.getByTestId("current-game-label")).toHaveText("E-1");
  await expect(page.getByTestId("sudoku-board")).toBeVisible();
}

async function tryJoinRoom(page: Page, roomCode: string): Promise<boolean> {
  const gameLabel = page.getByTestId("current-game-label");
  if (await gameLabel.isVisible()) {
    return true;
  }

  await page.goto("/#/select-game");
  await page.getByRole("button", {name: "Join existing room"}).click();
  await page.getByLabel("Room code").fill(roomCode);
  await page.getByRole("button", {name: "Join room"}).click();

  return Promise.race([
    gameLabel.waitFor({state: "visible", timeout: 5_000}).then(() => true),
    page
      .getByRole("alert")
      .filter({hasText: "That room already has two guests."})
      .waitFor({state: "visible", timeout: 5_000})
      .then(() => false),
  ]).catch(() => false);
}

async function setValue(page: Page, x: number, y: number, value: number): Promise<void> {
  await cell(page, x, y).click();
  await page.getByTestId(`sudoku-number-${value}`).click();
  await expect(cellValue(page, x, y)).toHaveText(String(value));
}

async function expectValueOnBoth(first: Page, second: Page, x: number, y: number, value: number | ""): Promise<void> {
  await expect(cellValue(first, x, y)).toHaveText(String(value));
  await expect(cellValue(second, x, y)).toHaveText(String(value));
}

async function fillRemainingPuzzle(first: Page, second: Page): Promise<void> {
  const pages = [first, second];
  let editableIndex = 0;
  for (let index = 0; index < FIRST_PUZZLE.length; index += 1) {
    if (FIRST_PUZZLE[index] !== "0") {
      continue;
    }
    const page = pages[editableIndex % pages.length];
    const otherPage = pages[(editableIndex + 1) % pages.length];
    const x = index % 9;
    const y = Math.floor(index / 9);
    const solution = Number(FIRST_SOLUTION[index]);
    await page.waitForTimeout(MULTIPLAYER_COMMAND_CADENCE_MS);
    await setValue(page, x, y, solution);
    await expect(cellValue(otherPage, x, y)).toHaveText(String(solution));
    editableIndex += 1;
  }
}

test("creates a room from the renamed Fiendish catalog", async ({page}) => {
  await page.goto("/#/select-game");
  await page.getByRole("button", {name: "Create online room"}).click();
  await page.getByTestId("select-game-collection-fiendish").click();
  await page.getByTestId("select-game-card-1").click();

  await expect(page.getByTestId("current-game-label")).toHaveText("F-1");
  await expect(page.getByTestId("sudoku-board")).toBeVisible();
  await expect(page.getByTestId("multiplayer-room-code")).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
});

test("places multiplayer status responsively across landscape breakpoints", async ({page}) => {
  await createEasyRoom(page);
  const viewports = [
    {width: 699, height: 500, mode: "spanning"},
    {width: 700, height: 500, mode: "right-column"},
    {width: 844, height: 390, mode: "right-column"},
    {width: 900, height: 500, mode: "right-column"},
    {width: 901, height: 500, mode: "right-column"},
    {width: 2_000, height: 500, mode: "right-column"},
    {width: 1_024, height: 600, mode: "stacked"},
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    const layout = await page.locator("main.sudoku-game-layout").evaluate((main) => {
      const status = main.querySelector<HTMLElement>("[data-testid='multiplayer-status']");
      const header = main.querySelector<HTMLElement>("[data-testid='sudoku-game-header']");
      const board = main.querySelector<HTMLElement>("[data-testid='sudoku-board']");
      const numbers = main.querySelector<HTMLElement>(".sudoku-number-pad");
      const controls = main.querySelector<HTMLElement>(".sudoku-control-pad");
      if (!status || !header || !board || !numbers || !controls) {
        throw new Error("Expected the complete multiplayer game grid");
      }
      const box = (element: HTMLElement) => element.getBoundingClientRect();
      const statusBox = box(status);
      const headerBox = box(header);
      const boardBox = box(board);
      const numbersBox = box(numbers);
      const controlsBox = box(controls);
      return {
        controlsBottom: controlsBox.bottom,
        gridAreas: getComputedStyle(main).gridTemplateAreas,
        statusBeforeHeader: status.nextElementSibling === header,
        statusBottom: statusBox.bottom,
        statusLeft: statusBox.left,
        headerTop: headerBox.top,
        boardTop: boardBox.top,
        boardRight: boardBox.right,
        numbersTop: numbersBox.top,
        controlsTop: controlsBox.top,
      };
    });

    expect(layout.statusBeforeHeader).toBe(true);
    expect(layout.controlsBottom).toBeLessThanOrEqual(viewport.height + 1);
    if (viewport.mode === "stacked") {
      expect(layout.gridAreas).toBe("none");
      expect(layout.statusBottom).toBeLessThanOrEqual(layout.headerTop);
      expect(layout.headerTop).toBeLessThan(layout.boardTop);
      expect(layout.boardTop).toBeLessThan(layout.numbersTop);
      expect(layout.numbersTop).toBeLessThan(layout.controlsTop);
    } else if (viewport.mode === "spanning") {
      expect(layout.gridAreas).toContain('"status status"');
      expect(layout.statusBottom).toBeLessThanOrEqual(layout.boardTop);
    } else {
      expect(layout.gridAreas).toContain('"board status"');
      expect(layout.statusLeft).toBeGreaterThanOrEqual(layout.boardRight);
    }
  }
});

test("synchronizes the complete two-player room flow in both directions", async ({baseURL, browser}) => {
  if (!baseURL) {
    throw new Error("Playwright baseURL must be configured");
  }
  const creatorContext = await newProfile(browser, baseURL);
  const joinerContext = await newProfile(browser, baseURL);

  try {
    const creator = await creatorContext.newPage();
    const joiner = await joinerContext.newPage();
    const roomCode = await createEasyRoom(creator);
    await joinRoom(joiner, roomCode);
    await expect(creator.getByLabel("2/2 connected")).toHaveText("2/2");

    await cell(creator, 5, 0).click();
    await expect(cell(joiner, 5, 0)).toHaveAttribute("data-cell-partner-active", "true");
    await cell(creator, 7, 0).click();
    await expect(cell(joiner, 5, 0)).toHaveAttribute("data-cell-partner-active", "false");
    await expect(cell(joiner, 7, 0)).toHaveAttribute("data-cell-partner-active", "true");
    await cell(joiner, 7, 0).click();
    await expect(cell(joiner, 7, 0)).toHaveAttribute("data-cell-active", "true");
    await expect(cell(joiner, 7, 0)).toHaveAttribute("data-cell-partner-active", "true");

    await setValue(creator, 5, 0, 1);
    await expectValueOnBoth(creator, joiner, 5, 0, 1);

    await setValue(joiner, 7, 0, 6);
    await expectValueOnBoth(creator, joiner, 7, 0, 6);

    await cell(joiner, 8, 0).click();
    await joiner.getByTestId("sudoku-control-notes").click();
    await joiner.getByTestId("sudoku-number-5").click();
    await expect(cellNotes(joiner, 8, 0)).toContainText("5");
    await expect(cellNotes(creator, 8, 0)).toContainText("5");
    await joiner.getByTestId("sudoku-control-notes").click();

    await cell(creator, 0, 1).click();
    await creator.getByTestId("sudoku-control-hint").click();
    await expectValueOnBoth(creator, joiner, 0, 1, 1);

    await cell(creator, 7, 0).click();
    await creator.keyboard.press("ArrowRight");
    await expect(cell(joiner, 8, 0)).toHaveAttribute("data-cell-partner-active", "true");
    await creator.getByTestId("sudoku-action-pause").click();
    await expect(cell(joiner, 8, 0)).toHaveAttribute("data-cell-partner-active", "false");
    await expect(creator.getByTestId("continue-overlay")).toBeVisible();
    await expect(joiner.getByTestId("continue-overlay")).toBeVisible();
    await joiner.getByTestId("continue-overlay").click();
    await expect(cell(joiner, 8, 0)).toHaveAttribute("data-cell-partner-active", "true");
    await expect(creator.getByTestId("sudoku-action-pause")).toHaveAccessibleName("Pause");
    await expect(joiner.getByTestId("sudoku-action-pause")).toHaveAccessibleName("Pause");

    await creatorContext.grantPermissions(["clipboard-read", "clipboard-write"], {origin: baseURL});
    const status = creator.getByTestId("multiplayer-status");
    const beforeCopy = await status.boundingBox();
    await creator.getByRole("button", {name: "Copy room link"}).click();
    await expect(creator.getByTestId("multiplayer-copy-button")).toContainText("Copied");
    const afterCopy = await status.boundingBox();
    if (!beforeCopy || !afterCopy) {
      throw new Error("Multiplayer status must be visible");
    }
    expect(afterCopy.height).toBe(beforeCopy.height);

    await joiner.getByTestId("sudoku-control-undo").click();
    await expectValueOnBoth(creator, joiner, 0, 1, "");

    await creator.getByTestId("sudoku-action-clear").click();
    await creator.getByTestId("app-dialog-confirm").click();
    await expectValueOnBoth(creator, joiner, 5, 0, "");
    await expectValueOnBoth(creator, joiner, 7, 0, "");
    await expect(cellNotes(creator, 8, 0)).toHaveText("");
    await expect(cellNotes(joiner, 8, 0)).toHaveText("");

    await fillRemainingPuzzle(creator, joiner);
    await expect(creator.getByTestId("multiplayer-completion-panel")).toContainText("Solved");
    await expect(joiner.getByTestId("multiplayer-completion-panel")).toContainText("Solved");
    await creator.setViewportSize({width: 900, height: 500});
    const completedGridAreas = await creator
      .locator("main.sudoku-game-layout")
      .evaluate((main) => getComputedStyle(main).gridTemplateAreas);
    expect(completedGridAreas).toContain('"board status"');
    expect(completedGridAreas).toContain('"board completion"');
  } finally {
    await creatorContext.close();
    await joinerContext.close();
  }
});

test("uses the latest same-guest tab and clears only its final disconnect", async ({baseURL, browser}) => {
  if (!baseURL) {
    throw new Error("Playwright baseURL must be configured");
  }
  const creatorContext = await browser.newContext({
    baseURL,
    hasTouch: true,
    viewport: {width: 390, height: 844},
  });
  const joinerContext = await newProfile(browser, baseURL);
  try {
    const creator = await creatorContext.newPage();
    const joiner = await joinerContext.newPage();
    const roomCode = await createEasyRoom(creator);
    await joinRoom(joiner, roomCode);
    const creatorExtra = await creatorContext.newPage();
    await creatorExtra.goto(`/#/room/${roomCode}`);
    await expect(creatorExtra.getByTestId("sudoku-board")).toBeVisible();

    await cell(creatorExtra, 5, 0).tap();
    await expect(cell(joiner, 5, 0)).toHaveAttribute("data-cell-partner-active", "true");
    await cell(creator, 7, 0).tap();
    await expect(cell(joiner, 5, 0)).toHaveAttribute("data-cell-partner-active", "false");
    await expect(cell(joiner, 7, 0)).toHaveAttribute("data-cell-partner-active", "true");

    await creatorExtra.close();
    await expect(cell(joiner, 7, 0)).toHaveAttribute("data-cell-partner-active", "true");
    await creator.close();
    await expect(cell(joiner, 7, 0)).toHaveAttribute("data-cell-partner-active", "false");
    await expect(joiner.getByLabel("1/2 connected")).toHaveText("1/2");
  } finally {
    await creatorContext.close();
    await joinerContext.close();
  }
});

test("shares one seat across tabs and releases a disconnected reservation after grace", async ({baseURL, browser}) => {
  if (!baseURL) {
    throw new Error("Playwright baseURL must be configured");
  }
  const creatorContext = await newProfile(browser, baseURL);
  const joinerContext = await newProfile(browser, baseURL);
  const replacementContext = await newProfile(browser, baseURL);

  try {
    const creator = await creatorContext.newPage();
    const joiner = await joinerContext.newPage();
    const replacement = await replacementContext.newPage();
    const roomCode = await createEasyRoom(creator);
    await joinRoom(joiner, roomCode);

    const creatorExtraTab = await creatorContext.newPage();
    await creatorExtraTab.goto(`/#/room/${roomCode}`);
    await expect(creatorExtraTab.getByTestId("current-game-label")).toHaveText("E-1");
    await expect(creator.getByLabel("2/2 connected")).toHaveText("2/2");
    await expect(creatorExtraTab.getByLabel("2/2 connected")).toHaveText("2/2");

    await replacement.goto("/#/select-game");
    await replacement.getByRole("button", {name: "Join existing room"}).click();
    await replacement.getByLabel("Room code").fill(roomCode);
    await replacement.getByRole("button", {name: "Join room"}).click();
    await expect(replacement.getByRole("alert")).toContainText("That room already has two guests.");

    await joiner.close();
    await expect(creator.getByLabel("1/2 connected")).toHaveText("1/2");
    const immediateReconnect = await joinerContext.newPage();
    await immediateReconnect.goto(`/#/room/${roomCode}`);
    await expect(immediateReconnect.getByTestId("current-game-label")).toHaveText("E-1");
    await expect(creator.getByLabel("2/2 connected")).toHaveText("2/2");

    await immediateReconnect.close();
    await expect(creator.getByLabel("1/2 connected")).toHaveText("1/2");
    await expect
      .poll(() => tryJoinRoom(replacement, roomCode), {intervals: [250, 500, 1_000], timeout: 15_000})
      .toBe(true);
    await expect(replacement.getByLabel("2/2 connected")).toHaveText("2/2");
  } finally {
    await creatorContext.close();
    await joinerContext.close();
    await replacementContext.close();
  }
});

test("keeps the confirmed board read-only while reconnecting and restores a full snapshot", async ({
  baseURL,
  browser,
}) => {
  if (!baseURL) {
    throw new Error("Playwright baseURL must be configured");
  }
  const creatorContext = await newProfile(browser, baseURL);
  const reconnectingContext = await newProfile(browser, baseURL);

  try {
    const creator = await creatorContext.newPage();
    const reconnecting = await reconnectingContext.newPage();
    const roomCode = await createEasyRoom(creator);
    await joinRoom(reconnecting, roomCode);
    await setValue(reconnecting, 5, 0, 1);
    await expectValueOnBoth(creator, reconnecting, 5, 0, 1);

    await cell(reconnecting, 8, 0).click();
    await expect(cell(creator, 8, 0)).toHaveAttribute("data-cell-partner-active", "true");
    await reconnectingContext.setOffline(true);
    await expect(cell(creator, 8, 0)).toHaveAttribute("data-cell-partner-active", "false");
    await expect(cell(reconnecting, 8, 0)).toHaveAttribute("data-cell-partner-active", "false");
    await expect(reconnecting.getByTestId("multiplayer-status")).toContainText(
      "An internet connection is required to create or join an online room.",
    );
    await expect(cellValue(reconnecting, 5, 0)).toHaveText("1");
    await expect(reconnecting.getByTestId("sudoku-number-6")).toBeDisabled();

    await setValue(creator, 7, 0, 6);
    await expect(cellValue(reconnecting, 7, 0)).toHaveText("");

    await reconnectingContext.setOffline(false);
    await expect(cell(creator, 8, 0)).toHaveAttribute("data-cell-partner-active", "true");
    await expect(cellValue(reconnecting, 7, 0)).toHaveText("6");
    await expect(
      reconnecting.getByText("An internet connection is required to create or join an online room."),
    ).toHaveCount(0);
    await expect(reconnecting.getByTestId("sudoku-number-6")).toBeEnabled();
  } finally {
    await reconnectingContext.setOffline(false);
    await creatorContext.close();
    await reconnectingContext.close();
  }
});
