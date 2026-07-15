// @vitest-environment jsdom
import * as React from "react";
import {cleanup, render, screen} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import {MultiplayerStatus} from "./MultiplayerStatus";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: {count?: number}) => (values?.count === undefined ? key : `${key}:${values.count}`),
  }),
}));

afterEach(cleanup);

it("renders the compact room status with in-button copy feedback", () => {
  render(
    <MultiplayerStatus
      copyState="copied"
      error={null}
      online
      presence={2}
      roomCode="ABC234"
      status="connected"
      onCopyLink={vi.fn()}
      onRetry={vi.fn()}
    />,
  );

  expect(screen.getByTestId("multiplayer-primary-row").textContent).toContain("multiplayer_room_label");
  expect(screen.getByTestId("multiplayer-primary-row").textContent).toContain("ABC234");
  expect(screen.getByTestId("multiplayer-primary-row").textContent).toContain("multiplayer_presence_fraction");
  expect(screen.getByTestId("multiplayer-copy-button").textContent).toContain("multiplayer_copied");
  expect(screen.getByTestId("multiplayer-copy-announcement").textContent).toContain("multiplayer_link_copied");
  expect(screen.getByTestId("multiplayer-copy-announcement").closest('[role="status"]')).toBeNull();
  expect(screen.queryByText(/https?:\/\//)).toBeNull();
});

it("scopes live connection status to the recovery row", () => {
  render(
    <MultiplayerStatus
      copyState="idle"
      error={null}
      online={false}
      presence={1}
      roomCode="ABC234"
      status="disconnected"
      onCopyLink={vi.fn()}
      onRetry={vi.fn()}
    />,
  );

  expect(screen.getByRole("status").textContent).toContain("multiplayer_online_required");
  expect(screen.getByTestId("multiplayer-copy-announcement").closest('[role="status"]')).toBeNull();
});
