import {expect, type Locator, type Page, test} from "@playwright/test";

const FIRST_PUZZLE = "534920700060007309900000010008700000496803002721594806000200940800046100003000000";
const SECOND_PUZZLE = "009043005867002003040060027002086050930420000058397040300270900001000002724059030";

type SeededSudoku = {
  collection: string;
  previousTimes: number[];
  secondsPlayed: number;
  sudoku: string;
  sudokuIndex: number;
  timesSolved: number;
  won: boolean;
};

const selectGameViewports = [
  {name: "phone portrait", width: 390, height: 844},
  {name: "phone landscape", width: 844, height: 390},
  {name: "tablet portrait", width: 768, height: 1024},
  {name: "tablet landscape", width: 1024, height: 768},
  {name: "desktop portrait", width: 900, height: 1200},
  {name: "desktop landscape", width: 1280, height: 800},
];

function previewCard(page: Page, id: number): Locator {
  return page.getByTestId(`select-game-card-${id}`);
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

async function expectPreviewLabelAboveMetadata(page: Page, previewId: number, metadata: Locator, name: string) {
  const preview = page.getByTestId(`sudoku-preview-${previewId}`);
  const previewLabel = page.getByTestId(`sudoku-preview-number-${previewId}`);
  const previewBox = await preview.boundingBox();
  const numberBox = await previewLabel.boundingBox();
  const metadataBox = await metadata.boundingBox();

  if (!previewBox || !numberBox || !metadataBox) {
    throw new Error(`${name} must have visible preview, number, and metadata boxes`);
  }

  const numberCenterX = numberBox.x + numberBox.width / 2;
  const numberCenterY = numberBox.y + numberBox.height / 2;
  const previewCenterX = previewBox.x + previewBox.width / 2;
  const previewTopThirdY = previewBox.y + previewBox.height / 3;
  const previewUpperBandY = previewBox.y + previewBox.height * 0.18;

  expect(Math.abs(numberCenterX - previewCenterX), `${name} horizontal center`).toBeLessThanOrEqual(2);
  expect(numberCenterY, `${name} upper-third lower bound`).toBeGreaterThanOrEqual(previewUpperBandY);
  expect(numberCenterY, `${name} upper-third position`).toBeLessThanOrEqual(previewTopThirdY);
  expect(numberBox.y + numberBox.height, `${name} clears saved metadata`).toBeLessThanOrEqual(metadataBox.y - 1);
  await expect(previewLabel).toHaveText(`E-${previewId}`);
  await expectInsideElement(previewLabel, preview, `${name} label`);
  await expect(previewLabel).toHaveCSS("color", "rgb(13, 148, 136)");
  await expect(previewLabel).toHaveCSS("opacity", "1");
  await expect(previewLabel).toHaveClass(/text-teal-600/);
  await expect(previewLabel).toHaveClass(/dark:text-teal-600/);
  await expect(previewLabel).not.toHaveClass(/opacity-/);
}

async function seedSelectGameStates(page: Page) {
  await page.addInitScript(
    (seededSudokus: SeededSudoku[]) => {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          addEventListener: () => {},
          controller: null,
          getRegistration: () => Promise.resolve(undefined),
          getRegistrations: () => Promise.resolve([]),
          ready: Promise.resolve(undefined),
          register: () => Promise.resolve(undefined),
          removeEventListener: () => {},
        },
      });

      for (const seededSudoku of seededSudokus) {
        const cells = seededSudoku.sudoku.split("").map((value, index) => ({
          x: index % 9,
          y: Math.floor(index / 9),
          number: Number(value),
          initial: value !== "0",
          notes: [],
          solution: Number(value),
        }));

        localStorage.setItem(
          `sudoku-played-${seededSudoku.sudoku}`,
          JSON.stringify({
            game: {
              activeCellCoordinates: undefined,
              sudokuCollectionName: seededSudoku.collection,
              notesMode: false,
              showNotes: false,
              showMenu: false,
              state: "PAUSED",
              sudokuIndex: seededSudoku.sudokuIndex - 1,
              won: seededSudoku.won,
              timesSolved: seededSudoku.timesSolved,
              previousTimes: seededSudoku.previousTimes,
              secondsPlayed: seededSudoku.secondsPlayed,
              clipboardNotes: null,
            },
            sudoku: cells,
          }),
        );
      }
    },
    [
      {
        collection: "easy",
        previousTimes: [1175, 1510],
        secondsPlayed: 1265,
        sudoku: FIRST_PUZZLE,
        sudokuIndex: 1,
        timesSolved: 2,
        won: false,
      },
      {
        collection: "easy",
        previousTimes: [965, 1250],
        secondsPlayed: 1122,
        sudoku: SECOND_PUZZLE,
        sudokuIndex: 2,
        timesSolved: 3,
        won: true,
      },
    ] satisfies SeededSudoku[],
  );
}

test("switches between Solo, Create Online, and Join Existing", async ({page}) => {
  await seedSelectGameStates(page);
  await page.goto("/#/select-game");

  const solo = page.getByRole("button", {name: "Solo / offline"});
  const createOnline = page.getByRole("button", {name: "Create online room"});
  const joinExisting = page.getByRole("button", {name: "Join existing room"});

  await expect(solo).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("select-game-card-status-1")).toBeVisible();

  await createOnline.click();
  await expect(createOnline).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("select-game-grid")).toBeVisible();
  await expect(page.getByTestId("select-game-card-status-1")).toHaveCount(0);

  await joinExisting.click();
  await expect(joinExisting).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("select-game-grid")).toHaveCount(0);
  await expect(page.getByRole("heading", {name: "Join existing room"})).toBeVisible();
  await expect(page.getByText("Enter a room code to join a shared puzzle.")).toBeVisible();
  await expect(page.getByLabel("Room code")).toBeVisible();

  const formBox = await page.getByTestId("join-room-form").boundingBox();
  const inputBox = await page.getByLabel("Room code").boundingBox();
  const buttonBox = await page.getByRole("button", {name: "Join room"}).boundingBox();
  if (!formBox || !inputBox || !buttonBox) {
    throw new Error("Join room controls must be visible");
  }
  const center = (box: {x: number; width: number}) => box.x + box.width / 2;
  expect(Math.abs(center(inputBox) - center(formBox))).toBeLessThanOrEqual(2);
  expect(Math.abs(center(buttonBox) - center(formBox))).toBeLessThanOrEqual(2);
});

test("validates and normalizes room codes before hash-route navigation", async ({page}) => {
  await page.goto("/#/select-game");
  await page.getByRole("button", {name: "Join existing room"}).click();

  const roomCode = page.getByLabel("Room code");
  await roomCode.fill("abc01!");
  await page.getByRole("button", {name: "Join room"}).click();
  await expect(page.getByRole("alert")).toContainText("Enter a valid six-character room code.");
  await expect(page).toHaveURL(/#\/select-game$/);

  await roomCode.fill("abc234");
  await expect(roomCode).toHaveValue("ABC234");
  await page.getByRole("button", {name: "Join room"}).click();
  await expect(page).toHaveURL(/#\/room\/ABC234$/);
  await expect(page.getByTestId("multiplayer-status")).toContainText(
    /Reconnecting…|Online play is temporarily unavailable/,
  );
  await expect(page.getByRole("button", {name: "Retry"})).toBeVisible();
});

test("keeps Solo available and disables online actions while offline", async ({page, context}) => {
  await page.goto("/#/select-game");
  await context.setOffline(true);

  await expect(page.getByRole("button", {name: "Solo / offline"})).toBeEnabled();
  await expect(page.getByRole("button", {name: "Create online room"})).toBeDisabled();
  await expect(page.getByRole("button", {name: "Join existing room"})).toBeDisabled();
  await expect(page.getByText(/internet connection is required/i)).toBeVisible();
  await expect(page.getByTestId("select-game-grid")).toBeVisible();

  await context.setOffline(false);
});

test("localizes difficulty names while keeping puzzle codes invariant", async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "language", {value: "es-ES", configurable: true});
    Object.defineProperty(navigator, "languages", {value: ["es-ES", "es"], configurable: true});
  });
  await page.goto("/#/select-game");

  await expect(page.getByTestId("select-game-collection-easy")).toHaveText("Fácil");
  await expect(page.getByTestId("sudoku-preview-number-1")).toHaveText("E-1");
  await expect(page.getByTestId("sudoku-preview-1")).toHaveAccessibleName(
    "Seleccionar sudoku E-1 de dificultad Fácil",
  );
});

test("shows restart confirmation dialog for finished games on select screen", async ({page}) => {
  await seedSelectGameStates(page);
  await page.goto("/#/select-game");

  const finishedCard = previewCard(page, 2);
  const dialog = page.getByTestId("app-dialog");
  const cancelButton = page.getByTestId("app-dialog-cancel");
  const confirmButton = page.getByTestId("app-dialog-confirm");

  await finishedCard.click();
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("app-dialog-message")).toContainText(
    "Are you sure? This will restart the sudoku and reset the timer.",
  );
  await expect(cancelButton).toBeVisible();
  await expect(cancelButton).toHaveClass(/bg-gray-100/);
  await expect(cancelButton).toHaveClass(/border-gray-300/);
  await expect(cancelButton).toHaveClass(/border/);

  await cancelButton.click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/select-game/);
  await expect(page.getByRole("heading", {name: "Select Game"})).toBeVisible();

  await finishedCard.click();
  await expect(dialog).toBeVisible();
  await confirmButton.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("current-game-label")).toHaveText("E-2");
});

for (const viewport of selectGameViewports) {
  test(`shows saved Select Game states in ${viewport.name}`, async ({page}, testInfo) => {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    await seedSelectGameStates(page);
    await page.goto("/#/select-game");

    await expect(page.getByRole("heading", {name: "Select Game"})).toBeVisible();
    await expect(page.getByText("Select a new sudoku to play or continue with an already started game.")).toBeVisible();
    await expect(page.getByTestId("select-game-collection-easy")).toBeVisible();
    await expect(page.getByTestId("select-game-collection-medium")).toBeVisible();

    const unfinishedCard = previewCard(page, 1);
    const finishedCard = previewCard(page, 2);
    const freshCard = previewCard(page, 3);
    const unfinishedStatus = page.getByTestId("select-game-card-status-1");
    const finishedStatus = page.getByTestId("select-game-card-status-2");

    await expect(page.getByTestId("sudoku-preview-1")).toBeVisible();
    await expect(page.getByTestId("sudoku-preview-2")).toBeVisible();
    await expect(page.getByTestId("sudoku-preview-3")).toBeVisible();
    await expectInsideElement(
      unfinishedStatus.getByText("Continue", {exact: true}),
      unfinishedCard,
      `${viewport.name} continue label`,
    );
    await expectInsideElement(
      finishedStatus.getByText("Restart?", {exact: true}),
      finishedCard,
      `${viewport.name} restart label`,
    );
    await expectPreviewLabelAboveMetadata(
      page,
      1,
      unfinishedStatus.getByText(/Play time:\s+21:05 min/),
      `${viewport.name} unfinished preview number`,
    );
    await expectPreviewLabelAboveMetadata(
      page,
      2,
      finishedStatus.getByText(/Last time:\s+18:42 min/),
      `${viewport.name} finished preview number`,
    );

    await expect(unfinishedStatus).toContainText(/Play time:\s+21:05 min/);
    await expect(unfinishedStatus).toContainText(/Best time:\s+19:35 min/);
    await expect(unfinishedStatus).toContainText("Solved 2 times");
    await expect(unfinishedStatus).toContainText("Continue");

    await expect(finishedStatus).toContainText(/Last time:\s+18:42 min/);
    await expect(finishedStatus).toContainText(/Best time:\s+16:05 min/);
    await expect(finishedStatus).toContainText("Solved 3 times");
    await expect(finishedStatus).toContainText("Restart?");

    await expect(freshCard).not.toContainText(/Play time:|Last time:|Best time:|Solved|Continue|Restart\?/);

    const screenshotName = `select-game-${viewport.name.replaceAll(" ", "-")}.png`;
    const screenshotPath = testInfo.outputPath(screenshotName);
    await page.screenshot({fullPage: true, path: screenshotPath});

    await testInfo.attach(screenshotName, {
      path: screenshotPath,
      contentType: "image/png",
    });
  });
}
