import {describe, expect, it} from "vitest";

import {DEFAULT_USER_PREFERENCES} from "src/lib/database/userPreferences";
import {userPreferencesReducer} from "./UserPrefencesContext";

describe("userPreferencesReducer", () => {
  it("toggles each preference independently", () => {
    expect(userPreferencesReducer(DEFAULT_USER_PREFERENCES, {type: "user_preferences/TOGGLE_SHOW_HINTS"})).toEqual({
      ...DEFAULT_USER_PREFERENCES,
      showHints: true,
    });
    expect(userPreferencesReducer(DEFAULT_USER_PREFERENCES, {type: "user_preferences/TOGGLE_SHOW_OCCURRENCES"})).toEqual({
      ...DEFAULT_USER_PREFERENCES,
      showOccurrences: false,
    });
    expect(userPreferencesReducer(DEFAULT_USER_PREFERENCES, {type: "user_preferences/TOGGLE_SHOW_CONFLICTS"})).toEqual({
      ...DEFAULT_USER_PREFERENCES,
      showConflicts: false,
    });
    expect(userPreferencesReducer(DEFAULT_USER_PREFERENCES, {type: "user_preferences/TOGGLE_SHOW_CIRCLE_MENU"})).toEqual({
      ...DEFAULT_USER_PREFERENCES,
      showCircleMenu: true,
    });
    expect(userPreferencesReducer(DEFAULT_USER_PREFERENCES, {type: "user_preferences/TOGGLE_SHOW_WRONG_ENTRIES"})).toEqual({
      ...DEFAULT_USER_PREFERENCES,
      showWrongEntries: true,
    });
  });
});
