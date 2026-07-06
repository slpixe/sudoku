import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {pwaManifest} from "src/pwa/manifest";

import {createInstallPromptController, InstallAppPromptView} from "./InstallAppPrompt";

function createBeforeInstallPromptEvent(prompt = vi.fn(() => Promise.resolve())) {
  const event = new Event("beforeinstallprompt", {cancelable: true});
  Object.defineProperty(event, "prompt", {value: prompt});
  return {event, prompt};
}

function createStorage(initialDismissed = false) {
  const values = new Map<string, string>();
  if (initialDismissed) {
    values.set("sudoku.pwaInstallPromptDismissed", "true");
  }

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe("InstallAppPromptView", () => {
  it("renders nothing before the browser reports installability", () => {
    const html = renderToStaticMarkup(
      <InstallAppPromptView
        installLabel="Install"
        message="Add Sudoku to your home screen."
        onDismiss={() => undefined}
        onInstall={() => undefined}
        title="Install Sudoku"
        visible={false}
      />,
    );

    expect(html).toBe("");
  });

  it("renders a dismissible floating install prompt when installable", () => {
    const html = renderToStaticMarkup(
      <InstallAppPromptView
        installLabel="Install"
        message="Add Sudoku to your home screen."
        onDismiss={() => undefined}
        onInstall={() => undefined}
        title="Install Sudoku"
        visible
      />,
    );

    expect(html).toContain('data-testid="pwa-install-toast"');
    expect(html).toContain('data-testid="pwa-install-action"');
    expect(html).toContain('data-testid="pwa-install-dismiss"');
    expect(html).toContain("Install Sudoku");
  });
});

describe("createInstallPromptController", () => {
  it("captures beforeinstallprompt, prevents default browser mini-infobar behavior, and prompts once", async () => {
    const target = new EventTarget();
    const storage = createStorage();
    const {event, prompt} = createBeforeInstallPromptEvent();
    const controller = createInstallPromptController({storage, target});
    const changes: boolean[] = [];

    const unsubscribe = controller.subscribe(() => {
      changes.push(controller.isVisible());
    });
    const stop = controller.start();

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(controller.isVisible()).toBe(true);
    expect(changes).toEqual([true]);

    await expect(controller.promptInstall()).resolves.toBe(true);

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(controller.isVisible()).toBe(false);
    expect(changes).toEqual([true, false]);
    expect(storage.setItem).toHaveBeenCalledWith("sudoku.pwaInstallPromptDismissed", "true");

    unsubscribe();
    stop();
  });

  it("persists close-button dismissal and does not show again", () => {
    const target = new EventTarget();
    const storage = createStorage();
    const {event} = createBeforeInstallPromptEvent();
    const controller = createInstallPromptController({storage, target});
    const stop = controller.start();

    target.dispatchEvent(event);
    controller.dismiss();
    target.dispatchEvent(createBeforeInstallPromptEvent().event);

    expect(controller.isVisible()).toBe(false);
    expect(storage.setItem).toHaveBeenCalledWith("sudoku.pwaInstallPromptDismissed", "true");

    stop();
  });

  it("stays hidden when the prompt was previously dismissed", () => {
    const target = new EventTarget();
    const storage = createStorage(true);
    const {event} = createBeforeInstallPromptEvent();
    const controller = createInstallPromptController({storage, target});
    const stop = controller.start();

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(controller.isVisible()).toBe(false);

    stop();
  });

  it("clears the install affordance after appinstalled", () => {
    const target = new EventTarget();
    const storage = createStorage();
    const {event} = createBeforeInstallPromptEvent();
    const controller = createInstallPromptController({storage, target});
    const stop = controller.start();

    target.dispatchEvent(event);
    target.dispatchEvent(new Event("appinstalled"));

    expect(controller.isVisible()).toBe(false);
    expect(storage.setItem).toHaveBeenCalledWith("sudoku.pwaInstallPromptDismissed", "true");

    stop();
  });
});

describe("pwaManifest", () => {
  it("includes richer install metadata for browser install surfaces", () => {
    expect(pwaManifest.display_override).toEqual(["standalone", "minimal-ui", "browser"]);
    expect(pwaManifest.categories).toContain("games");
    expect(pwaManifest.screenshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({form_factor: "wide", type: "image/png"}),
        expect.objectContaining({form_factor: "narrow", type: "image/png"}),
      ]),
    );
    expect(pwaManifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sizes: "512x512",
          purpose: expect.stringContaining("maskable"),
        }),
      ]),
    );
  });
});
