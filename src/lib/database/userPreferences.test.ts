import {afterEach, describe, expect, it, vi} from "vitest";

import {DEFAULT_USER_PREFERENCES, localStorageUserPreferencesRepository, UserPreferences} from "./userPreferences";

const storageKey = "sudoku-user-preferences";

function createLocalStorageMock(initialValues: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initialValues));

  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => {
      store.clear();
    }),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  } as unknown as Storage;
}

const nonDefaultPreferences: UserPreferences = {
  showHints: true,
  showWrongEntries: true,
  showConflicts: false,
  showCircleMenu: true,
  showOccurrences: false,
};

describe("localStorageUserPreferencesRepository", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads defaults when localStorage is unavailable or empty", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(localStorageUserPreferencesRepository.getPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
    expect(() => localStorageUserPreferencesRepository.savePreferences(DEFAULT_USER_PREFERENCES)).not.toThrow();

    vi.stubGlobal("localStorage", createLocalStorageMock());
    expect(localStorageUserPreferencesRepository.getPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("normalizes valid and partial stored preferences to current defaults", () => {
    vi.stubGlobal(
      "localStorage",
      createLocalStorageMock({
        [storageKey]: JSON.stringify(nonDefaultPreferences),
      }),
    );
    expect(localStorageUserPreferencesRepository.getPreferences()).toEqual(DEFAULT_USER_PREFERENCES);

    vi.stubGlobal(
      "localStorage",
      createLocalStorageMock({
        [storageKey]: JSON.stringify({showHints: true}),
      }),
    );
    expect(localStorageUserPreferencesRepository.getPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("loads defaults when stored preferences are corrupted", () => {
    vi.stubGlobal("localStorage", createLocalStorageMock({[storageKey]: "{"}));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(localStorageUserPreferencesRepository.getPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("saves normalized preferences", () => {
    const storage = createLocalStorageMock();
    vi.stubGlobal("localStorage", storage);

    localStorageUserPreferencesRepository.savePreferences(nonDefaultPreferences);

    expect(localStorage.getItem(storageKey)).toBe(JSON.stringify(DEFAULT_USER_PREFERENCES));
  });
});
