import * as React from "react";
import {useTranslation} from "react-i18next";

import Button from "src/components/Button";
import {formatDuration} from "src/utils/format";

export interface MultiplayerCompletionPanelProps {
  elapsedMs: number;
  onNewGame: () => void;
}

export function MultiplayerCompletionPanel({elapsedMs, onNewGame}: MultiplayerCompletionPanelProps) {
  const {t} = useTranslation();
  const panelRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>("[data-completion-primary-action='true']")?.focus();
  }, []);

  return (
    <section
      aria-labelledby="multiplayer-completion-title"
      className="sudoku-completion-panel grid min-h-0 gap-3 rounded-sm bg-gray-700/35 p-3 text-white sm:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)]"
      data-testid="multiplayer-completion-panel"
      ref={panelRef}
    >
      <div className="sudoku-completion-copy rounded-sm bg-white p-3 text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white">
        <div role="status">
          <h2 className="text-base font-bold leading-tight sm:text-lg" id="multiplayer-completion-title">
            {t("completion_solved")}
          </h2>
          <p className="sudoku-completion-metric mt-2">
            <span className="sudoku-completion-metric-label">{t("this_time_label")}</span>{" "}
            <span className="sudoku-completion-metric-value">{formatDuration(elapsedMs / 1000)}</span>
          </p>
        </div>
      </div>
      <div className="sudoku-completion-actions grid min-w-0 content-center gap-2 sm:min-w-36">
        <Button
          className="min-h-11 w-full px-3 py-2 text-sm sm:text-base"
          data-completion-primary-action="true"
          onClick={onNewGame}
        >
          {t("new_game")}
        </Button>
      </div>
    </section>
  );
}
