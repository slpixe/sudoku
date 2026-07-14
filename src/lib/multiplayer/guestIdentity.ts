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

export function getOrCreateGuestId(storage: Storage): string {
  try {
    const storedGuestId = storage.getItem(GUEST_ID_STORAGE_KEY);
    if (guestIdSchema.safeParse(storedGuestId).success) {
      return storedGuestId as string;
    }
  } catch {
    // Storage can be unavailable even when the browser exposes the API.
  }

  const guestId = crypto.randomUUID();
  guestIdSchema.parse(guestId);

  try {
    storage.setItem(GUEST_ID_STORAGE_KEY, guestId);
  } catch {
    // The in-memory identity still permits this tab to join a room.
  }

  return guestId;
}

export function getOrCreateBrowserGuestId(): string {
  if (typeof window === "undefined") {
    return getOrCreateGuestId(fallbackStorage);
  }
  try {
    return getOrCreateGuestId(window.localStorage);
  } catch {
    return getOrCreateGuestId(fallbackStorage);
  }
}
