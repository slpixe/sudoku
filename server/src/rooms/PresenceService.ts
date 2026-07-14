import type {Clock} from "./Clock.js";
import {SystemClock} from "./Clock.js";

const DEFAULT_RECONNECT_GRACE_MS = 60_000;

type ConnectionState = "pending" | "live";

interface GuestConnection {
  state: ConnectionState;
  generation: number;
  recoveredReservation: boolean;
}

interface GuestPresence {
  readonly connections: Map<string, GuestConnection>;
  fallbackReservationExpiresAt: number | null;
}

export interface PresenceUpdate {
  connectedGuests: 0 | 1 | 2;
  reservationExpiresAt: number | null;
}

export interface PresenceConnectionToken {
  readonly roomCode: string;
  readonly guestId: string;
  readonly connectionId: string;
  readonly generation: number;
}

export type PresenceConnectResult =
  | {
      ok: true;
      connectedGuests: 0 | 1 | 2;
      recoveredReservation: boolean;
      token: PresenceConnectionToken;
    }
  | {ok: false; connectedGuests: 0 | 1 | 2};

export type PresenceCommitResult =
  | {ok: true; connectedGuests: 0 | 1 | 2}
  | {ok: false; connectedGuests: 0 | 1 | 2};

function hasLiveConnection(guest: GuestPresence): boolean {
  for (const connection of guest.connections.values()) {
    if (connection.state === "live") {
      return true;
    }
  }
  return false;
}

function presenceCount(guests: ReadonlyMap<string, GuestPresence>): 0 | 1 | 2 {
  let connected = 0;
  for (const guest of guests.values()) {
    if (hasLiveConnection(guest)) {
      connected += 1;
    }
  }
  return connected as 0 | 1 | 2;
}

export class PresenceService {
  readonly #rooms = new Map<string, Map<string, GuestPresence>>();
  #nextGeneration = 1;

  constructor(
    readonly clock: Clock = new SystemClock(),
    readonly reconnectGraceMs = DEFAULT_RECONNECT_GRACE_MS,
  ) {}

  connect(roomCode: string, guestId: string, connectionId: string): PresenceConnectResult {
    const guests = this.#pruneRoom(roomCode);
    let guest = guests.get(guestId);
    let recoveredReservation = guest !== undefined && guest.fallbackReservationExpiresAt !== null;
    if (!guest) {
      if (guests.size >= 2) {
        return {ok: false, connectedGuests: presenceCount(guests)};
      }
      guest = {connections: new Map(), fallbackReservationExpiresAt: null};
      recoveredReservation = false;
      guests.set(guestId, guest);
      this.#rooms.set(roomCode, guests);
    }

    const existing = guest.connections.get(connectionId);
    if (existing) {
      return {
        ok: true,
        connectedGuests: presenceCount(guests),
        recoveredReservation: existing.recoveredReservation,
        token: {roomCode, guestId, connectionId, generation: existing.generation},
      };
    }

    const generation = this.#nextGeneration++;
    guest.connections.set(connectionId, {state: "pending", generation, recoveredReservation});
    return {
      ok: true,
      connectedGuests: presenceCount(guests),
      recoveredReservation,
      token: {roomCode, guestId, connectionId, generation},
    };
  }

  commit(token: PresenceConnectionToken): PresenceCommitResult {
    const guests = this.#pruneRoom(token.roomCode);
    const guest = guests.get(token.guestId);
    const connection = guest?.connections.get(token.connectionId);
    if (!guest || !connection || connection.generation !== token.generation) {
      return {ok: false, connectedGuests: presenceCount(guests)};
    }

    connection.state = "live";
    guest.fallbackReservationExpiresAt = null;
    return {ok: true, connectedGuests: presenceCount(guests)};
  }

  rollback(token: PresenceConnectionToken): PresenceUpdate {
    const guests = this.#pruneRoom(token.roomCode);
    const guest = guests.get(token.guestId);
    const connection = guest?.connections.get(token.connectionId);
    if (
      guest &&
      connection?.state === "pending" &&
      connection.generation === token.generation
    ) {
      guest.connections.delete(token.connectionId);
      this.#deleteGuestWithoutCapacity(token.roomCode, token.guestId, guest, guests);
    }
    return {
      connectedGuests: presenceCount(guests),
      reservationExpiresAt: guest?.fallbackReservationExpiresAt ?? null,
    };
  }

  disconnect(roomCode: string, guestId: string, connectionId: string): PresenceUpdate {
    const guests = this.#pruneRoom(roomCode);
    const guest = guests.get(guestId);
    const connection = guest?.connections.get(connectionId);
    if (!guest || !connection) {
      return {
        connectedGuests: presenceCount(guests),
        reservationExpiresAt: guest?.fallbackReservationExpiresAt ?? null,
      };
    }

    guest.connections.delete(connectionId);
    if (connection.state === "live" && !hasLiveConnection(guest)) {
      guest.fallbackReservationExpiresAt = this.clock.now().getTime() + this.reconnectGraceMs;
    }
    this.#deleteGuestWithoutCapacity(roomCode, guestId, guest, guests);
    return {
      connectedGuests: presenceCount(guests),
      reservationExpiresAt: guest.fallbackReservationExpiresAt,
    };
  }

  expireReservation(roomCode: string, guestId: string, expectedExpiresAt: number): PresenceUpdate {
    const guests = this.#rooms.get(roomCode) ?? new Map<string, GuestPresence>();
    const guest = guests.get(guestId);
    if (
      guest?.fallbackReservationExpiresAt === expectedExpiresAt &&
      expectedExpiresAt <= this.clock.now().getTime()
    ) {
      guest.fallbackReservationExpiresAt = null;
      this.#deleteGuestWithoutCapacity(roomCode, guestId, guest, guests);
    }
    return {
      connectedGuests: presenceCount(guests),
      reservationExpiresAt: guest?.fallbackReservationExpiresAt ?? null,
    };
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
        guest.fallbackReservationExpiresAt !== null &&
        guest.fallbackReservationExpiresAt <= now
      ) {
        guest.fallbackReservationExpiresAt = null;
      }
      this.#deleteGuestWithoutCapacity(roomCode, guestId, guest, guests);
    }
    return guests;
  }

  #deleteGuestWithoutCapacity(
    roomCode: string,
    guestId: string,
    guest: GuestPresence,
    guests: Map<string, GuestPresence>,
  ): void {
    if (guest.connections.size === 0 && guest.fallbackReservationExpiresAt === null) {
      guests.delete(guestId);
    }
    if (guests.size === 0) {
      this.#rooms.delete(roomCode);
    }
  }
}
