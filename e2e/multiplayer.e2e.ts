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
  await expect(page.getByTestId("current-game-label")).toHaveText("Easy #1");
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
  await page.getByRole("button", {name: "Join", exact: true}).click();
  await expect(page.getByTestId("current-game-label")).toHaveText("Easy #1");
  await expect(page.getByTestId("sudoku-board")).toBeVisible();
}

async function tryJoinRoom(page: Page, roomCode: string): Promise<boolean> {
  await page.goto("/#/select-game");
  await page.getByRole("button", {name: "Join existing room"}).click();
  await page.getByLabel("Room code").fill(roomCode);
  await page.getByRole("button", {name: "Join", exact: true}).click();
  try {
    await page.getByTestId("current-game-label").waitFor({state: "visible", timeout: 350});
    return true;
  } catch {
    return false;
  }
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
    await expect(creator.getByTestId("multiplayer-status")).toContainText("2/2 connected");

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

    await creator.getByTestId("sudoku-action-pause").click();
    await expect(creator.getByTestId("continue-overlay")).toBeVisible();
    await expect(joiner.getByTestId("continue-overlay")).toBeVisible();
    await joiner.getByTestId("continue-overlay").click();
    await expect(creator.getByTestId("sudoku-action-pause")).toHaveAccessibleName("Pause");
    await expect(joiner.getByTestId("sudoku-action-pause")).toHaveAccessibleName("Pause");

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
    await expect(creatorExtraTab.getByTestId("current-game-label")).toHaveText("Easy #1");
    await expect(creator.getByTestId("multiplayer-status")).toContainText("2/2 connected");
    await expect(creatorExtraTab.getByTestId("multiplayer-status")).toContainText("2/2 connected");

    await replacement.goto("/#/select-game");
    await replacement.getByRole("button", {name: "Join existing room"}).click();
    await replacement.getByLabel("Room code").fill(roomCode);
    await replacement.getByRole("button", {name: "Join", exact: true}).click();
    await expect(replacement.getByRole("alert")).toContainText("That room already has two guests.");

    await joiner.close();
    await expect(creator.getByTestId("multiplayer-status")).toContainText("1/2 connected");
    const immediateReconnect = await joinerContext.newPage();
    await immediateReconnect.goto(`/#/room/${roomCode}`);
    await expect(immediateReconnect.getByTestId("current-game-label")).toHaveText("Easy #1");
    await expect(creator.getByTestId("multiplayer-status")).toContainText("2/2 connected");

    await immediateReconnect.close();
    await expect(creator.getByTestId("multiplayer-status")).toContainText("1/2 connected");
    await expect.poll(() => tryJoinRoom(replacement, roomCode), {intervals: [250], timeout: 5_000}).toBe(true);
    await expect(replacement.getByTestId("multiplayer-status")).toContainText("2/2 connected");
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

    await reconnectingContext.setOffline(true);
    await expect(reconnecting.getByText("Reconnecting…")).toBeVisible();
    await expect(cellValue(reconnecting, 5, 0)).toHaveText("1");
    await expect(reconnecting.getByTestId("sudoku-number-6")).toBeDisabled();

    await setValue(creator, 7, 0, 6);
    await expect(cellValue(reconnecting, 7, 0)).toHaveText("");

    await reconnectingContext.setOffline(false);
    await expect(cellValue(reconnecting, 7, 0)).toHaveText("6");
    await expect(reconnecting.getByText("Reconnecting…")).toHaveCount(0);
    await expect(reconnecting.getByTestId("sudoku-number-6")).toBeEnabled();
  } finally {
    await reconnectingContext.setOffline(false);
    await creatorContext.close();
    await reconnectingContext.close();
  }
});
