import * as React from "react";

import {useNavigate} from "@tanstack/react-router";
import {useTranslation} from "react-i18next";
import {useAppDialog} from "src/components/AppDialog";
import Button from "src/components/Button";
import {DarkModeButton} from "src/components/DarkModeButton";
import {GameState, GameStateMachine} from "src/context/GameContext";
import {SudokuState} from "src/context/SudokuContext";
import {SimpleSudoku} from "src/lib/engine/types";
import {cellsToSimpleSudoku} from "src/lib/engine/utility";
import {solve} from "src/lib/engine/solverAC3";

import GameTimer from "./GameTimer";

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
    <Button disabled={disabled} onClick={paused ? continueGame : pauseGame}>
      {paused ? t("continue") : t("pause")}
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

  const clearGameLocal = async () => {
    pauseGame();
    const areYouSure = await dialog.confirm({message: t("confirm_clear")});
    if (!areYouSure) {
      continueGame();
      return;
    }

    clearGame();
  };

  return (
    <Button disabled={disabled} onClick={clearGameLocal}>
      {t("clear")}
    </Button>
  );
};

const NewGameButton: React.FC<{pauseGame: () => void}> = ({pauseGame}) => {
  const navigate = useNavigate();
  const {t} = useTranslation();

  const pauseAndChoose = async () => {
    pauseGame();
    await navigate({
      to: "/select-game",
    });
  };

  return (
    <Button className="bg-teal-600 dark:bg-teal-600 text-white" onClick={pauseAndChoose}>
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
}> = ({game, sudokuState, collectionName, pauseGame, continueGame, setSudoku, resetGame}) => {
  const clearGame = () => {
    const simpleSudoku = cellsToSimpleSudoku(sudokuState.current);
    const solved = solve(simpleSudoku);
    if (solved.sudoku) {
      setSudoku(simpleSudoku, solved.sudoku);
    }
    resetGame();
  };

  return (
    <header className="flex items-center justify-between gap-2 pt-4 text-sm sm:text-base">
      <div className="flex min-w-0 items-center gap-2 text-white">
        <DifficultyShow className="truncate text-white capitalize" data-testid="current-game-label">
          {`${collectionName} #${game.sudokuIndex + 1}`}
        </DifficultyShow>
        <GameTimer />
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <DarkModeButton />
        <ClearGameButton
          pauseGame={pauseGame}
          continueGame={continueGame}
          disabled={game.won || game.state === GameStateMachine.paused}
          clearGame={clearGame}
        />
        <PauseButton
          disabled={game.won}
          paused={game.state === GameStateMachine.paused}
          continueGame={continueGame}
          pauseGame={pauseGame}
        />
        <NewGameButton pauseGame={pauseGame} />
      </div>
    </header>
  );
};
