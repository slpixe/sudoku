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
  blocked = false,
  clearWhenInactive = false,
  locked = false,
  onClearConfirmed = vi.fn(),
  onNewGame = vi.fn(),
  onPause = vi.fn(),
  onResume = vi.fn(),
  onUndo = vi.fn(),
  pauseForClearConfirmation = true,
  status = GameStateMachine.running,
  won = false,
}: {
  blocked?: boolean;
  clearWhenInactive?: boolean;
  locked?: boolean;
  onClearConfirmed?: () => void;
  onNewGame?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onUndo?: () => void;
  pauseForClearConfirmation?: boolean;
  status?: GameStateMachine;
  won?: boolean;
} = {}) {
  render(
    <AppDialogProvider>
      <GameHeader
        blocked={blocked}
        canUndo
        clearWhenInactive={clearWhenInactive}
        locked={locked}
        pauseForClearConfirmation={pauseForClearConfirmation}
        puzzleLabel="E-1"
        status={status}
        timerContent={<div data-testid="test-timer">01:05 min</div>}
        won={won}
        onClearConfirmed={onClearConfirmed}
        onNewGame={onNewGame}
        onPause={onPause}
        onResume={onResume}
        onUndo={onUndo}
      />
    </AppDialogProvider>,
  );

  return {onClearConfirmed, onNewGame, onPause, onResume, onUndo};
}

describe("GameHeader", () => {
  it("uses no shared top padding", () => {
    renderHeader();
    const headerClasses = screen.getByTestId("sudoku-game-header").className.split(/\s+/);

    expect(headerClasses).not.toContain("pt-2");
    expect(headerClasses).not.toContain("pt-4");
  });

  it("shows the supplied stable puzzle label", () => {
    renderHeader();
    expect(screen.getByTestId("current-game-label").textContent).toBe("E-1");
  });

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

  it("confirms multiplayer Clear without pausing or resuming", async () => {
    const user = userEvent.setup();
    const callbacks = renderHeader({pauseForClearConfirmation: false});

    await user.click(screen.getByTestId("sudoku-action-clear"));
    await user.click(screen.getByTestId("app-dialog-confirm"));

    expect(callbacks.onClearConfirmed).toHaveBeenCalledOnce();
    expect(callbacks.onPause).not.toHaveBeenCalled();
    expect(callbacks.onResume).not.toHaveBeenCalled();
  });

  it("blocks shared mutations while keeping local New Game available", async () => {
    const user = userEvent.setup();
    const callbacks = renderHeader({blocked: true});

    await user.click(screen.getByTestId("sudoku-action-undo"));
    await user.click(screen.getByTestId("sudoku-action-clear"));
    await user.click(screen.getByTestId("sudoku-action-pause"));
    await user.click(screen.getByTestId("sudoku-action-new-game"));

    expect(callbacks.onUndo).not.toHaveBeenCalled();
    expect(callbacks.onClearConfirmed).not.toHaveBeenCalled();
    expect(callbacks.onPause).not.toHaveBeenCalled();
    expect(callbacks.onNewGame).toHaveBeenCalledOnce();
  });

  it("disables New Game while the solo active-game lock is shown", async () => {
    const user = userEvent.setup();
    const callbacks = renderHeader({locked: true});

    await user.click(screen.getByTestId("sudoku-action-new-game"));

    expect(callbacks.onNewGame).not.toHaveBeenCalled();
  });

  it("keeps Clear disabled for inactive solo games", async () => {
    const user = userEvent.setup();
    const callbacks = renderHeader({status: GameStateMachine.paused, won: true});

    await user.click(screen.getByTestId("sudoku-action-clear"));

    expect(callbacks.onClearConfirmed).not.toHaveBeenCalled();
    expect(screen.queryByTestId("app-dialog-confirm")).toBeNull();
  });

  it("allows explicitly configured multiplayer Clear while paused or completed", async () => {
    const user = userEvent.setup();
    const paused = renderHeader({
      clearWhenInactive: true,
      pauseForClearConfirmation: false,
      status: GameStateMachine.paused,
    });
    await user.click(screen.getByTestId("sudoku-action-clear"));
    await user.click(screen.getByTestId("app-dialog-confirm"));
    expect(paused.onClearConfirmed).toHaveBeenCalledOnce();

    cleanup();
    const completed = renderHeader({
      clearWhenInactive: true,
      pauseForClearConfirmation: false,
      status: GameStateMachine.paused,
      won: true,
    });
    await user.click(screen.getByTestId("sudoku-action-clear"));
    await user.click(screen.getByTestId("app-dialog-confirm"));
    expect(completed.onClearConfirmed).toHaveBeenCalledOnce();
  });
});
