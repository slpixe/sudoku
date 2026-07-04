import * as React from "react";

import {useNavigate} from "@tanstack/react-router";
import {useTranslation} from "react-i18next";
import Button from "src/components/Button";
import type {GameState} from "src/context/GameContext";
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
