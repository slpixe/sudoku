import {describe, expect, it} from "vitest";

import {DEFAULT_USER_PREFERENCES} from "src/lib/database/userPreferences";
import {userPreferencesReducer} from "./UserPrefencesContext";

describe("userPreferencesReducer", () => {
  it("toggles only visible gameplay preferences independently", () => {
    expect(userPreferencesReducer(DEFAULT_USER_PREFERENCES, {type: "user_preferences/TOGGLE_SHOW_OCCURRENCES"})).toEqual({
      ...DEFAULT_USER_PREFERENCES,
      showOccurrences: false,
    });
    expect(userPreferencesReducer(DEFAULT_USER_PREFERENCES, {type: "user_preferences/TOGGLE_SHOW_CONFLICTS"})).toEqual({
      ...DEFAULT_USER_PREFERENCES,
      showConflicts: false,
    });
    expect(userPreferencesReducer(DEFAULT_USER_PREFERENCES, {type: "user_preferences/TOGGLE_SHOW_MATCHING_NUMBERS"})).toEqual({
      ...DEFAULT_USER_PREFERENCES,
      showMatchingNumbers: false,
    });
  });
});
