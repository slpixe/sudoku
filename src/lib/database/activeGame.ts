export const STORAGE_ACTIVE_GAME_KEY = "sudoku-currently-playing-sudoku";
export const STORAGE_ACTIVE_GAME_OWNER_KEY = "sudoku-tab-owner-id";
export const LEGACY_ACTIVE_GAME_OWNER_ID = "legacy-active-game-owner";

export type ActiveGameRecord = {
  sudokuKey: string;
  ownerId: string;
  updatedAt: number;
};

let fallbackOwnerId: string | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isActiveGameRecord(value: unknown): value is ActiveGameRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value.sudokuKey) &&
    isNonEmptyString(value.ownerId) &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}

function isStructuredRecordText(text: string) {
  const trimmedText = text.trim();

  return (
    trimmedText.startsWith("{") ||
    trimmedText.startsWith("[") ||
    trimmedText.startsWith('"') ||
    trimmedText === "null" ||
    trimmedText === "true" ||
    trimmedText === "false"
  );
}

function createOwnerId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `sudoku-tab-${crypto.randomUUID()}`;
  }

  return `sudoku-tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function parseActiveGameRecord(text: string | null): ActiveGameRecord | undefined {
  if (!text) {
    return undefined;
  }

  const trimmedText = text.trim();
  if (!trimmedText) {
    return undefined;
  }

  if (!isStructuredRecordText(trimmedText)) {
    return {
      sudokuKey: trimmedText,
      ownerId: LEGACY_ACTIVE_GAME_OWNER_ID,
      updatedAt: 0,
    };
  }

  try {
    const parsed = JSON.parse(text);
    if (isActiveGameRecord(parsed)) {
      return parsed;
    }

    console.warn("Ignoring invalid active sudoku record from localStorage.");
    return undefined;
  } catch (error) {
    console.warn("Failed to parse active sudoku record from localStorage:", error);
    return undefined;
  }
}

export function getActiveGameOwnerId() {
  if (typeof sessionStorage === "undefined") {
    fallbackOwnerId ??= createOwnerId();
    return fallbackOwnerId;
  }

  try {
    const storedOwnerId = sessionStorage.getItem(STORAGE_ACTIVE_GAME_OWNER_KEY);
    if (storedOwnerId) {
      return storedOwnerId;
    }

    const ownerId = createOwnerId();
    sessionStorage.setItem(STORAGE_ACTIVE_GAME_OWNER_KEY, ownerId);
    return ownerId;
  } catch (error) {
    console.warn("Failed to access active sudoku tab owner from sessionStorage:", error);
    fallbackOwnerId ??= createOwnerId();
    return fallbackOwnerId;
  }
}

export function loadActiveGameRecord(): ActiveGameRecord | undefined {
  if (typeof localStorage === "undefined") {
    return undefined;
  }

  try {
    return parseActiveGameRecord(localStorage.getItem(STORAGE_ACTIVE_GAME_KEY));
  } catch (error) {
    console.warn("Failed to load active sudoku record from localStorage:", error);
    return undefined;
  }
}

export function claimActiveGame(
  sudokuKey: string,
  ownerId = getActiveGameOwnerId(),
  now = Date.now(),
): ActiveGameRecord | undefined {
  if (typeof localStorage === "undefined") {
    return undefined;
  }

  const record: ActiveGameRecord = {
    sudokuKey,
    ownerId,
    updatedAt: now,
  };

  try {
    localStorage.setItem(STORAGE_ACTIVE_GAME_KEY, JSON.stringify(record));
    return record;
  } catch (error) {
    console.warn("Failed to claim active sudoku in localStorage:", error);
    return undefined;
  }
}
