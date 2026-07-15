// @vitest-environment jsdom
import * as React from "react";
import {cleanup, render, screen} from "@testing-library/react";
import {createInstance} from "i18next";
import {I18nextProvider} from "react-i18next";
import {afterEach, expect, it, vi} from "vitest";

import en from "src/locales/en.json";

import {MultiplayerStatus} from "./MultiplayerStatus";

afterEach(cleanup);

it("names the English copy action for the room link", async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: {en: {translation: en}},
    interpolation: {escapeValue: false},
  });

  render(
    <I18nextProvider i18n={i18n}>
      <MultiplayerStatus
        copyState="idle"
        error={null}
        online
        presence={2}
        roomCode="ABC234"
        status="connected"
        onCopyLink={vi.fn()}
        onRetry={vi.fn()}
      />
    </I18nextProvider>,
  );

  expect(screen.getByRole("button", {name: "Copy room link"})).toBe(screen.getByTestId("multiplayer-copy-button"));
});
