import * as React from "react";

import {useNavigate} from "@tanstack/react-router";
import {useTranslation} from "react-i18next";
import {useAppDialog} from "src/components/AppDialog";
import Button from "src/components/Button";
import {DarkModeButton} from "src/components/DarkModeButton";
import {UndoButton} from "src/components/sudoku/SudokuMenuControls";
import {GameState, GameStateMachine} from "src/context/GameContext";
import {SudokuState} from "src/context/SudokuContext";
import {SimpleSudoku} from "src/lib/engine/types";
import {cellsToSimpleSudoku} from "src/lib/engine/utility";
import {solve} from "src/lib/engine/solverAC3";

import GameTimer from "./GameTimer";

const PauseIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
  </svg>
);

const ResumeIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5l11 7-11 7z" />
  </svg>
);

const topBarActionButtonClass = "inline-flex h-8 shrink-0 min-h-0 items-center justify-center leading-none";

function PauseButton({
  disabled,
  paused,
  pauseGame,
  continueGame,
}: {
  disabled: boolean;
  paused: boolean;
  pauseGame: () => void;
  continueGame: () => void;
}) {
  const {t} = useTranslation();
  return (
    <Button
      aria-label={paused ? t("continue") : t("pause")}
      className={topBarActionButtonClass}
      data-testid="sudoku-action-pause"
      disabled={disabled}
      onClick={paused ? continueGame : pauseGame}
    >
      <span className="sr-only">{paused ? t("continue") : t("pause")}</span>
      {paused ? <ResumeIcon /> : <PauseIcon />}
    </Button>
  );
}

const ClearGameButton: React.FC<{
  clearGame: () => void;
  pauseGame: () => void;
  continueGame: () => void;
  disabled: boolean;
}> = ({clearGame, pauseGame, continueGame, disabled}) => {
  const {t} = useTranslation();
  const dialog = useAppDialog();
  const disabledRef = React.useRef(disabled);

  React.useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const clearGameLocal = async () => {
    if (disabledRef.current) {
      return;
    }

    pauseGame();
    const areYouSure = await dialog.confirm({message: t("confirm_clear")});
    if (disabledRef.current) {
      return;
    }

    if (!areYouSure) {
      continueGame();
      return;
    }

    clearGame();
  };

  return (
    <Button
      className={topBarActionButtonClass}
      data-testid="sudoku-action-clear"
      disabled={disabled}
      onClick={clearGameLocal}
    >
      {t("clear")}
    </Button>
  );
};

const NewGameButton: React.FC<{pauseGame: () => void; disabled?: boolean}> = ({pauseGame, disabled}) => {
  const navigate = useNavigate();
  const {t} = useTranslation();

  const pauseAndChoose = async () => {
    pauseGame();
    await navigate({
      to: "/select-game",
    });
  };

  return (
    <Button
      className={`bg-teal-600 dark:bg-teal-600 text-white ${topBarActionButtonClass}`}
      data-testid="sudoku-action-new-game"
      disabled={disabled}
      onClick={pauseAndChoose}
    >
      {t("new_game")}
    </Button>
  );
};

const DifficultyShow = ({children, ...props}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="text-white capitalize" {...props}>
    {children}
  </div>
);

export const GameHeader: React.FC<{
  game: GameState;
  sudokuState: SudokuState;
  collectionName: string;
  pauseGame: () => void;
  continueGame: () => void;
  setSudoku: (sudoku: SimpleSudoku, solvedSudoku: SimpleSudoku) => void;
  resetGame: () => void;
  canUndo: boolean;
  undo: () => void;
  locked: boolean;
}> = ({game, sudokuState, collectionName, pauseGame, continueGame, setSudoku, resetGame, canUndo, undo, locked}) => {
  const clearGame = () => {
    const simpleSudoku = cellsToSimpleSudoku(sudokuState.current);
    const solved = solve(simpleSudoku);
    if (solved.sudoku) {
      setSudoku(simpleSudoku, solved.sudoku);
    }
    resetGame();
  };

  return (
    <header
      className="sudoku-game-header flex items-center justify-between gap-2 pt-4 text-sm sm:text-base"
      data-testid="sudoku-game-header"
    >
      <div className="sudoku-header-meta flex min-w-0 items-center gap-2 text-white">
        <DifficultyShow className="truncate text-white capitalize" data-testid="current-game-label">
          {`${collectionName} #${game.sudokuIndex + 1}`}
        </DifficultyShow>
        <GameTimer />
      </div>
      <div className="sudoku-header-actions flex shrink-0 items-center gap-1 sm:gap-2">
        {!locked && <DarkModeButton />}
        <UndoButton
          canUndo={canUndo}
          className="sudoku-landscape-header-undo hidden min-h-0 px-2 py-1 text-sm sm:min-h-0 sm:px-2 sm:text-base md:min-h-0 md:px-2 md:py-1 md:text-base"
          disabled={locked || game.won || game.state === GameStateMachine.paused}
          testId="sudoku-action-undo"
          undo={undo}
        />
        <ClearGameButton
          pauseGame={pauseGame}
          continueGame={continueGame}
          disabled={locked || game.won || game.state === GameStateMachine.paused}
          clearGame={clearGame}
        />
        <PauseButton
          disabled={locked || game.won}
          paused={game.state === GameStateMachine.paused}
          continueGame={continueGame}
          pauseGame={pauseGame}
        />
        <NewGameButton pauseGame={pauseGame} disabled={locked} />
      </div>
    </header>
  );
};
