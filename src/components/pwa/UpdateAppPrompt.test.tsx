// @vitest-environment jsdom

import * as React from "react";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const pwa = vi.hoisted(() => ({
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(() => Promise.resolve()),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [true, pwa.setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: pwa.updateServiceWorker,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

import {UpdateAppPrompt, UpdateAppPromptView} from "./UpdateAppPrompt";

afterEach(() => {
  cleanup();
});

describe("UpdateAppPromptView", () => {
  it("renders nothing until a new service worker is waiting", () => {
    const html = renderToStaticMarkup(
      <UpdateAppPromptView
        actionLabel="Update now"
        dismissLabel="Close update prompt"
        message="A new version is ready."
        onDismiss={() => undefined}
        onUpdate={() => undefined}
        title="Update available"
        updating={false}
        visible={false}
      />,
    );

    expect(html).toBe("");
  });

  it("renders an accessible update action without using the application error screen", () => {
    const html = renderToStaticMarkup(
      <UpdateAppPromptView
        actionLabel="Update now"
        dismissLabel="Close update prompt"
        message="A new version is ready."
        onDismiss={() => undefined}
        onUpdate={() => undefined}
        title="Update available"
        updating={false}
        visible
      />,
    );

    expect(html).toContain('data-testid="pwa-update-toast"');
    expect(html).toContain('role="status"');
    expect(html).toContain('data-testid="pwa-update-action"');
    expect(html).toContain("Update available");
    expect(html).not.toContain("Something went wrong");
  });
});

describe("UpdateAppPrompt", () => {
  beforeEach(() => {
    pwa.setNeedRefresh.mockClear();
    pwa.updateServiceWorker.mockClear();
  });

  it("keeps the waiting worker inactive until the user accepts the update", () => {
    render(<UpdateAppPrompt />);

    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("pwa-update-action"));

    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("lets the user dismiss the prompt without activating the waiting worker", () => {
    render(<UpdateAppPrompt />);

    fireEvent.click(screen.getByTestId("pwa-update-dismiss"));

    expect(pwa.setNeedRefresh).toHaveBeenCalledWith(false);
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();
  });
});
