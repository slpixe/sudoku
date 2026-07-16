// @vitest-environment jsdom

import {cleanup, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import MultiplayerGame from "./MultiplayerGame";

const testState = vi.hoisted(() => ({
  code: "abc234",
  navigate: vi.fn(),
  room: {
    confirmed: null,
    projected: null,
    status: "connecting" as const,
    presence: 0 as const,
    error: null as null | {code: "ROOM_NOT_FOUND" | "ROOM_EXPIRED" | "ROOM_FULL"; message: string},
    send: vi.fn(),
  },
  useRoom: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => testState.navigate,
  useParams: () => ({code: testState.code}),
}));

vi.mock("react-i18next", () => ({useTranslation: () => ({t: (key: string) => key})}));

vi.mock("src/lib/multiplayer/useMultiplayerRoom", () => ({
  useMultiplayerRoom: (roomCode: string) => {
    testState.useRoom(roomCode);
    return testState.room;
  },
}));

vi.mock("./Game/MultiplayerGameController", () => ({
  MultiplayerGameController: ({onNewGame, onRetry}: {onNewGame: () => void; onRetry: () => void}) => (
    <div>
      <button onClick={onNewGame}>new game</button>
      <button onClick={onRetry}>retry</button>
    </div>
  ),
}));

beforeEach(() => {
  testState.code = "abc234";
  testState.navigate.mockReset();
  testState.useRoom.mockReset();
  testState.room.error = null;
  testState.room.send.mockReset();
});

afterEach(cleanup);

describe("MultiplayerGame route", () => {
  it("normalizes a valid room parameter before mounting the room hook", () => {
    render(<MultiplayerGame />);

    expect(testState.useRoom).toHaveBeenCalledWith("ABC234");
    expect(testState.navigate).not.toHaveBeenCalled();
  });

  it.each(["ROOM_NOT_FOUND", "ROOM_EXPIRED", "ROOM_FULL"] as const)(
    "returns %s to Join Existing with the attempted code preserved",
    async (roomError) => {
      testState.code = "abc234";
      testState.room.error = {code: roomError, message: "Cannot join"};
      render(<MultiplayerGame />);

      await waitFor(() =>
        expect(testState.navigate).toHaveBeenCalledWith({
          to: "/select-game",
          search: {roomCode: "ABC234", roomError},
          replace: true,
        }),
      );
    },
  );

  it("preserves an invalid attempted route code when returning to Join Existing", async () => {
    testState.code = "abc01!";
    render(<MultiplayerGame />);

    await waitFor(() =>
      expect(testState.navigate).toHaveBeenCalledWith({
        to: "/select-game",
        search: {roomCode: "ABC01!", roomError: "INVALID_REQUEST"},
        replace: true,
      }),
    );
    expect(testState.useRoom).not.toHaveBeenCalled();
  });

  it("reconstructs the room hook on Retry and navigates away on New Game without a shared command", async () => {
    const user = userEvent.setup();
    render(<MultiplayerGame />);

    await user.click(screen.getByRole("button", {name: "retry"}));
    expect(testState.useRoom).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", {name: "new game"}));
    expect(testState.navigate).toHaveBeenCalledWith({to: "/select-game"});
    expect(testState.room.send).not.toHaveBeenCalled();
  });
});
