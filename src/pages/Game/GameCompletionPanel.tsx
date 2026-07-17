import * as React from "react";

import {useNavigate} from "@tanstack/react-router";
import {useTranslation} from "react-i18next";
import Button from "src/components/Button";
import {translateCollectionName} from "src/lib/database/collections";
import {getSudokuPuzzleDisplayLabel} from "src/lib/game/collectionNames";
import {getSudokusPaginated, useSudokuCollections} from "src/lib/game/sudokus";
import {formatDuration} from "src/utils/format";
import {createCompactGameSearch} from "./gameRouteContract";

type NextSudokuParams = {
  collection: string;
  puzzle: number;
};

type CompletionMetricProps = {
  label: string;
  testId: string;
  value: string;
};

const CompletionMetric: React.FC<CompletionMetricProps> = ({label, testId, value}) => (
  <p className="sudoku-completion-metric" data-testid={testId}>
    <span className="sudoku-completion-metric-label" data-testid={`${testId}-label`}>
      {label}
    </span>{" "}
    <span className="sudoku-completion-metric-value" data-testid={`${testId}-value`}>
      {value}
    </span>
  </p>
);

function useNextSudoku(sudokuCollectionName: string, sudokuIndex: number) {
  const {getCollection} = useSudokuCollections();

  return React.useMemo(() => {
    try {
      const collection = getCollection(sudokuCollectionName);
      const collectionName = translateCollectionName(collection.name);
      const nextIndex = sudokuIndex + 1;
      const result = getSudokusPaginated(collection, nextIndex, 1);
      const sudoku = result.sudokus[0];

      if (!sudoku) {
        return {collectionName, nextPuzzleLabel: null, nextSudokuParams: null};
      }

      const nextPuzzleNumber = nextIndex + 1;
      const nextSudokuParams: NextSudokuParams = {
        collection: sudokuCollectionName,
        puzzle: nextPuzzleNumber,
      };

      return {
        collectionName,
        nextPuzzleLabel: getSudokuPuzzleDisplayLabel(sudokuCollectionName, nextPuzzleNumber),
        nextSudokuParams,
      };
    } catch (error) {
      console.error("Error calculating next sudoku:", error);
      return {
        collectionName: translateCollectionName(sudokuCollectionName),
        nextPuzzleLabel: null,
        nextSudokuParams: null,
      };
    }
  }, [getCollection, sudokuCollectionName, sudokuIndex]);
}

export type GameCompletionPanelProps = {
  previousTimes: number[];
  secondsPlayed: number;
  sudokuCollectionName: string;
  sudokuIndex: number;
  timesSolved: number;
};

export const GameCompletionPanel: React.FC<GameCompletionPanelProps> = ({
  previousTimes,
  secondsPlayed,
  sudokuCollectionName,
  sudokuIndex,
  timesSolved,
}) => {
  const navigate = useNavigate();
  const {t} = useTranslation();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const {collectionName, nextPuzzleLabel, nextSudokuParams} = useNextSudoku(sudokuCollectionName, sudokuIndex);
  const bestTime = previousTimes.length > 0 ? Math.min(...previousTimes) : null;
  const bestTimeValue = bestTime !== null ? formatDuration(bestTime) : null;
  const thisTimeValue = formatDuration(secondsPlayed);

  React.useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>("[data-completion-primary-action='true']")?.focus();
  }, [nextSudokuParams]);

  const goToNextSudoku = async () => {
    if (!nextSudokuParams) {
      return;
    }

    await navigate({
      to: "/",
      search: createCompactGameSearch(nextSudokuParams.collection, nextSudokuParams.puzzle),
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
        data-testid="sudoku-completion-copy"
        role="status"
      >
        <h2 className="text-base font-bold leading-tight sm:text-lg" id="sudoku-completion-title">
          {t("completion_solved")}
        </h2>
        <div className="mt-2 grid gap-1 text-sm leading-5">
          <CompletionMetric
            label={t("solved_count_label")}
            testId="sudoku-completion-solved-count"
            value={t(timesSolved === 1 ? "solved_count_value_one" : "solved_count_value_other", {
              count: timesSolved,
            })}
          />
          {bestTimeValue !== null ? (
            <CompletionMetric label={t("best_time_label")} testId="sudoku-completion-best-time" value={bestTimeValue} />
          ) : null}
          <CompletionMetric label={t("this_time_label")} testId="sudoku-completion-this-time" value={thisTimeValue} />
          {!nextSudokuParams ? <p>{t("collection_finished", {collection: collectionName})}</p> : null}
        </div>
      </div>

      <div
        className="sudoku-completion-actions grid min-w-0 content-center gap-2 sm:min-w-36"
        data-testid="sudoku-completion-actions"
      >
        {nextSudokuParams ? (
          <Button
            className="min-h-11 w-full bg-teal-700 px-3 py-2 text-sm text-white dark:bg-teal-600 sm:text-base"
            data-completion-primary-action="true"
            data-testid="sudoku-completion-next"
            onClick={goToNextSudoku}
          >
            {t("completion_next_sudoku", {puzzleLabel: nextPuzzleLabel})}
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
