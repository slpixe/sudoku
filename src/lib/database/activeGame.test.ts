import {afterEach, describe, expect, it, vi} from "vitest";

import {
  claimActiveGame,
  getActiveGameOwnerId,
  LEGACY_ACTIVE_GAME_OWNER_ID,
  loadActiveGameRecord,
  parseActiveGameRecord,
  STORAGE_ACTIVE_GAME_KEY,
  STORAGE_ACTIVE_GAME_OWNER_KEY,
} from "./activeGame";

function createStorageMock(initialValues: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initialValues));

  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe("active game persistence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("parses a valid structured active game record", () => {
    expect(parseActiveGameRecord(JSON.stringify({sudokuKey: "123", ownerId: "tab-1", updatedAt: 42}))).toEqual({
      sudokuKey: "123",
      ownerId: "tab-1",
      updatedAt: 42,
    });
  });

  it("parses a legacy plain-string active game key", () => {
    expect(parseActiveGameRecord("123456789")).toEqual({
      sudokuKey: "123456789",
      ownerId: LEGACY_ACTIVE_GAME_OWNER_ID,
      updatedAt: 0,
    });
    expect(parseActiveGameRecord(" 123456789 ")).toEqual({
      sudokuKey: "123456789",
      ownerId: LEGACY_ACTIVE_GAME_OWNER_ID,
      updatedAt: 0,
    });
  });

  it("ignores whitespace-only active game records", () => {
    expect(parseActiveGameRecord("   ")).toBeUndefined();
  });

  it("ignores malformed structured records", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(parseActiveGameRecord(JSON.stringify({sudokuKey: "123"}))).toBeUndefined();
    expect(parseActiveGameRecord("{")).toBeUndefined();
    expect(parseActiveGameRecord("[]")).toBeUndefined();
    expect(parseActiveGameRecord(JSON.stringify("abc"))).toBeUndefined();
    expect(parseActiveGameRecord("null")).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(5);
  });

  it("creates and reuses a tab owner id in sessionStorage", () => {
    vi.stubGlobal("sessionStorage", createStorageMock());

    const firstOwnerId = getActiveGameOwnerId();
    const secondOwnerId = getActiveGameOwnerId();

    expect(firstOwnerId).toMatch(/^sudoku-tab-/);
    expect(secondOwnerId).toBe(firstOwnerId);
    expect(sessionStorage.getItem(STORAGE_ACTIVE_GAME_OWNER_KEY)).toBe(firstOwnerId);
  });

  it("claims the active game with owner id and timestamp", () => {
    vi.stubGlobal("sessionStorage", createStorageMock({[STORAGE_ACTIVE_GAME_OWNER_KEY]: "tab-1"}));
    vi.stubGlobal("localStorage", createStorageMock());

    expect(claimActiveGame("123", undefined, 1000)).toEqual({
      sudokuKey: "123",
      ownerId: "tab-1",
      updatedAt: 1000,
    });
    expect(loadActiveGameRecord()).toEqual({
      sudokuKey: "123",
      ownerId: "tab-1",
      updatedAt: 1000,
    });
    expect(localStorage.getItem(STORAGE_ACTIVE_GAME_KEY)).toBe(
      JSON.stringify({sudokuKey: "123", ownerId: "tab-1", updatedAt: 1000}),
    );
  });

  it("returns safe defaults when storage APIs are unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("sessionStorage", undefined);

    expect(loadActiveGameRecord()).toBeUndefined();
    expect(claimActiveGame("123", undefined, 1000)).toBeUndefined();
    expect(getActiveGameOwnerId()).toMatch(/^sudoku-tab-/);
  });

  it("returns safe defaults when storage APIs throw", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const getThrowingLocalStorage = createStorageMock();
    vi.mocked(getThrowingLocalStorage.getItem).mockImplementation(() => {
      throw new Error("getItem failed");
    });
    vi.stubGlobal("localStorage", getThrowingLocalStorage);
    expect(loadActiveGameRecord()).toBeUndefined();

    const setThrowingLocalStorage = createStorageMock();
    vi.mocked(setThrowingLocalStorage.setItem).mockImplementation(() => {
      throw new Error("setItem failed");
    });
    vi.stubGlobal("localStorage", setThrowingLocalStorage);
    expect(claimActiveGame("123", "tab-1", 1000)).toBeUndefined();

    const getThrowingSessionStorage = createStorageMock();
    vi.mocked(getThrowingSessionStorage.getItem).mockImplementation(() => {
      throw new Error("session getItem failed");
    });
    vi.stubGlobal("sessionStorage", getThrowingSessionStorage);
    expect(getActiveGameOwnerId()).toMatch(/^sudoku-tab-/);
  });
});
