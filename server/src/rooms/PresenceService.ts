import type {Clock} from "./Clock.js";
import {SystemClock} from "./Clock.js";

const DEFAULT_RECONNECT_GRACE_MS = 60_000;

interface GuestPresence {
  readonly connectionIds: Set<string>;
  reservationExpiresAt: number | null;
}

export interface PresenceUpdate {
  connectedGuests: 0 | 1 | 2;
  reservationExpiresAt: number | null;
}

export interface PresenceRollbackToken {
  readonly roomCode: string;
  readonly guestId: string;
  readonly connectionId: string;
  readonly connectionWasAdded: boolean;
  readonly previousReservationExpiresAt: number | null;
}

export type PresenceConnectResult =
  | {ok: true; connectedGuests: 0 | 1 | 2; rollback: PresenceRollbackToken}
  | {ok: false; connectedGuests: 0 | 1 | 2};

function presenceCount(guests: ReadonlyMap<string, GuestPresence>): 0 | 1 | 2 {
  let connected = 0;
  for (const guest of guests.values()) {
    if (guest.connectionIds.size > 0) {
      connected += 1;
    }
  }
  return connected as 0 | 1 | 2;
}

export class PresenceService {
  readonly #rooms = new Map<string, Map<string, GuestPresence>>();

  constructor(
    readonly clock: Clock = new SystemClock(),
    readonly reconnectGraceMs = DEFAULT_RECONNECT_GRACE_MS,
  ) {}

  connect(roomCode: string, guestId: string, connectionId: string): PresenceConnectResult {
    const guests = this.#pruneRoom(roomCode);
    const existing = guests.get(guestId);
    if (existing) {
      const previousReservationExpiresAt = existing.reservationExpiresAt;
      const connectionWasAdded = !existing.connectionIds.has(connectionId);
      existing.connectionIds.add(connectionId);
      existing.reservationExpiresAt = null;
      return {
        ok: true,
        connectedGuests: presenceCount(guests),
        rollback: {roomCode, guestId, connectionId, connectionWasAdded, previousReservationExpiresAt},
      };
    }
    if (guests.size >= 2) {
      return {ok: false, connectedGuests: presenceCount(guests)};
    }

    guests.set(guestId, {connectionIds: new Set([connectionId]), reservationExpiresAt: null});
    this.#rooms.set(roomCode, guests);
    return {
      ok: true,
      connectedGuests: presenceCount(guests),
      rollback: {
        roomCode,
        guestId,
        connectionId,
        connectionWasAdded: true,
        previousReservationExpiresAt: null,
      },
    };
  }

  disconnect(roomCode: string, guestId: string, connectionId: string): PresenceUpdate {
    const guests = this.#pruneRoom(roomCode);
    const guest = guests.get(guestId);
    if (!guest || !guest.connectionIds.delete(connectionId)) {
      return {connectedGuests: presenceCount(guests), reservationExpiresAt: null};
    }

    if (guest.connectionIds.size > 0) {
      return {connectedGuests: presenceCount(guests), reservationExpiresAt: null};
    }

    guest.reservationExpiresAt = this.clock.now().getTime() + this.reconnectGraceMs;
    return {
      connectedGuests: presenceCount(guests),
      reservationExpiresAt: guest.reservationExpiresAt,
    };
  }

  rollback(token: PresenceRollbackToken): PresenceUpdate {
    const guests = this.#rooms.get(token.roomCode) ?? new Map<string, GuestPresence>();
    const guest = guests.get(token.guestId);
    if (!guest || !token.connectionWasAdded || !guest.connectionIds.delete(token.connectionId)) {
      return {connectedGuests: presenceCount(guests), reservationExpiresAt: null};
    }

    let reservationExpiresAt: number | null = null;
    if (guest.connectionIds.size === 0) {
      if (
        token.previousReservationExpiresAt !== null &&
        token.previousReservationExpiresAt > this.clock.now().getTime()
      ) {
        guest.reservationExpiresAt = token.previousReservationExpiresAt;
        reservationExpiresAt = token.previousReservationExpiresAt;
      } else {
        guests.delete(token.guestId);
      }
    }
    this.#deleteEmptyRoom(token.roomCode, guests);
    return {connectedGuests: presenceCount(guests), reservationExpiresAt};
  }

  expireReservation(roomCode: string, guestId: string, expectedExpiresAt: number): PresenceUpdate {
    const guests = this.#rooms.get(roomCode) ?? new Map<string, GuestPresence>();
    const guest = guests.get(guestId);
    if (
      guest?.connectionIds.size === 0 &&
      guest.reservationExpiresAt === expectedExpiresAt &&
      expectedExpiresAt <= this.clock.now().getTime()
    ) {
      guests.delete(guestId);
    }
    this.#deleteEmptyRoom(roomCode, guests);
    return {connectedGuests: presenceCount(guests), reservationExpiresAt: null};
  }

  connectedGuests(roomCode: string): 0 | 1 | 2 {
    return presenceCount(this.#pruneRoom(roomCode));
  }

  activeRoomCodes(): ReadonlySet<string> {
    for (const roomCode of this.#rooms.keys()) {
      this.#pruneRoom(roomCode);
    }
    return new Set(this.#rooms.keys());
  }

  #pruneRoom(roomCode: string): Map<string, GuestPresence> {
    const guests = this.#rooms.get(roomCode) ?? new Map<string, GuestPresence>();
    const now = this.clock.now().getTime();
    for (const [guestId, guest] of guests) {
      if (
        guest.connectionIds.size === 0 &&
        guest.reservationExpiresAt !== null &&
        guest.reservationExpiresAt <= now
      ) {
        guests.delete(guestId);
      }
    }
    this.#deleteEmptyRoom(roomCode, guests);
    return guests;
  }

  #deleteEmptyRoom(roomCode: string, guests: ReadonlyMap<string, GuestPresence>): void {
    if (guests.size === 0) {
      this.#rooms.delete(roomCode);
    }
  }
}
