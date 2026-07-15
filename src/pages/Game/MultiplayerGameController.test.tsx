// @vitest-environment jsdom

import type {RoomBoard, RoomSnapshot} from "@sudoku/multiplayer-protocol";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {AppDialogProvider} from "src/components/AppDialog";
import {UserPreferencesProvider} from "src/context/UserPrefencesContext";
import {DEFAULT_USER_PREFERENCES} from "src/lib/database/userPreferences";
import type {UseMultiplayerRoomResult} from "src/lib/multiplayer/useMultiplayerRoom";

import {MultiplayerGameController, roomBoardToCells} from "./MultiplayerGameController";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: {count?: number; roomCode?: string; url?: string}) =>
      values?.count === undefined ? key : `${values.count}/2 connected`,
  }),
}));

vi.mock("src/components/DarkModeButton", () => ({DarkModeButton: () => null}));

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

function createBoard(): RoomBoard {
  const givens = Array<number>(81).fill(0);
  const solution = Array.from({length: 81}, (_, index) => (index % 9) + 1);
  givens[80] = solution[80];
  return {
    givens,
    solution,
    values: Array<number>(81).fill(0),
    notes: Array.from({length: 81}, () => []),
  };
}

function createSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    roomCode: "ABC234",
    collectionId: "easy",
    puzzleNumber: 1,
    board: createBoard(),
    revision: 1,
    status: "running",
    elapsedMs: 0,
    runningSince: null,
    serverNow: Date.now(),
    canUndo: true,
    connectedGuests: 1,
    expiresAt: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

function createRoom(overrides: Partial<UseMultiplayerRoomResult> = {}): UseMultiplayerRoomResult {
  const confirmed = createSnapshot();
  return {
    confirmed,
    projected: confirmed.board,
    status: "connected",
    presence: 1,
    error: null,
    send: vi.fn(() => null),
    ...overrides,
  };
}

function renderController(
  room: UseMultiplayerRoomResult,
  callbacks: {onNewGame?: () => void; onRetry?: () => void} = {},
) {
  const onNewGame = callbacks.onNewGame ?? vi.fn();
  const onRetry = callbacks.onRetry ?? vi.fn();
  const view = render(
    <AppDialogProvider>
      <UserPreferencesProvider initialState={DEFAULT_USER_PREFERENCES}>
        <MultiplayerGameController room={room} roomCode="ABC234" onNewGame={onNewGame} onRetry={onRetry} />
      </UserPreferencesProvider>
    </AppDialogProvider>,
  );
  return {onNewGame, onRetry, ...view};
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MultiplayerGameController", () => {
  it("converts protocol arrays to canonical view cells with shared visual semantics", () => {
    const board = createBoard();
    board.givens[0] = 1;
    board.values[1] = 2;
    board.notes[2] = [3, 7];

    const cells = roomBoardToCells(board);

    expect(cells[0]).toEqual({x: 0, y: 0, initial: true, number: 1, notes: [], solution: 1});
    expect(cells[1]).toEqual({x: 1, y: 0, initial: false, number: 2, notes: [], solution: 2});
    expect(cells[2]).toEqual({x: 2, y: 0, initial: false, number: 0, notes: [3, 7], solution: 3});
    expect(cells[10]).toMatchObject({x: 1, y: 1});

    board.notes[2].push(9);
    expect(cells[2].notes).toEqual([3, 7]);
  });

  it("maps number, shared notes, erase, hint, undo, pause, resume, and confirmed Clear to exact room actions", async () => {
    const user = userEvent.setup();
    const room = createRoom();
    const send = room.send as ReturnType<typeof vi.fn>;
    const view = renderController(room);

    await user.click(screen.getByTestId("sudoku-cell-0-0"));
    await user.click(screen.getByTestId("sudoku-number-4"));
    await user.click(screen.getByTestId("sudoku-control-notes"));
    await user.click(screen.getByTestId("sudoku-number-3"));
    await user.click(screen.getByTestId("sudoku-control-erase"));
    await user.click(screen.getByTestId("sudoku-control-hint"));
    await user.click(screen.getByTestId("sudoku-control-undo"));
    await user.click(screen.getByTestId("sudoku-action-pause"));

    const paused = createSnapshot({status: "paused"});
    view.rerender(
      <AppDialogProvider>
        <UserPreferencesProvider initialState={DEFAULT_USER_PREFERENCES}>
          <MultiplayerGameController
            room={{...room, confirmed: paused, projected: paused.board}}
            roomCode="ABC234"
            onNewGame={view.onNewGame}
            onRetry={view.onRetry}
          />
        </UserPreferencesProvider>
      </AppDialogProvider>,
    );
    await user.click(screen.getByTestId("sudoku-action-pause"));

    const running = createSnapshot();
    view.rerender(
      <AppDialogProvider>
        <UserPreferencesProvider initialState={DEFAULT_USER_PREFERENCES}>
          <MultiplayerGameController
            room={{...room, confirmed: running, projected: running.board}}
            roomCode="ABC234"
            onNewGame={view.onNewGame}
            onRetry={view.onRetry}
          />
        </UserPreferencesProvider>
      </AppDialogProvider>,
    );
    await user.click(screen.getByTestId("sudoku-action-clear"));
    await user.click(screen.getByTestId("app-dialog-confirm"));

    expect(send.mock.calls.map(([action]) => action)).toEqual([
      {type: "setNumber", cellIndex: 0, number: 4},
      {type: "setNotes", cellIndex: 0, notes: [3]},
      {type: "clearCell", cellIndex: 0},
      {type: "hint", cellIndex: 0},
      {type: "undo"},
      {type: "pause"},
      {type: "resume"},
      {type: "clear"},
    ]);
  });

  it("sends nothing when Clear is cancelled", async () => {
    const user = userEvent.setup();
    const room = createRoom();
    renderController(room);

    await user.click(screen.getByTestId("sudoku-action-clear"));
    await user.click(screen.getByTestId("app-dialog-cancel"));

    expect(room.send).not.toHaveBeenCalled();
  });

  it("leaves through New Game without pausing or clearing the room", async () => {
    const user = userEvent.setup();
    const room = createRoom();
    const {onNewGame} = renderController(room);

    await user.click(screen.getByTestId("sudoku-action-new-game"));

    expect(onNewGame).toHaveBeenCalledOnce();
    expect(room.send).not.toHaveBeenCalled();
  });

  it("keeps the last confirmed board visible while reconnecting and blocks mutations with Retry", async () => {
    const user = userEvent.setup();
    const board = createBoard();
    board.values[0] = 7;
    const confirmed = createSnapshot({board});
    const projected = {...board, values: [...board.values]};
    projected.values[0] = 8;
    const room = createRoom({confirmed, projected, status: "reconnecting"});
    const {onRetry} = renderController(room);

    expect(screen.getByTestId("sudoku-cell-value-0-0").textContent).toBe("7");
    expect(screen.getByRole("status").textContent).toContain("multiplayer_reconnecting");
    await user.click(screen.getByTestId("sudoku-cell-0-0"));
    await user.click(screen.getByTestId("sudoku-number-4"));
    await user.click(screen.getByRole("button", {name: "multiplayer_retry"}));

    expect(room.send).not.toHaveBeenCalled();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("blocks shared mutations and offers Retry for a service error on an open transport", async () => {
    const user = userEvent.setup();
    const room = createRoom({
      error: {code: "SERVICE_UNAVAILABLE", message: "Database unavailable"},
      status: "connected",
    });
    const {onRetry} = renderController(room);

    await user.click(screen.getByTestId("sudoku-cell-0-0"));
    await user.click(screen.getByTestId("sudoku-number-4"));
    await user.click(screen.getByRole("button", {name: "multiplayer_retry"}));

    expect(room.send).not.toHaveBeenCalled();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("hides the room board behind the existing shared pause overlay", () => {
    const paused = createSnapshot({status: "paused"});
    paused.board.values[0] = 7;
    renderController(createRoom({confirmed: paused, projected: paused.board}));

    expect(screen.getByTestId("continue-overlay").className).toContain("flex");
    expect(screen.getByTestId("sudoku-cell-value-0-0").textContent).toBe("");
  });

  it("updates room presence from one to two connected guests", () => {
    const room = createRoom({presence: 1});
    const view = renderController(room);
    expect(screen.getByText("1/2 connected")).toBeTruthy();

    view.rerender(
      <AppDialogProvider>
        <UserPreferencesProvider initialState={DEFAULT_USER_PREFERENCES}>
          <MultiplayerGameController
            room={{...room, presence: 2}}
            roomCode="ABC234"
            onNewGame={view.onNewGame}
            onRetry={view.onRetry}
          />
        </UserPreferencesProvider>
      </AppDialogProvider>,
    );
    expect(screen.getByText("2/2 connected")).toBeTruthy();
  });

  it("renders the completed room's shared elapsed time without solo history or best-time metrics", () => {
    const completed = createSnapshot({status: "completed", elapsedMs: 65_000, canUndo: false});
    renderController(createRoom({confirmed: completed, projected: completed.board}));

    expect(screen.getAllByText("01:05 min").length).toBeGreaterThan(0);
    expect(screen.getByTestId("multiplayer-completion-panel")).toBeTruthy();
    expect(screen.queryByTestId("sudoku-completion-best-time")).toBeNull();
    expect(screen.queryByTestId("sudoku-completion-solved-count")).toBeNull();
  });

  it("projects a running timer from the server clock offset without sending room mutations", () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const snapshot = createSnapshot({
      elapsedMs: 5_000,
      runningSince: 9_000,
      serverNow: 10_000,
      status: "running",
    });
    const room = createRoom({confirmed: snapshot, projected: snapshot.board});
    renderController(room);

    expect(screen.getByTestId("game-timer").textContent).toBe("00:06 min");
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId("game-timer").textContent).toBe("00:07 min");
    expect(room.send).not.toHaveBeenCalled();
  });

  it("copies the current hash room URL and announces success accessibly", async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {configurable: true, value: {writeText}});
    window.location.hash = "#/room/ABC234";

    try {
      renderController(createRoom());
      fireEvent.click(screen.getByRole("button", {name: "multiplayer_copy_link"}));

      await waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.href));
      expect(screen.getByRole("status").textContent).toContain("multiplayer_link_copied");
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        delete (navigator as {clipboard?: Clipboard}).clipboard;
      }
    }
  });

  it("announces the room URL as a fallback when the Clipboard API is unavailable", async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {configurable: true, value: undefined});

    try {
      renderController(createRoom());
      fireEvent.click(screen.getByRole("button", {name: "multiplayer_copy_link"}));

      await waitFor(() => expect(screen.getByRole("status").textContent).toContain("multiplayer_copy_link_fallback"));
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        delete (navigator as {clipboard?: Clipboard}).clipboard;
      }
    }
  });
});
