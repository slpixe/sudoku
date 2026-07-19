import * as React from "react";

import {useTranslation} from "react-i18next";
import {useAppDialog} from "src/components/AppDialog";
import Button from "src/components/Button";
import {DarkModeButton} from "src/components/DarkModeButton";
import {UndoButton} from "src/components/sudoku/SudokuMenuControls";
import {GameStateMachine} from "src/context/GameContext";

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
  onClearConfirmed: () => void;
  onPause: () => void;
  onResume: () => void;
  pauseForConfirmation: boolean;
  disabled: boolean;
  blocked: boolean;
}> = ({onClearConfirmed, onPause, onResume, pauseForConfirmation, disabled, blocked}) => {
  const {t} = useTranslation();
  const dialog = useAppDialog();
  const disabledRef = React.useRef(disabled);
  const blockedRef = React.useRef(blocked);

  React.useEffect(() => {
    disabledRef.current = disabled;
    blockedRef.current = blocked;
  }, [blocked, disabled]);

  const confirmClear = async () => {
    if (disabledRef.current) {
      return;
    }

    if (pauseForConfirmation) {
      onPause();
    }
    const areYouSure = await dialog.confirm({message: t("confirm_clear")});

    if (!areYouSure) {
      if (pauseForConfirmation && !blockedRef.current) {
        onResume();
      }
      return;
    }

    if (blockedRef.current) {
      return;
    }

    onClearConfirmed();
  };

  return (
    <Button
      className={topBarActionButtonClass}
      data-testid="sudoku-action-clear"
      disabled={disabled}
      onClick={confirmClear}
    >
      {t("clear")}
    </Button>
  );
};

const NewGameButton: React.FC<{onNewGame: () => void; disabled?: boolean}> = ({onNewGame, disabled}) => {
  const {t} = useTranslation();

  return (
    <Button
      className={`bg-teal-600 dark:bg-teal-600 text-white ${topBarActionButtonClass}`}
      data-testid="sudoku-action-new-game"
      disabled={disabled}
      onClick={onNewGame}
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
  blocked: boolean;
  canUndo: boolean;
  clearWhenInactive?: boolean;
  locked: boolean;
  pauseForClearConfirmation: boolean;
  puzzleLabel: string;
  status: GameStateMachine;
  timerContent: React.ReactNode;
  won: boolean;
  onClearConfirmed: () => void;
  onNewGame: () => void;
  onPause: () => void;
  onResume: () => void;
  onUndo: () => void;
}> = ({
  blocked,
  canUndo,
  clearWhenInactive = false,
  locked,
  pauseForClearConfirmation,
  puzzleLabel,
  status,
  timerContent,
  won,
  onClearConfirmed,
  onNewGame,
  onPause,
  onResume,
  onUndo,
}) => {
  const interactionsBlocked = blocked || locked;
  const paused = status === GameStateMachine.paused;
  const clearBlocked = interactionsBlocked || (won && !clearWhenInactive);
  const clearDisabled = clearBlocked || (paused && !clearWhenInactive);
  return (
    <header
      className="sudoku-game-header flex items-center justify-between gap-2 text-sm sm:text-base"
      data-testid="sudoku-game-header"
    >
      <div className="sudoku-header-meta flex min-w-0 items-center gap-2 text-white">
        <DifficultyShow className="truncate text-white" data-testid="current-game-label">
          {puzzleLabel}
        </DifficultyShow>
        {timerContent}
      </div>
      <div className="sudoku-header-actions flex shrink-0 items-center gap-1 sm:gap-2">
        {!locked && <DarkModeButton />}
        <UndoButton
          canUndo={canUndo}
          className="sudoku-landscape-header-undo hidden min-h-0 px-2 py-1 text-sm sm:min-h-0 sm:px-2 sm:text-base md:min-h-0 md:px-2 md:py-1 md:text-base"
          disabled={interactionsBlocked || won || paused}
          testId="sudoku-action-undo"
          undo={onUndo}
        />
        <ClearGameButton
          blocked={clearBlocked}
          disabled={clearDisabled}
          onClearConfirmed={onClearConfirmed}
          onPause={onPause}
          onResume={onResume}
          pauseForConfirmation={pauseForClearConfirmation}
        />
        <PauseButton
          continueGame={onResume}
          disabled={interactionsBlocked || won}
          pauseGame={onPause}
          paused={paused}
        />
        <NewGameButton disabled={locked} onNewGame={onNewGame} />
      </div>
    </header>
  );
};
