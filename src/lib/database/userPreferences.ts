const STORAGE_KEY_USER_PREFERENCES = "sudoku-user-preferences";

export interface UserPreferences {
  showHints: boolean;
  showWrongEntries: boolean;
  showConflicts: boolean;
  showCircleMenu: boolean;
  showOccurrences: boolean;
  showMatchingNumbers: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  showHints: false,
  showWrongEntries: false,
  showConflicts: true,
  showCircleMenu: false,
  showOccurrences: true,
  showMatchingNumbers: true,
};

function fixedUserPreferences(preferences: unknown = {}): UserPreferences {
  const storedPreferences =
    preferences && typeof preferences === "object" ? (preferences as Partial<UserPreferences>) : undefined;

  return {
    ...DEFAULT_USER_PREFERENCES,
    showConflicts:
      typeof storedPreferences?.showConflicts === "boolean"
        ? storedPreferences.showConflicts
        : DEFAULT_USER_PREFERENCES.showConflicts,
    showOccurrences:
      typeof storedPreferences?.showOccurrences === "boolean"
        ? storedPreferences.showOccurrences
        : DEFAULT_USER_PREFERENCES.showOccurrences,
    showMatchingNumbers:
      typeof storedPreferences?.showMatchingNumbers === "boolean"
        ? storedPreferences.showMatchingNumbers
        : DEFAULT_USER_PREFERENCES.showMatchingNumbers,
  };
}

interface UserPreferencesRepository {
  getPreferences(): UserPreferences;
  savePreferences(preferences: UserPreferences): void;
}

export const localStorageUserPreferencesRepository: UserPreferencesRepository = {
  getPreferences(): UserPreferences {
    if (typeof localStorage === "undefined") {
      return DEFAULT_USER_PREFERENCES;
    }

    const storedPreferences = localStorage.getItem(STORAGE_KEY_USER_PREFERENCES);

    if (!storedPreferences) {
      return DEFAULT_USER_PREFERENCES;
    }

    try {
      const parsed = JSON.parse(storedPreferences);

      return fixedUserPreferences(parsed);
    } catch (error) {
      console.warn("Failed to parse user preferences from localStorage:", error);
      return DEFAULT_USER_PREFERENCES;
    }
  },

  savePreferences(preferences: UserPreferences): void {
    if (typeof localStorage === "undefined") {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY_USER_PREFERENCES, JSON.stringify(fixedUserPreferences(preferences)));
    } catch (error) {
      console.warn("Failed to save user preferences to localStorage:", error);
    }
  },
};
