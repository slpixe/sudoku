import {z} from "zod";

export const GUEST_ID_STORAGE_KEY = "sudoku-multiplayer-guest-id";

const guestIdSchema = z.string().uuid();

const fallbackStorageValues = new Map<string, string>();

const fallbackStorage: Storage = {
  get length() {
    return fallbackStorageValues.size;
  },
  clear: () => fallbackStorageValues.clear(),
  getItem: (key) => fallbackStorageValues.get(key) ?? null,
  key: (index) => [...fallbackStorageValues.keys()][index] ?? null,
  removeItem: (key) => void fallbackStorageValues.delete(key),
  setItem: (key, value) => void fallbackStorageValues.set(key, value),
};

function getOrCreateFallbackGuestId(): string {
  const storedGuestId = fallbackStorage.getItem(GUEST_ID_STORAGE_KEY);
  if (guestIdSchema.safeParse(storedGuestId).success) {
    return storedGuestId as string;
  }
  const guestId = crypto.randomUUID();
  guestIdSchema.parse(guestId);
  fallbackStorage.setItem(GUEST_ID_STORAGE_KEY, guestId);
  return guestId;
}

export function getOrCreateGuestId(storage: Storage): string {
  let storedGuestId: string | null;
  try {
    storedGuestId = storage.getItem(GUEST_ID_STORAGE_KEY);
  } catch {
    return getOrCreateFallbackGuestId();
  }
  if (guestIdSchema.safeParse(storedGuestId).success) {
    return storedGuestId as string;
  }

  const guestId = crypto.randomUUID();
  guestIdSchema.parse(guestId);

  try {
    storage.setItem(GUEST_ID_STORAGE_KEY, guestId);
  } catch {
    return getOrCreateFallbackGuestId();
  }

  return guestId;
}

export function getOrCreateBrowserGuestId(): string {
  if (typeof window === "undefined") {
    return getOrCreateFallbackGuestId();
  }
  try {
    return getOrCreateGuestId(window.localStorage);
  } catch {
    return getOrCreateFallbackGuestId();
  }
}
