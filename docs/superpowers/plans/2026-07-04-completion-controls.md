# Completion Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-board win overlay with a completed-state controls panel that keeps the solved board visible.

**Architecture:** Add a focused `GameCompletionPanel` component beside the existing game screen code. `Game.tsx` keeps rendering the Sudoku board normally, then conditionally renders either the active number/control pads or the completed-state panel. Responsive CSS reuses the current landscape grid areas and replaces the control column with centered completion content.

**Tech Stack:** React 18, TypeScript, TanStack Router, i18next, Vite, Tailwind CSS, Playwright, pnpm 11.9.0.

## Global Constraints

- Use pnpm for all commands.
- Do not add runtime dependencies.
- Preserve Sudoku solving, persistence, collection routing, and puzzle data.
- Keep the header and Sudoku board visible after completion.
- The board must not move between the running and completed states.
- The completed state is non-modal and does not trap focus.
- Render a primary Next `<collection>` `#<index>` action when a next puzzle exists.
- Render a New game action that opens the existing `/select-game` flow.
- Hide the number pad and in-game controls after completion.
- Run `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm build`, and `pnpm run test:e2e` before reporting implementation complete.

---

## File Structure

- `src/pages/Game/GameCompletionPanel.tsx`: new completion panel component. It owns next-puzzle lookup, completion stats rendering, primary-action focus, and navigation actions.
- `src/pages/Game.tsx`: removes the old board overlay, keeps the board rendered, and swaps number/control pads for `GameCompletionPanel` when `game.won` is true.
- `src/pages/Game/GameWonOverlay.tsx`: delete after its next-puzzle logic is replaced by `GameCompletionPanel`.
- `src/main.css`: adds completed-state landscape grid rules and centered completion-copy styling.
- `src/locales/*.json`: adds `completion_solved` and `completion_next_sudoku` keys to every locale.
- `e2e/sudoku.e2e.ts`: updates the win-flow test and adds completion-screen viewport coverage for mobile, tablet, and desktop in portrait and landscape.

---

### Task 1: Completion Panel Actions

**Files:**

- Create: `src/pages/Game/GameCompletionPanel.tsx`
- Modify: `src/pages/Game.tsx`
- Modify: `src/locales/de.json`
- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/fr.json`
- Modify: `src/locales/it.json`
- Modify: `src/locales/pt.json`
- Modify: `src/locales/zh.json`
- Modify: `e2e/sudoku.e2e.ts`
- Delete: `src/pages/Game/GameWonOverlay.tsx`

**Interfaces:**

- Consumes: `GameState` from `src/context/GameContext`, `useSudokuCollections()` and `getSudokusPaginated()` from `src/lib/game/sudokus`, `translateCollectionName()` from `src/lib/database/collections`, `stringifySudoku()` from `src/lib/engine/utility`, `formatDuration()` from `src/utils/format`, `Button` from `src/components/Button`, and `useNavigate()` from `@tanstack/react-router`.
- Produces: `GameCompletionPanel({game}: {game: GameState})`, rendered by `Game.tsx` when `game.won` is true.

- [ ] **Step 1: Replace the existing win-flow e2e test**

In `e2e/sudoku.e2e.ts`, replace the test named `solves a sudoku and starts the next game from the win screen` with:

```ts
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
```

- [ ] **Step 2: Add the completion New game e2e test**

Immediately after the updated win-flow test, add:

```ts
test("opens game selection from the completion panel", async ({page}) => {
  await openGame(page, ONE_EMPTY_CELL_PUZZLE);

  await selectCell(page, 8, 8);
  await page.getByRole("button", {name: "Set 7"}).click();

  await expect(page.getByTestId("sudoku-completion-panel")).toBeVisible();
  await page.getByTestId("sudoku-completion-new-game").click();

  await expect(page.getByRole("heading", {name: "Select Game"})).toBeVisible();
  await expect(page.getByText("Select a new sudoku to play or continue with an already started game.")).toBeVisible();
});
```

- [ ] **Step 3: Run focused e2e tests and verify the expected failure**

Run:

```bash
pnpm exec playwright test e2e/sudoku.e2e.ts --grep "completion panel|starts the next game"
```

Expected: the tests fail because `sudoku-completion-panel`, `sudoku-completion-next`, and `sudoku-completion-new-game` do not exist yet.

- [ ] **Step 4: Add completion locale keys**

Add these keys near the existing `congrats` and next-sudoku strings in every locale file:

```json
"completion_solved": "Solved",
"completion_next_sudoku": "Next {{collection}} #{{sudokuIndex}}",
```

Use these translated values:

```text
de completion_solved: Gelöst
de completion_next_sudoku: Weiter: {{collection}} #{{sudokuIndex}}
en completion_solved: Solved
en completion_next_sudoku: Next {{collection}} #{{sudokuIndex}}
es completion_solved: Resuelto
es completion_next_sudoku: Siguiente {{collection}} #{{sudokuIndex}}
fr completion_solved: Résolu
fr completion_next_sudoku: Suivant : {{collection}} #{{sudokuIndex}}
it completion_solved: Risolto
it completion_next_sudoku: Successivo {{collection}} #{{sudokuIndex}}
pt completion_solved: Resolvido
pt completion_next_sudoku: Próximo {{collection}} #{{sudokuIndex}}
zh completion_solved: 已完成
zh completion_next_sudoku: 下一题 {{collection}} #{{sudokuIndex}}
```

- [ ] **Step 5: Create the completion panel component**

Create `src/pages/Game/GameCompletionPanel.tsx` with:

```tsx
import * as React from "react";

import {useNavigate} from "@tanstack/react-router";
import {useTranslation} from "react-i18next";
import Button from "src/components/Button";
import {GameState} from "src/context/GameContext";
import {translateCollectionName} from "src/lib/database/collections";
import {stringifySudoku} from "src/lib/engine/utility";
import {getSudokusPaginated, useSudokuCollections} from "src/lib/game/sudokus";
import {formatDuration} from "src/utils/format";

type NextSudokuParams = {
  sudokuIndex: number;
  sudoku: string;
  sudokuCollectionName: string;
};

function useNextSudoku(gameState: GameState) {
  const {getCollection} = useSudokuCollections();

  return React.useMemo(() => {
    try {
      const collection = getCollection(gameState.sudokuCollectionName);
      const collectionName = translateCollectionName(collection.name);
      const nextIndex = gameState.sudokuIndex + 1;
      const result = getSudokusPaginated(collection, nextIndex, 1);
      const sudoku = result.sudokus[0];

      if (!sudoku) {
        return {collectionName, nextSudokuParams: null};
      }

      const nextSudokuParams: NextSudokuParams = {
        sudokuIndex: nextIndex + 1,
        sudoku: stringifySudoku(sudoku.sudoku),
        sudokuCollectionName: gameState.sudokuCollectionName,
      };

      return {
        collectionName,
        nextSudokuParams,
      };
    } catch (error) {
      console.error("Error calculating next sudoku:", error);
      return {
        collectionName: translateCollectionName(gameState.sudokuCollectionName),
        nextSudokuParams: null,
      };
    }
  }, [gameState.sudokuCollectionName, gameState.sudokuIndex, getCollection]);
}

export const GameCompletionPanel: React.FC<{game: GameState}> = ({game}) => {
  const navigate = useNavigate();
  const {t} = useTranslation();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const {collectionName, nextSudokuParams} = useNextSudoku(game);
  const bestTime = game.previousTimes.length > 0 ? Math.min(...game.previousTimes) : null;

  React.useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>("[data-completion-primary-action='true']")?.focus();
  }, [nextSudokuParams]);

  const goToNextSudoku = async () => {
    if (!nextSudokuParams) {
      return;
    }

    await navigate({
      to: "/",
      search: nextSudokuParams,
    });
  };

  const goToSelectGame = async () => {
    await navigate({
      to: "/select-game",
    });
  };

  return (
    <section
      aria-labelledby="sudoku-completion-title"
      className="sudoku-completion-panel grid min-h-0 gap-3 rounded-sm bg-gray-700/35 p-3 text-white sm:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)]"
      data-testid="sudoku-completion-panel"
      ref={panelRef}
    >
      <div
        className="sudoku-completion-copy rounded-sm bg-white p-3 text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
        role="status"
      >
        <h2 className="text-base font-bold leading-tight sm:text-lg" id="sudoku-completion-title">
          {t("completion_solved")}
        </h2>
        <div className="mt-2 grid gap-1 text-sm leading-5">
          <p>{t(game.timesSolved === 1 ? "solved_time" : "solved_times", {count: game.timesSolved})}</p>
          {bestTime !== null ? <p>{t("best_time", {time: formatDuration(bestTime)})}</p> : null}
          <p>{t("this_time", {time: formatDuration(game.secondsPlayed)})}</p>
          {!nextSudokuParams ? <p>{t("collection_finished", {collection: collectionName})}</p> : null}
        </div>
      </div>

      <div className="sudoku-completion-actions grid min-w-0 content-center gap-2 sm:min-w-36">
        {nextSudokuParams ? (
          <Button
            className="min-h-11 w-full bg-teal-700 px-3 py-2 text-sm text-white dark:bg-teal-600 sm:text-base"
            data-completion-primary-action="true"
            data-testid="sudoku-completion-next"
            onClick={goToNextSudoku}
          >
            {t("completion_next_sudoku", {
              collection: collectionName,
              sudokuIndex: nextSudokuParams.sudokuIndex,
            })}
          </Button>
        ) : null}
        <Button
          className="min-h-11 w-full px-3 py-2 text-sm sm:text-base"
          data-completion-primary-action={nextSudokuParams ? undefined : "true"}
          data-testid="sudoku-completion-new-game"
          onClick={goToSelectGame}
        >
          {t("new_game")}
        </Button>
      </div>
    </section>
  );
};
```

- [ ] **Step 6: Replace the overlay in the game screen**

In `src/pages/Game.tsx`, remove the lazy `GameWonOverlay` import and add:

```tsx
import {GameCompletionPanel} from "./Game/GameCompletionPanel";
```

Change the `<main>` class to include the completed-state marker:

```tsx
<main
  className={`sudoku-game-layout${game.won ? " sudoku-game-layout-complete" : ""} mt-3 grid w-full gap-3`}
>
```

Remove this child from inside `<Sudoku>`:

```tsx
{game.won && (
  <React.Suspense fallback={null}>
    <GameWonOverlay game={game} />
  </React.Suspense>
)}
```

Replace the number and control pad blocks with this conditional rendering:

```tsx
{game.won ? (
  <div className="sudoku-completion-pad min-w-0">
    <GameCompletionPanel game={game} />
  </div>
) : (
  <>
    <div className="sudoku-number-pad min-w-0">
      <SudokuMenuNumbers
        layout="row"
        notesMode={game.notesMode}
        disabled={pausedGame}
        showOccurrences={userPreferencesState.showOccurrences}
        activeCell={game.activeCellCoordinates}
        boardData={boardData}
        showHints={userPreferencesState.showHints}
        setNumber={setNumber}
        setNotes={setNotes}
      />
    </div>
    <div className="sudoku-control-pad min-w-0">
      <SudokuMenuControls
        notesMode={game.notesMode}
        activeCellCoordinates={game.activeCellCoordinates}
        disabled={pausedGame}
        showConflicts={userPreferencesState.showConflicts}
        showOccurrences={userPreferencesState.showOccurrences}
        showMatchingNumbers={userPreferencesState.showMatchingNumbers}
        clearCell={clearCell}
        activateNotesMode={activateNotesMode}
        deactivateNotesMode={deactivateNotesMode}
        toggleShowConflicts={toggleShowConflicts}
        toggleShowOccurrences={toggleShowOccurrences}
        toggleShowMatchingNumbers={toggleShowMatchingNumbers}
        getHint={getHint}
        canUndo={canUndo}
        undo={undo}
      />
    </div>
  </>
)}
```

- [ ] **Step 7: Delete the old overlay file and confirm no imports remain**

Delete `src/pages/Game/GameWonOverlay.tsx`, then run:

```bash
rg "GameWonOverlay|NextSudokuButton" src
```

Expected: no output. `rg` exits with code 1 when no matches are found.

- [ ] **Step 8: Run focused e2e coverage and verify it passes**

Run:

```bash
pnpm exec playwright test e2e/sudoku.e2e.ts --grep "completion panel|starts the next game"
```

Expected: the two completion panel tests pass. The old `Congrats, you won` overlay is absent, `sudoku-completion-panel` is visible, `sudoku-completion-next` receives focus, Next opens Easy #2, and New game opens the selection screen.

- [ ] **Step 9: Run fast static checks**

Run:

```bash
pnpm run typecheck
pnpm run lint
```

Expected: both commands complete successfully.

- [ ] **Step 10: Commit the completed behavior**

Run:

```bash
git add e2e/sudoku.e2e.ts src/pages/Game.tsx src/pages/Game/GameCompletionPanel.tsx src/pages/Game/GameWonOverlay.tsx src/locales/de.json src/locales/en.json src/locales/es.json src/locales/fr.json src/locales/it.json src/locales/pt.json src/locales/zh.json
git commit -m "feat: replace win overlay with completion panel"
```

Expected: one commit containing passing completion-panel behavior, the game-screen swap, old overlay removal, and locale keys.

---

### Task 2: Completion Viewport Coverage And Full Verification

**Files:**

- Modify: `src/main.css`
- Modify: `e2e/sudoku.e2e.ts`

**Interfaces:**

- Consumes: `sudoku-game-layout-complete`, `sudoku-completion-pad`, `sudoku-completion-panel`, `sudoku-completion-copy`, and `sudoku-completion-actions` classes produced by Task 1.
- Produces: completed-state viewport coverage where mobile, tablet, and desktop portrait/landscape tests end on the completion screen and attach screenshots to the Playwright report.

- [ ] **Step 1: Add completion-screen viewport e2e coverage**

Add this test after the completion panel action tests in `e2e/sudoku.e2e.ts`:

```ts
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
    await expect(completionPanel).toBeVisible();
    await expect(completionPanel.getByRole("heading", {name: "Solved"})).toBeVisible();
    await expectWithinViewport(page, board, `${viewport.name} completed board`);
    await expectWithinViewport(page, completionPanel, `${viewport.name} completion panel`);
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

    if (viewport.landscape) {
      await expectLeftToRight([board, completionPanel], `${viewport.name} completion layout`);
      await expect(page.locator(".sudoku-completion-copy")).toHaveCSS("text-align", "center");
    }

    await testInfo.attach(`completion-${viewport.name.replaceAll(" ", "-")}`, {
      body: await page.screenshot({fullPage: true}),
      contentType: "image/png",
    });
  });
}
```

- [ ] **Step 2: Run the new viewport tests and verify the expected failure**

Run:

```bash
pnpm exec playwright test e2e/sudoku.e2e.ts --grep "completion screen"
```

Expected: the landscape viewport tests fail because the completed panel has not been assigned to the landscape control column and `.sudoku-completion-copy` is not centered.

- [ ] **Step 3: Add completed-state grid CSS**

In `src/main.css`, inside the existing compact landscape media block, add these rules after the `.sudoku-control-pad` rules:

```css
.sudoku-game-layout-complete {
  grid-template-areas:
    "board header"
    "board completion";
  grid-template-rows: auto minmax(0, 1fr);
}

.sudoku-completion-pad {
  grid-area: completion;
  min-height: 0;
}

.sudoku-game-layout-complete .sudoku-completion-panel {
  height: 100%;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
}

.sudoku-game-layout-complete .sudoku-completion-copy {
  display: grid;
  min-height: 0;
  align-content: center;
  justify-items: center;
  text-align: center;
}

.sudoku-game-layout-complete .sudoku-completion-actions {
  align-self: end;
}
```

Add this narrow portrait rule outside the compact landscape media block:

```css
@media (max-width: 420px) {
  .sudoku-completion-panel {
    grid-template-columns: minmax(0, 1fr);
  }

  .sudoku-completion-actions {
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  }
}
```

- [ ] **Step 4: Run responsive e2e coverage**

Run:

```bash
pnpm exec playwright test e2e/sudoku.e2e.ts --grep "completion screen|completion panel|starts the next game"
```

Expected: all completion-related e2e tests pass. The Playwright report includes attached completion-screen screenshots for mobile portrait, mobile landscape, tablet portrait, tablet landscape, desktop portrait, and desktop landscape.

- [ ] **Step 5: Run full verification**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm build
pnpm run test:e2e
```

Expected: all commands complete successfully.

- [ ] **Step 6: Commit the responsive layout**

Run:

```bash
git add src/main.css e2e/sudoku.e2e.ts
git commit -m "test: verify completion panel layout"
```

Expected: one commit containing the responsive CSS and six completion-screen viewport tests with screenshot attachments.

- [ ] **Step 7: Update issue #16**

After all checks pass, comment on issue #16 with:

```text
Implemented the completion panel design:
- replaced the full-board win overlay with a completed-state controls panel
- kept the solved board visible after completion
- added primary Next and secondary New game actions
- centered the completion copy in compact landscape/tablet layout
- updated Playwright coverage for completion actions and completion-screen screenshots across mobile, tablet, and desktop portrait/landscape viewports

Checks run:
- pnpm run typecheck
- pnpm run lint
- pnpm test
- pnpm build
- pnpm run test:e2e
```

Close issue #16 because the accepted design criteria are satisfied.
