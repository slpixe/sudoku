import {describe, expect, it} from "vitest";

import type {Clock} from "./Clock.js";
import {PresenceService, type PresenceConnectionToken} from "./PresenceService.js";

class FakeClock implements Clock {
  #now = new Date("2026-07-13T10:00:00.000Z");

  now(): Date {
    return new Date(this.#now);
  }

  advance(milliseconds: number): void {
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }
}

function reserve(
  presence: PresenceService,
  roomCode: string,
  guestId: string,
  connectionId: string,
): PresenceConnectionToken {
  const result = presence.connect(roomCode, guestId, connectionId);
  if (!result.ok) {
    throw new Error("Expected the guest connection to be reserved");
  }
  return result.token;
}

function connectLive(
  presence: PresenceService,
  roomCode: string,
  guestId: string,
  connectionId: string,
): PresenceConnectionToken {
  const token = reserve(presence, roomCode, guestId, connectionId);
  expect(presence.commit(token)).toMatchObject({ok: true});
  return token;
}

describe("PresenceService", () => {
  it("identifies only recovery of an unexpired fallback reservation as a reconnect", () => {
    const clock = new FakeClock();
    const presence = new PresenceService(clock);
    const initial = presence.connect("ABC234", "guest-1", "connection-1");
    expect(initial).toMatchObject({ok: true, recoveredReservation: false});
    if (!initial.ok) {
      throw new Error("Expected the initial guest connection to be reserved");
    }
    presence.commit(initial.token);

    const extraTab = presence.connect("ABC234", "guest-1", "connection-2");
    expect(extraTab).toMatchObject({ok: true, recoveredReservation: false});
    if (extraTab.ok) {
      presence.rollback(extraTab.token);
    }

    presence.disconnect("ABC234", "guest-1", "connection-1");
    const recovery = presence.connect("ABC234", "guest-1", "connection-3");
    expect(recovery).toMatchObject({ok: true, recoveredReservation: true});

    const expiredPresence = new PresenceService(clock);
    connectLive(expiredPresence, "DEF567", "guest-2", "connection-4");
    expiredPresence.disconnect("DEF567", "guest-2", "connection-4");
    clock.advance(60_001);
    expect(expiredPresence.connect("DEF567", "guest-2", "connection-5")).toMatchObject({
      ok: true,
      recoveredReservation: false,
    });
  });

  it("counts only committed guests while pending guests still consume capacity", () => {
    const presence = new PresenceService(new FakeClock());
    const first = reserve(presence, "ABC234", "guest-1", "connection-1");
    const second = reserve(presence, "ABC234", "guest-2", "connection-2");

    expect(presence.connectedGuests("ABC234")).toBe(0);
    expect(presence.connect("ABC234", "guest-3", "connection-3")).toEqual({
      ok: false,
      connectedGuests: 0,
    });
    expect(presence.commit(first)).toMatchObject({ok: true, connectedGuests: 1});
    expect(presence.commit(second)).toMatchObject({ok: true, connectedGuests: 2});
  });

  it("uses one seat and one connected guest for multiple live tabs", () => {
    const presence = new PresenceService(new FakeClock());
    const first = reserve(presence, "ABC234", "guest-1", "connection-1");
    const second = reserve(presence, "ABC234", "guest-1", "connection-2");

    presence.commit(first);
    presence.commit(second);
    expect(presence.connectedGuests("ABC234")).toBe(1);
    expect(presence.disconnect("ABC234", "guest-1", "connection-1")).toEqual({
      connectedGuests: 1,
      reservationExpiresAt: null,
      finalLiveConnectionClosed: false,
    });
  });

  it("reserves a final live disconnect for 60 seconds", () => {
    const clock = new FakeClock();
    const presence = new PresenceService(clock);
    connectLive(presence, "ABC234", "guest-1", "connection-1");
    connectLive(presence, "ABC234", "guest-2", "connection-2");

    expect(presence.disconnect("ABC234", "guest-1", "connection-1")).toEqual({
      connectedGuests: 1,
      reservationExpiresAt: clock.now().getTime() + 60_000,
      finalLiveConnectionClosed: true,
    });
    expect(presence.connect("ABC234", "guest-3", "connection-3")).toMatchObject({ok: false});

    clock.advance(60_001);
    expect(presence.connect("ABC234", "guest-3", "connection-3")).toMatchObject({
      ok: true,
      connectedGuests: 1,
    });
  });

  it.each([
    ["first then second", 0, 1],
    ["second then first", 1, 0],
  ])("restores one reservation when simultaneous reconnects fail %s", (_description, firstIndex, secondIndex) => {
    const clock = new FakeClock();
    const presence = new PresenceService(clock);
    connectLive(presence, "ABC234", "guest-1", "connection-1");
    const {reservationExpiresAt} = presence.disconnect("ABC234", "guest-1", "connection-1");
    connectLive(presence, "ABC234", "guest-2", "connection-2");
    const reconnects = [
      reserve(presence, "ABC234", "guest-1", "connection-3"),
      reserve(presence, "ABC234", "guest-1", "connection-4"),
    ];

    clock.advance(10_000);
    presence.rollback(reconnects[firstIndex]);
    expect(presence.rollback(reconnects[secondIndex])).toEqual({
      connectedGuests: 1,
      reservationExpiresAt,
      finalLiveConnectionClosed: false,
    });
    expect(presence.connect("ABC234", "guest-3", "connection-5")).toMatchObject({ok: false});
  });

  it("clears fallback provenance when one reconnect commits", () => {
    const clock = new FakeClock();
    const presence = new PresenceService(clock);
    connectLive(presence, "ABC234", "guest-1", "connection-1");
    const {reservationExpiresAt} = presence.disconnect("ABC234", "guest-1", "connection-1");
    const committed = reserve(presence, "ABC234", "guest-1", "connection-2");
    const failed = reserve(presence, "ABC234", "guest-1", "connection-3");

    expect(presence.commit(committed)).toMatchObject({ok: true, connectedGuests: 1});
    clock.advance(60_001);
    presence.expireReservation("ABC234", "guest-1", reservationExpiresAt!);
    expect(presence.rollback(failed)).toEqual({
      connectedGuests: 1,
      reservationExpiresAt: null,
      finalLiveConnectionClosed: false,
    });
  });

  it("creates a fresh fallback when the final live tab leaves pending reconnects", () => {
    const clock = new FakeClock();
    const presence = new PresenceService(clock);
    connectLive(presence, "ABC234", "guest-1", "connection-1");
    const pending = reserve(presence, "ABC234", "guest-1", "connection-2");
    connectLive(presence, "ABC234", "guest-2", "connection-3");
    clock.advance(5_000);

    const disconnected = presence.disconnect("ABC234", "guest-1", "connection-1");
    expect(disconnected).toEqual({
      connectedGuests: 1,
      reservationExpiresAt: clock.now().getTime() + 60_000,
      finalLiveConnectionClosed: true,
    });
    expect(presence.rollback(pending)).toEqual({
      connectedGuests: 1,
      reservationExpiresAt: clock.now().getTime() + 60_000,
      finalLiveConnectionClosed: false,
    });
    expect(presence.connect("ABC234", "guest-3", "connection-4")).toMatchObject({ok: false});
  });

  it("rolls back a new pending guest without leaving a seat", () => {
    const presence = new PresenceService(new FakeClock());
    const pending = reserve(presence, "MNO789", "guest-1", "connection-1");

    expect(presence.rollback(pending)).toEqual({
      connectedGuests: 0,
      reservationExpiresAt: null,
      finalLiveConnectionClosed: false,
    });
    expect(presence.activeRoomCodes()).toEqual(new Set());
  });

  it("accepts selection only from a live connection and keeps the latest same-guest tab", () => {
    const presence = new PresenceService(new FakeClock());
    const pending = reserve(presence, "ABC234", "guest-1", "connection-1");
    expect(presence.setActiveCell("ABC234", "guest-1", "connection-1", 4)).toBe(false);

    presence.commit(pending);
    connectLive(presence, "ABC234", "guest-1", "connection-2");
    connectLive(presence, "ABC234", "guest-2", "connection-3");

    expect(presence.setActiveCell("ABC234", "guest-1", "connection-1", 4)).toBe(true);
    expect(presence.partnerActiveCell("ABC234", "guest-2")).toBe(4);
    expect(presence.setActiveCell("ABC234", "guest-1", "connection-2", 17)).toBe(true);
    expect(presence.partnerActiveCell("ABC234", "guest-2")).toBe(17);
    expect(presence.partnerActiveCell("ABC234", "guest-1")).toBeNull();
  });

  it("retains selection until the final live tab closes, then clears it immediately", () => {
    const clock = new FakeClock();
    const presence = new PresenceService(clock);
    connectLive(presence, "ABC234", "guest-1", "connection-1");
    connectLive(presence, "ABC234", "guest-1", "connection-2");
    connectLive(presence, "ABC234", "guest-2", "connection-3");
    presence.setActiveCell("ABC234", "guest-1", "connection-2", 17);

    expect(presence.disconnect("ABC234", "guest-1", "connection-1")).toEqual({
      connectedGuests: 2,
      reservationExpiresAt: null,
      finalLiveConnectionClosed: false,
    });
    expect(presence.partnerActiveCell("ABC234", "guest-2")).toBe(17);

    expect(presence.disconnect("ABC234", "guest-1", "connection-2")).toEqual({
      connectedGuests: 1,
      reservationExpiresAt: clock.now().getTime() + 60_000,
      finalLiveConnectionClosed: true,
    });
    expect(presence.partnerActiveCell("ABC234", "guest-2")).toBeNull();
  });

  it("rejects stale commit and rollback tokens", () => {
    const presence = new PresenceService(new FakeClock());
    const pending = reserve(presence, "ABC234", "guest-1", "connection-1");
    presence.rollback(pending);
    const replacement = reserve(presence, "ABC234", "guest-1", "connection-1");

    expect(presence.commit(pending)).toMatchObject({ok: false, connectedGuests: 0});
    presence.rollback(pending);
    expect(presence.commit(replacement)).toMatchObject({ok: true, connectedGuests: 1});
  });
});
