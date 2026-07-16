// @vitest-environment jsdom

import * as React from "react";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {AppDialogProvider} from "src/components/AppDialog";
import {GameStateMachine} from "src/context/GameContext";
import {appPersistence} from "src/lib/persistence/appPersistence";

import SelectGame from "./SelectGame";

const navigate = vi.fn();
const multiplayer = vi.hoisted(() => {
  let connectHandler: (() => void) | undefined;
  let connectErrorHandler: ((error: Error) => void) | undefined;
  let acknowledgementHandler: ((result: unknown) => void) | undefined;
  let connectImmediately = true;
  let acknowledgeImmediately = true;
  const socket = {
    connect: vi.fn(() => {
      if (connectImmediately) {
        connectHandler?.();
      }
      return socket;
    }),
    disconnect: vi.fn(() => socket),
    emit: vi.fn((event: string, request: unknown, acknowledge: (result: unknown) => void) => {
      if (acknowledgeImmediately) {
        acknowledge({ok: true, snapshot: {roomCode: "ABC234"}});
      } else {
        acknowledgementHandler = acknowledge;
      }
      return socket;
    }),
    off: vi.fn((event: string, handler: (error?: Error) => void) => {
      if (event === "connect" && connectHandler === handler) {
        connectHandler = undefined;
      }
      if (event === "connect_error" && connectErrorHandler === handler) {
        connectErrorHandler = undefined;
      }
      return socket;
    }),
    once: vi.fn((event: string, handler: (error?: Error) => void) => {
      if (event === "connect") {
        connectHandler = handler as () => void;
      }
      if (event === "connect_error") {
        connectErrorHandler = handler as (error: Error) => void;
      }
      return socket;
    }),
  };
  return {
    holdAcknowledgement: () => {
      acknowledgeImmediately = false;
    },
    holdConnection: () => {
      connectImmediately = false;
    },
    reset: () => {
      connectHandler = undefined;
      connectErrorHandler = undefined;
      acknowledgementHandler = undefined;
      connectImmediately = true;
      acknowledgeImmediately = true;
    },
    resolveAcknowledgement: (result: unknown = {ok: true, snapshot: {roomCode: "ABC234"}}) =>
      acknowledgementHandler?.(result),
    resolveConnection: () => connectHandler?.(),
    socket,
  };
});

vi.mock("@tanstack/react-router", () => ({useNavigate: () => navigate}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
vi.mock("src/components/DarkModeButton", () => ({DarkModeButton: () => null}));
vi.mock("src/utils/hooks", () => ({useElementWidth: () => 120}));
vi.mock("src/lib/multiplayer/createMultiplayerSocket", () => ({
  createMultiplayerSocket: () => multiplayer.socket,
}));
vi.mock("src/lib/multiplayer/guestIdentity", () => ({
  getOrCreateBrowserGuestId: () => "123e4567-e89b-42d3-a456-426614174000",
}));

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {configurable: true, value: online});
}

function renderSelectGame() {
  return render(
    <AppDialogProvider>
      <SelectGame />
    </AppDialogProvider>,
  );
}

beforeEach(() => {
  window.location.hash = "#/select-game";
  navigate.mockReset();
  multiplayer.reset();
  multiplayer.socket.connect.mockClear();
  multiplayer.socket.disconnect.mockClear();
  multiplayer.socket.emit.mockClear();
  multiplayer.socket.off.mockClear();
  multiplayer.socket.once.mockClear();
  setOnline(true);
  vi.spyOn(appPersistence.collections, "loadIndex").mockReturnValue([{id: "custom-one", name: "My puzzles"}]);
  vi.spyOn(appPersistence.collections, "load").mockReturnValue({
    id: "custom-one",
    name: "My puzzles",
    sudokusRaw: "534920700060007309900000010008700000496803002721594806000200940800046100003000000",
  });
  vi.spyOn(appPersistence.playedSudokus, "load").mockReturnValue({
    game: {
      activeCellCoordinates: undefined,
      clipboardNotes: null,
      notesMode: false,
      previousTimes: [50],
      secondsPlayed: 75,
      showMenu: false,
      showNotes: false,
      state: GameStateMachine.paused,
      sudokuCollectionName: "easy",
      sudokuIndex: 0,
      timesSolved: 1,
      won: false,
    },
    sudoku: [],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SelectGame", () => {
  it("returns terminal room failures to Join Existing with the attempted code preserved", () => {
    window.location.hash = "#/select-game?roomCode=ABC234&roomError=ROOM_FULL";

    renderSelectGame();

    expect(screen.getByRole("button", {name: "select_mode_join_online"}).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("multiplayer_room_code") as HTMLInputElement).value).toBe("ABC234");
    expect(screen.getByRole("alert").textContent).toBe("multiplayer_room_full");
  });

  it("shows custom collections and progress in Solo, but only clean base cards in Create Online", async () => {
    const user = userEvent.setup();
    renderSelectGame();

    expect(screen.getByTestId("select-game-collection-custom-one")).toBeTruthy();
    expect(screen.getByTestId("select-game-card-status-1")).toBeTruthy();
    await user.click(screen.getByTestId("select-game-collection-custom-one"));

    await user.click(screen.getByRole("button", {name: "select_mode_create_online"}));

    expect(screen.queryByTestId("select-game-collection-custom-one")).toBeNull();
    expect(screen.queryByTestId("select-game-card-status-1")).toBeNull();
    expect(screen.getByTestId("select-game-collection-easy").className).toContain("bg-white");
    for (const id of ["easy", "medium", "hard", "expert", "evil"]) {
      expect(screen.getByTestId(`select-game-collection-${id}`)).toBeTruthy();
    }
  });

  it("hides collection tabs and puzzle cards in Join Existing", async () => {
    const user = userEvent.setup();
    renderSelectGame();

    await user.click(screen.getByRole("button", {name: "select_mode_join_online"}));

    expect(screen.queryByTestId("select-game-grid")).toBeNull();
    expect(screen.queryByTestId("select-game-collection-easy")).toBeNull();
    expect(screen.getByLabelText("multiplayer_room_code")).toBeTruthy();
  });

  it("creates from the canonical puzzle identity and disconnects the temporary socket", async () => {
    const user = userEvent.setup();
    renderSelectGame();

    await user.click(screen.getByRole("button", {name: "select_mode_create_online"}));
    await user.click(screen.getByTestId("sudoku-preview-1"));

    expect(multiplayer.socket.connect).toHaveBeenCalledOnce();
    expect(multiplayer.socket.emit).toHaveBeenCalledWith(
      "room:create",
      expect.objectContaining({
        collectionId: "easy",
        connectionId: expect.any(String),
        guestId: "123e4567-e89b-42d3-a456-426614174000",
        puzzleFingerprint: expect.stringMatching(/^\d{81}$/),
        puzzleNumber: 1,
      }),
      expect.any(Function),
    );
    expect(multiplayer.socket.disconnect).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith({to: "/room/$code", params: {code: "ABC234"}});
  });

  it("disables puzzle cards and synchronously ignores duplicate creation clicks", async () => {
    const user = userEvent.setup();
    multiplayer.holdConnection();
    renderSelectGame();

    await user.click(screen.getByRole("button", {name: "select_mode_create_online"}));
    const firstPuzzle = screen.getByTestId("sudoku-preview-1") as HTMLButtonElement;
    const secondPuzzle = screen.getByTestId("sudoku-preview-2") as HTMLButtonElement;

    act(() => {
      firstPuzzle.click();
      secondPuzzle.click();
    });

    await waitFor(() => expect(multiplayer.socket.connect).toHaveBeenCalledOnce());
    expect(firstPuzzle.disabled).toBe(true);
    expect(secondPuzzle.disabled).toBe(true);

    act(() => multiplayer.resolveConnection());
    await waitFor(() => expect(multiplayer.socket.disconnect).toHaveBeenCalledOnce());
    expect(multiplayer.socket.emit).toHaveBeenCalledOnce();
  });

  it("cancels creation on mode exit and ignores a late acknowledgement", async () => {
    const user = userEvent.setup();
    multiplayer.holdAcknowledgement();
    renderSelectGame();

    await user.click(screen.getByRole("button", {name: "select_mode_create_online"}));
    await user.click(screen.getByTestId("sudoku-preview-1"));
    await waitFor(() => expect(multiplayer.socket.emit).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", {name: "select_mode_join_online"}));

    expect(multiplayer.socket.disconnect).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("multiplayer_room_code")).toBeTruthy();
    expect(screen.getByRole("button", {name: "select_mode_create_online"})).toBeTruthy();

    act(() => multiplayer.resolveAcknowledgement());
    await act(async () => Promise.resolve());

    expect(navigate).not.toHaveBeenCalled();
  });

  it("times out a missing create acknowledgement and restores the picker", async () => {
    vi.useFakeTimers();
    multiplayer.holdAcknowledgement();
    renderSelectGame();

    fireEvent.click(screen.getByRole("button", {name: "select_mode_create_online"}));
    fireEvent.click(screen.getByTestId("sudoku-preview-1"));
    await vi.waitFor(() => expect(multiplayer.socket.emit).toHaveBeenCalledOnce());

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    expect(multiplayer.socket.disconnect).toHaveBeenCalledOnce();
    expect((screen.getByTestId("sudoku-preview-1") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("alert").textContent).toBe("multiplayer_service_unavailable");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("reacts to offline state without disabling Solo", async () => {
    setOnline(false);
    renderSelectGame();

    expect((screen.getByRole("button", {name: "select_mode_solo"}) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", {name: "select_mode_create_online"}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", {name: "select_mode_join_online"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("select-game-grid")).toBeTruthy();
  });
});
