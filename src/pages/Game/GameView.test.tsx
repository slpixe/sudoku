// @vitest-environment jsdom

import * as React from "react";
import {act, cleanup, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, describe, expect, it, vi} from "vitest";

import {AppDialogProvider} from "src/components/AppDialog";
import {GameProvider, GameStateMachine, INITIAL_GAME_STATE} from "src/context/GameContext";
import {emptyGrid} from "src/context/SudokuContext";
import {TimerProvider} from "src/context/TimerContext";
import {DEFAULT_USER_PREFERENCES} from "src/lib/database/userPreferences";

import {SoloGameTimer} from "./GameTimer";
import {GameView, type GameViewProps} from "./GameView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("src/components/DarkModeButton", () => ({
  DarkModeButton: () => null,
}));

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type CommandCallbacks = Pick<
  GameViewProps,
  "onSetNumber" | "onSetNotes" | "onHint" | "onUndo" | "onPause" | "onResume" | "onClearConfirmed" | "onNewGame"
>;

function createProps(overrides: Partial<GameViewProps> = {}): GameViewProps {
  const cells = emptyGrid.map((cell, index) => ({
    ...cell,
    solution: (index % 9) + 1,
  }));

  return {
    activeCellCoordinates: {x: 0, y: 0},
    blocked: false,
    canUndo: true,
    cells,
    clipboardNotes: null,
    collectionName: "Easy",
    completionContent: <div data-testid="completion-content">Complete</div>,
    locked: false,
    notesMode: false,
    pauseForClearConfirmation: true,
    preferences: DEFAULT_USER_PREFERENCES,
    showMenu: false,
    status: GameStateMachine.running,
    sudokuIndex: 0,
    timerContent: <div data-testid="test-timer">01:05 min</div>,
    won: false,
    onActivateNotesMode: vi.fn(),
    onClearCell: vi.fn(),
    onClearConfirmed: vi.fn(),
    onCopyNotes: vi.fn(),
    onDeactivateNotesMode: vi.fn(),
    onHideMenu: vi.fn(),
    onHint: vi.fn(),
    onNewGame: vi.fn(),
    onPause: vi.fn(),
    onRedo: vi.fn(),
    onResume: vi.fn(),
    onResumeThisPuzzleHere: vi.fn(),
    onSelectCell: vi.fn(),
    onSetNotes: vi.fn(),
    onSetNumber: vi.fn(),
    onShowMenu: vi.fn(),
    onSwitchToActivePuzzle: vi.fn(),
    onToggleShowConflicts: vi.fn(),
    onToggleShowMatchingNumbers: vi.fn(),
    onToggleShowOccurrences: vi.fn(),
    onUndo: vi.fn(),
    ...overrides,
  };
}

function GameViewRenderSpy({onRender, viewProps}: {onRender: () => void; viewProps: GameViewProps}) {
  onRender();
  return <GameView {...viewProps} />;
}

function renderView(overrides: Partial<GameViewProps> = {}) {
  const props = createProps(overrides);
  const result = render(
    <AppDialogProvider>
      <GameView {...props} />
    </AppDialogProvider>,
  );

  return {props, ...result};
}

describe("GameView", () => {
  it("delegates number, hint, undo, pause, confirmed Clear, and New Game commands", async () => {
    const user = userEvent.setup();
    const {props} = renderView();
    const callbacks = props as GameViewProps & CommandCallbacks;

    await user.click(screen.getByTestId("sudoku-number-4"));
    expect(callbacks.onSetNumber).toHaveBeenCalledWith({x: 0, y: 0}, 4);

    await user.click(screen.getByTestId("sudoku-control-hint"));
    expect(callbacks.onHint).toHaveBeenCalledWith({x: 0, y: 0});

    await user.click(screen.getByTestId("sudoku-control-undo"));
    expect(callbacks.onUndo).toHaveBeenCalledOnce();

    await user.click(screen.getByTestId("sudoku-action-pause"));
    expect(callbacks.onPause).toHaveBeenCalledOnce();

    await user.click(screen.getByTestId("sudoku-action-clear"));
    await user.click(screen.getByTestId("app-dialog-confirm"));
    expect(callbacks.onClearConfirmed).toHaveBeenCalledOnce();

    await user.click(screen.getByTestId("sudoku-action-new-game"));
    expect(callbacks.onNewGame).toHaveBeenCalledOnce();
  });

  it("delegates note input while notes mode is active", async () => {
    const user = userEvent.setup();
    const {props} = renderView({notesMode: true});

    await user.click(screen.getByTestId("sudoku-number-3"));

    expect(props.onSetNotes).toHaveBeenCalledWith({x: 0, y: 0}, [3]);
  });

  it("delegates resume from the paused header", async () => {
    const user = userEvent.setup();
    const {props} = renderView({status: GameStateMachine.paused});

    await user.click(screen.getByTestId("sudoku-action-pause"));

    expect(props.onResume).toHaveBeenCalledOnce();
  });

  it("does not clear when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const {props} = renderView();

    await user.click(screen.getByTestId("sudoku-action-clear"));
    await user.click(screen.getByTestId("app-dialog-cancel"));

    expect(props.onClearConfirmed).not.toHaveBeenCalled();
  });

  it("blocks shared mutations while keeping local New Game available", async () => {
    const user = userEvent.setup();
    const {props} = renderView({blocked: true});

    await user.click(screen.getByTestId("sudoku-number-4"));
    await user.click(screen.getByTestId("sudoku-control-notes"));
    await user.click(screen.getByTestId("sudoku-control-hint"));
    await user.click(screen.getByTestId("sudoku-control-undo"));
    await user.click(screen.getByTestId("sudoku-action-pause"));
    await user.click(screen.getByTestId("sudoku-action-new-game"));

    expect(props.onSetNumber).not.toHaveBeenCalled();
    expect(props.onActivateNotesMode).not.toHaveBeenCalled();
    expect(props.onHint).not.toHaveBeenCalled();
    expect(props.onUndo).not.toHaveBeenCalled();
    expect(props.onPause).not.toHaveBeenCalled();
    expect(props.onNewGame).toHaveBeenCalledOnce();
  });

  it("blocks all game actions while the solo active-game lock is shown", async () => {
    const user = userEvent.setup();
    const {props} = renderView({locked: true});

    await user.click(screen.getByTestId("sudoku-number-4"));
    await user.click(screen.getByTestId("sudoku-control-hint"));
    await user.click(screen.getByTestId("sudoku-control-undo"));
    await user.click(screen.getByTestId("sudoku-action-pause"));
    await user.click(screen.getByTestId("sudoku-action-new-game"));

    expect(props.onSetNumber).not.toHaveBeenCalled();
    expect(props.onHint).not.toHaveBeenCalled();
    expect(props.onUndo).not.toHaveBeenCalled();
    expect(props.onPause).not.toHaveBeenCalled();
    expect(props.onNewGame).not.toHaveBeenCalled();
  });

  it("hides partner presence while paused and restores it on resume", () => {
    const {props, rerender} = renderView({partnerCellCoordinates: {x: 1, y: 0}});
    const renderProps = (status: GameStateMachine) => (
      <AppDialogProvider>
        <GameView {...props} status={status} />
      </AppDialogProvider>
    );
    expect(screen.getByTestId("sudoku-cell-1-0").getAttribute("data-cell-partner-active")).toBe("true");
    rerender(renderProps(GameStateMachine.paused));
    expect(screen.getByTestId("sudoku-cell-1-0").getAttribute("data-cell-partner-active")).toBe("false");
    rerender(renderProps(GameStateMachine.running));
    expect(screen.getByTestId("sudoku-cell-1-0").getAttribute("data-cell-partner-active")).toBe("true");
  });

  it("keeps timer updates inside the solo timer leaf", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T12:00:00Z"));
    const onViewRender = vi.fn();
    const viewProps = createProps({timerContent: <SoloGameTimer />});

    render(
      <GameProvider initialState={{...INITIAL_GAME_STATE, state: GameStateMachine.running}}>
        <TimerProvider>
          <AppDialogProvider>
            <GameViewRenderSpy onRender={onViewRender} viewProps={viewProps} />
          </AppDialogProvider>
        </TimerProvider>
      </GameProvider>,
    );

    expect(onViewRender).toHaveBeenCalledOnce();
    expect(screen.getByTestId("game-timer").textContent).toBe("00:00 min");

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByTestId("game-timer").textContent).toBe("00:01 min");
    expect(onViewRender).toHaveBeenCalledOnce();
  });
});
