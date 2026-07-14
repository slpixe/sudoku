import {z} from "zod";
import {describe, expect, it} from "vitest";

import {GUEST_ID_STORAGE_KEY, getOrCreateGuestId} from "./guestIdentity";

const uuidSchema = z.string().uuid();

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("getOrCreateGuestId", () => {
  it("shares one valid UUID across tabs using the same storage profile", () => {
    const sharedStorage = createStorage();

    const firstTabGuestId = getOrCreateGuestId(sharedStorage);
    const secondTabGuestId = getOrCreateGuestId(sharedStorage);

    expect(uuidSchema.parse(firstTabGuestId)).toBe(firstTabGuestId);
    expect(secondTabGuestId).toBe(firstTabGuestId);
    expect(sharedStorage.getItem(GUEST_ID_STORAGE_KEY)).toBe(firstTabGuestId);
  });

  it("creates a different guest UUID for another storage profile", () => {
    const firstProfileGuestId = getOrCreateGuestId(createStorage());
    const secondProfileGuestId = getOrCreateGuestId(createStorage());

    expect(uuidSchema.parse(firstProfileGuestId)).toBe(firstProfileGuestId);
    expect(uuidSchema.parse(secondProfileGuestId)).toBe(secondProfileGuestId);
    expect(secondProfileGuestId).not.toBe(firstProfileGuestId);
  });

  it("replaces an invalid stored identity with a valid UUID", () => {
    const storage = createStorage();
    storage.setItem(GUEST_ID_STORAGE_KEY, "not-a-uuid");

    const guestId = getOrCreateGuestId(storage);

    expect(uuidSchema.parse(guestId)).toBe(guestId);
    expect(storage.getItem(GUEST_ID_STORAGE_KEY)).toBe(guestId);
  });
});
