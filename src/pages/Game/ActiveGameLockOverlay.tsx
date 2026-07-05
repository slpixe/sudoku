import * as React from "react";

import {useTranslation} from "react-i18next";
import Button from "src/components/Button";

export function ActiveGameLockOverlay({
  visible,
  onSwitchToActivePuzzle,
  onResumeThisPuzzleHere,
}: {
  visible: boolean;
  onSwitchToActivePuzzle: () => void;
  onResumeThisPuzzleHere: () => void;
}) {
  const {t} = useTranslation();

  if (!visible) {
    return null;
  }

  const titleId = "active-game-lock-title";
  const descriptionId = "active-game-lock-description";

  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="absolute inset-0 z-40 flex items-center justify-center bg-gray-950/70 px-4 text-center"
      data-testid="active-game-lock-overlay"
      role="dialog"
    >
      <div className="flex max-w-xs flex-col items-center gap-3 rounded-sm bg-gray-900 p-4 text-white shadow-lg">
        <div className="text-base font-semibold" id={titleId}>
          {t("active_game_locked_title")}
        </div>
        <div className="text-sm text-gray-200" id={descriptionId}>
          {t("active_game_locked_message")}
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button
            className="bg-teal-600 text-white dark:bg-teal-600"
            data-testid="active-game-lock-switch"
            onClick={onSwitchToActivePuzzle}
          >
            {t("active_game_switch")}
          </Button>
          <Button data-testid="active-game-lock-resume" onClick={onResumeThisPuzzleHere}>
            {t("active_game_resume_here")}
          </Button>
        </div>
      </div>
    </div>
  );
}
