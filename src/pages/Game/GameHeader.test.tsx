// @vitest-environment jsdom

import * as React from "react";
import {cleanup, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, describe, expect, it, vi} from "vitest";

import {AppDialogProvider} from "src/components/AppDialog";
import {GameStateMachine} from "src/context/GameContext";

import {GameHeader} from "./GameHeader";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("src/components/DarkModeButton", () => ({
  DarkModeButton: () => null,
}));

afterEach(cleanup);

function renderHeader({
  onClearConfirmed = vi.fn(),
  onNewGame = vi.fn(),
  onPause = vi.fn(),
  onResume = vi.fn(),
}: {
  onClearConfirmed?: () => void;
  onNewGame?: () => void;
  onPause?: () => void;
  onResume?: () => void;
} = {}) {
  render(
    <AppDialogProvider>
      <GameHeader
        blocked={false}
        canUndo
        collectionName="Easy"
        elapsedSeconds={65}
        locked={false}
        pauseForClearConfirmation
        status={GameStateMachine.running}
        sudokuIndex={0}
        won={false}
        onClearConfirmed={onClearConfirmed}
        onNewGame={onNewGame}
        onPause={onPause}
        onResume={onResume}
        onUndo={vi.fn()}
      />
    </AppDialogProvider>,
  );

  return {onClearConfirmed, onNewGame, onPause, onResume};
}

describe("GameHeader", () => {
  it("delegates confirmed Clear and New Game policy", async () => {
    const user = userEvent.setup();
    const callbacks = renderHeader();

    await user.click(screen.getByTestId("sudoku-action-clear"));
    expect(callbacks.onPause).toHaveBeenCalledOnce();
    await user.click(screen.getByTestId("app-dialog-confirm"));
    expect(callbacks.onClearConfirmed).toHaveBeenCalledOnce();

    await user.click(screen.getByTestId("sudoku-action-new-game"));
    expect(callbacks.onNewGame).toHaveBeenCalledOnce();
  });

  it("does not mutate the game when Clear is cancelled", async () => {
    const user = userEvent.setup();
    const callbacks = renderHeader();

    await user.click(screen.getByTestId("sudoku-action-clear"));
    await user.click(screen.getByTestId("app-dialog-cancel"));

    expect(callbacks.onClearConfirmed).not.toHaveBeenCalled();
    expect(callbacks.onResume).toHaveBeenCalledOnce();
  });
});
