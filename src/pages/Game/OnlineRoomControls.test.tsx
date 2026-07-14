// @vitest-environment jsdom

import * as React from "react";
import {cleanup, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, describe, expect, it, vi} from "vitest";

import {OnlineRoomControls} from "./OnlineRoomControls";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

afterEach(cleanup);

describe("OnlineRoomControls", () => {
  it("exposes the three modes as accessible pressed-state actions", async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<OnlineRoomControls creating={false} mode="solo" online onJoin={vi.fn()} onModeChange={onModeChange} />);

    expect(screen.getByRole("button", {name: "select_mode_solo"}).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", {name: "select_mode_create_online"}));
    await user.click(screen.getByRole("button", {name: "select_mode_join_online"}));

    expect(onModeChange).toHaveBeenNthCalledWith(1, "create-online");
    expect(onModeChange).toHaveBeenNthCalledWith(2, "join-online");
  });

  it("normalizes a valid room code and rejects invalid characters before joining", async () => {
    const onJoin = vi.fn();
    const user = userEvent.setup();

    render(<OnlineRoomControls creating={false} mode="join-online" online onJoin={onJoin} onModeChange={vi.fn()} />);

    const input = screen.getByLabelText("multiplayer_room_code");
    await user.type(input, "abc01!");
    await user.click(screen.getByRole("button", {name: "multiplayer_join"}));
    expect(onJoin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("multiplayer_invalid_room_code");

    await user.clear(input);
    await user.type(input, "abc234");
    expect((input as HTMLInputElement).value).toBe("ABC234");
    await user.click(screen.getByRole("button", {name: "multiplayer_join"}));
    expect(onJoin).toHaveBeenCalledWith("ABC234");
  });

  it("keeps Solo available while disabling online actions offline", () => {
    render(<OnlineRoomControls creating={false} mode="solo" online={false} onJoin={vi.fn()} onModeChange={vi.fn()} />);

    expect((screen.getByRole("button", {name: "select_mode_solo"}) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", {name: "select_mode_create_online"}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", {name: "select_mode_join_online"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("multiplayer_online_required")).toBeTruthy();
  });
});
