import {describe, expect, it} from "vitest";

import type {Clock} from "./Clock.js";
import {PresenceService} from "./PresenceService.js";

class FakeClock implements Clock {
  #now = new Date("2026-07-13T10:00:00.000Z");

  now(): Date {
    return new Date(this.#now);
  }

  advance(milliseconds: number): void {
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }
}

describe("PresenceService", () => {
  it("allows two distinct guests and rejects a third", () => {
    const presence = new PresenceService(new FakeClock());

    expect(presence.connect("ABC234", "guest-1", "connection-1")).toMatchObject({ok: true, connectedGuests: 1});
    expect(presence.connect("ABC234", "guest-2", "connection-2")).toMatchObject({ok: true, connectedGuests: 2});
    expect(presence.connect("ABC234", "guest-3", "connection-3")).toEqual({
      ok: false,
      connectedGuests: 2,
    });
  });

  it("uses one seat for multiple connections belonging to the same guest", () => {
    const presence = new PresenceService(new FakeClock());
    presence.connect("ABC234", "guest-1", "connection-1");

    expect(presence.connect("ABC234", "guest-1", "connection-2")).toMatchObject({
      ok: true,
      connectedGuests: 1,
    });
    expect(presence.disconnect("ABC234", "guest-1", "connection-1")).toMatchObject({
      connectedGuests: 1,
      reservationExpiresAt: null,
    });
    expect(presence.activeRoomCodes()).toEqual(new Set(["ABC234"]));
  });

  it("reserves a final disconnected guest's seat for 60 seconds", () => {
    const clock = new FakeClock();
    const presence = new PresenceService(clock);
    presence.connect("ABC234", "guest-1", "connection-1");
    presence.connect("ABC234", "guest-2", "connection-2");

    const disconnected = presence.disconnect("ABC234", "guest-1", "connection-1");
    expect(disconnected).toEqual({
      connectedGuests: 1,
      reservationExpiresAt: clock.now().getTime() + 60_000,
    });
    expect(presence.connect("ABC234", "guest-3", "connection-3")).toMatchObject({ok: false});

    clock.advance(60_001);
    expect(presence.connect("ABC234", "guest-3", "connection-3")).toMatchObject({
      ok: true,
      connectedGuests: 2,
    });
  });

  it("lets the same guest reclaim a reserved seat and ignores stale expiry callbacks", () => {
    const clock = new FakeClock();
    const presence = new PresenceService(clock);
    presence.connect("ABC234", "guest-1", "connection-1");
    const {reservationExpiresAt} = presence.disconnect("ABC234", "guest-1", "connection-1");

    clock.advance(30_000);
    expect(presence.connect("ABC234", "guest-1", "connection-2")).toMatchObject({ok: true, connectedGuests: 1});
    clock.advance(30_001);
    expect(presence.expireReservation("ABC234", "guest-1", reservationExpiresAt!)).toMatchObject({
      connectedGuests: 1,
    });
  });

  it("rolls back an absent-room reservation without leaving a seat", () => {
    const presence = new PresenceService(new FakeClock());
    presence.connect("MNO789", "guest-1", "connection-1");

    expect(presence.rollback("MNO789", "guest-1", "connection-1")).toEqual({
      connectedGuests: 0,
      reservationExpiresAt: null,
    });
    expect(presence.activeRoomCodes()).toEqual(new Set());
  });
});
