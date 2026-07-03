import React from "react";
import {renderToString} from "react-dom/server";
import {afterEach, describe, expect, it, vi} from "vitest";

import {DEFAULT_USER_PREFERENCES} from "src/lib/database/userPreferences";
import {UserPreferencesProvider} from "./UserPrefencesContext";

describe("UserPreferencesProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not save preferences synchronously while rendering", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem,
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
    });

    renderToString(
      React.createElement(UserPreferencesProvider, {
        initialState: DEFAULT_USER_PREFERENCES,
        children: React.createElement("div"),
      }),
    );

    expect(setItem).not.toHaveBeenCalled();
  });
});
