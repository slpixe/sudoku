import {expect, test} from "@playwright/test";
import {existsSync} from "node:fs";

const puzzle = "534920700060007309900000010008700000496803002721594806000200940800046100003000000";
const solution = "534921768162487359987635214358762491496813572721594836615278943879346125243159687";

for (const state of ["Fresh", "90% filled", "Notes", "Paused", "Completed"] as const) {
  test(state, async ({page, colorScheme}, testInfo) => {
    // Fix Date.now while letting animation frames finish responsive layout.
    await page.clock.setFixedTime(new Date("2026-10-07T12:00:00Z"));
    await page.addInitScript(
      ({puzzle, solution, state, dark}) => {
        const emptyIndices = [...puzzle].flatMap((value, index) => (value === "0" ? [index] : []));
        // Nine empty cells leaves 72/81 cells filled (approximately 90%).
        const remaining = new Set(emptyIndices.slice(-9));
        const cells = [...puzzle].map((value, index) => ({
          x: index % 9,
          y: Math.floor(index / 9),
          number:
            state === "Completed" || ((state === "90% filled" || state === "Paused") && !remaining.has(index))
              ? Number(solution[index])
              : Number(value),
          initial: value !== "0",
          notes: state === "Notes" && value === "0" ? [Number(solution[index]), (Number(solution[index]) % 9) + 1] : [],
          solution: Number(solution[index]),
        }));
        localStorage.setItem("sudoku-dark-mode", JSON.stringify(dark));
        localStorage.setItem("sudoku-optional-monitoring-v1", "declined");
        localStorage.setItem("sudoku-currently-playing-sudoku", puzzle);
        localStorage.setItem(
          `sudoku-played-${puzzle}`,
          JSON.stringify({
            game: {
              activeCellCoordinates: {x: 5, y: 0},
              sudokuCollectionName: "easy",
              notesMode: false,
              showNotes: state === "Notes",
              showMenu: false,
              state: state === "Paused" || state === "Completed" ? "PAUSED" : "RUNNING",
              sudokuIndex: 0,
              won: state === "Completed",
              timesSolved: state === "Completed" ? 1 : 0,
              previousTimes: state === "Completed" ? [483] : [],
              secondsPlayed: state === "Fresh" ? 0 : 483,
              clipboardNotes: null,
            },
            sudoku: cells,
          }),
        );
      },
      {puzzle, solution, state, dark: colorScheme === "dark"},
    );
    await page.goto("/#/?collection=easy&puzzle=1");
    await expect(page.getByTestId("sudoku-board")).toBeVisible();
    const overlay = page.getByTestId("continue-overlay");
    if (state === "Paused") {
      await expect(overlay).toBeVisible();
    } else if (state !== "Completed" && (await overlay.isVisible())) {
      await overlay.click();
    }
    if (state === "Completed") {
      await expect(page.getByTestId("sudoku-action-pause")).toBeDisabled();
    }
    await page.evaluate(() => document.fonts.ready);
    const baseline = testInfo.snapshotPath("game.png");
    if (existsSync(baseline)) {
      await testInfo.attach("Before", {path: baseline, contentType: "image/png"});
    }
    const after = testInfo.outputPath("after.png");
    await page.screenshot({path: after, fullPage: true});
    await testInfo.attach("After", {path: after, contentType: "image/png"});
    // A changed screenshot exposes Playwright's Expected/Actual/Diff slider.
    // Accept a design by updating snapshots only after reviewing the changes.
    await expect(page).toHaveScreenshot("game.png", {fullPage: true, threshold: 0.05, timeout: 1500});
  });
}
