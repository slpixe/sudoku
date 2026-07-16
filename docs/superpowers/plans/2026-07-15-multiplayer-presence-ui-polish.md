# Multiplayer Presence and UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact multiplayer room controls, a centered Join Existing form, and an ephemeral two-player active-cell indicator without changing durable room state or offline solo play.

**Architecture:** Extend the typed Socket.IO protocol with a fire-and-forget active-cell presence event. `PresenceService` owns one in-memory cell per connected guest so it can enforce latest-tab-wins and final-connection clearing, while the React room hook scopes the partner cell to the current live connection and the generic Sudoku grid renders it through optional presentation props. Copy feedback and Join Existing layout remain frontend-only concerns.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Socket.IO, Zod, Vitest, Testing Library, Playwright, Node.js 24+, and pnpm 11.9.0.

## Global Constraints

- Use `pnpm@11.9.0` and Node.js 24 or newer.
- Increment `MULTIPLAYER_PROTOCOL_VERSION` from `1` to `2` when the socket event contract changes.
- Partner active-cell state is ephemeral memory only: never write it to Postgres, room snapshots, revisions, durable commands, undo history, action attribution, or room-expiry timestamps.
- A selection payload uses one canonical integer `cellIndex` from `0` through `80`.
- The latest selection from any same-guest tab wins; closing one of several tabs retains it, while closing the guest's final live connection clears it immediately despite the seat-reservation grace period.
- Do not show a same-guest tab as the other player and do not expose guest IDs to the browser event.
- Keep the multiplayer row immediately above the existing puzzle header and render its connected state as `Room: ABC234 • 2/2 [Copy]`.
- Copy feedback stays in the button as `Copied ✓` or `Copy failed`; it never adds a visible paragraph or exposes the full URL after failure.
- Keep givens white, entered values orange, and notes green. The partner indicator has no fill and uses a dashed emerald outline.
- When both guests select one cell, retain the local solid teal border and add an inset dashed partner outline.
- Join Existing remains the only online mode that hides the puzzle picker; center its label, input, button, and inline error.
- Solo remains socket-free and fully usable offline.
- Preserve the hash route `/#/room/<CODE>` and existing room-code normalization.
- Use TDD and commit each task independently.
- Keep these checks passing: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm build`, `pnpm run test:e2e`, and `pnpm run test:e2e:multiplayer`.

---

## File Structure

### Shared protocol

- Modify `packages/multiplayer-protocol/src/types.ts` for protocol version `2`.
- Modify `packages/multiplayer-protocol/src/schemas.ts` to export the canonical cell-index schema.
- Modify `packages/multiplayer-protocol/src/socketEvents.ts` for selection schemas, payload types, and typed socket events.
- Modify `packages/multiplayer-protocol/src/index.ts` to expose the new public contract.
- Modify `packages/multiplayer-protocol/src/schemas.test.ts` for strict boundary coverage.

### Multiplayer server

- Modify `server/src/rooms/PresenceService.ts` so guest presence owns the latest active cell and reports final live disconnects.
- Modify `server/src/rooms/PresenceService.test.ts` for pending, multi-tab, and final-disconnect behavior.
- Modify `server/src/transport/createSocketServer.ts` to validate, rate-limit, relay, restore, and clear partner selection.
- Modify `server/src/transport/createSocketServer.test.ts` for two-guest and same-guest socket integration coverage.

### Web client and UI

- Modify `src/lib/multiplayer/useMultiplayerRoom.ts` and its test for room-scoped partner state and reconnect re-announcement.
- Modify `src/pages/Game/MultiplayerGameController.tsx` and its test to connect local coordinates, partner coordinates, and copy state.
- Modify `src/pages/Game/GameView.tsx` and its test to pass an optional partner cell only while the board is visible.
- Modify `src/components/sudoku/Sudoku.tsx`, `src/components/sudoku/SudokuGrid.tsx`, and `SudokuGrid.test.tsx` for the dashed no-fill indicator.
- Modify `src/pages/Game/MultiplayerStatus.tsx` and create `src/pages/Game/MultiplayerStatus.test.tsx` for the compact row and in-button feedback.
- Modify `src/pages/Game/OnlineRoomControls.tsx` and its test for the centered Join Existing form.
- Modify all seven `src/locales/*.json` files for the new visible copy, room, and join strings.

### Browser coverage

- Modify `e2e/multiplayer.e2e.ts` for partner selection, same-guest tabs, reconnects, pause/resume, and copy layout.
- Modify `e2e/select-game.e2e.ts` for centered Join Existing layout and updated button copy.

## Task 1: Extend the Typed Multiplayer Protocol

**Files:**
- Modify: `packages/multiplayer-protocol/src/types.ts`
- Modify: `packages/multiplayer-protocol/src/schemas.ts`
- Modify: `packages/multiplayer-protocol/src/socketEvents.ts`
- Modify: `packages/multiplayer-protocol/src/index.ts`
- Modify: `packages/multiplayer-protocol/src/schemas.test.ts`

**Interfaces:**
- Produces `roomSelectionRequestSchema` and `partnerSelectionSchema`.
- Produces `RoomSelectionRequest = {roomCode: string; cellIndex: number}`.
- Produces `PartnerSelection = {roomCode: string; cellIndex: number | null}`.
- Adds client event `"room:selection"` and server event `"room:partner-selection"`.
- Produces `MULTIPLAYER_PROTOCOL_VERSION = 2` for all later tasks.

- [ ] **Step 1: Write strict failing schema and version tests**

Add these imports and cases to `schemas.test.ts`:

```ts
import {MULTIPLAYER_PROTOCOL_VERSION} from "./types.js";
import {
  partnerSelectionSchema,
  roomSelectionRequestSchema,
} from "./socketEvents.js";

describe("active-cell presence schemas", () => {
  it("accepts both cell boundaries and a server-side clear", () => {
    expect(roomSelectionRequestSchema.parse({roomCode: "ABC234", cellIndex: 0})).toEqual({
      roomCode: "ABC234",
      cellIndex: 0,
    });
    expect(roomSelectionRequestSchema.parse({roomCode: "ABC234", cellIndex: 80}).cellIndex).toBe(80);
    expect(partnerSelectionSchema.parse({roomCode: "ABC234", cellIndex: null})).toEqual({
      roomCode: "ABC234",
      cellIndex: null,
    });
  });

  it.each([
    {roomCode: "ABC234", cellIndex: -1},
    {roomCode: "ABC234", cellIndex: 1.5},
    {roomCode: "ABC234", cellIndex: 81},
    {roomCode: "ABC234", cellIndex: "4"},
    {roomCode: "ABC234"},
    {roomCode: "ABC234", cellIndex: 4, extra: true},
  ])("rejects an invalid client selection %#", (selection) => {
    expect(() => roomSelectionRequestSchema.parse(selection)).toThrow();
  });

  it("allows null only in the server partner event", () => {
    expect(() => roomSelectionRequestSchema.parse({roomCode: "ABC234", cellIndex: null})).toThrow();
    expect(() => partnerSelectionSchema.parse({roomCode: "ABC234", cellIndex: 81})).toThrow();
    expect(() => partnerSelectionSchema.parse({roomCode: "ABC234", cellIndex: null, extra: true})).toThrow();
  });

  it("uses protocol version 2", () => {
    expect(MULTIPLAYER_PROTOCOL_VERSION).toBe(2);
  });
});
```

- [ ] **Step 2: Run the focused protocol test and verify failure**

Run:

```bash
pnpm --filter @sudoku/multiplayer-protocol exec vitest run src/schemas.test.ts
```

Expected: FAIL because the two schemas are not exported and the protocol version is still `1`.

- [ ] **Step 3: Implement the exact socket contract**

Export `cellIndexSchema` from `schemas.ts`. Add this contract to `socketEvents.ts` and the two event maps:

```ts
import {cellIndexSchema, roomCodeSchema, roomCommandSchema} from "./schemas.js";

export const roomSelectionRequestSchema = z
  .object({roomCode: roomCodeSchema, cellIndex: cellIndexSchema})
  .strict();

export const partnerSelectionSchema = z
  .object({roomCode: roomCodeSchema, cellIndex: cellIndexSchema.nullable()})
  .strict();

export type RoomSelectionRequest = z.infer<typeof roomSelectionRequestSchema>;
export type PartnerSelection = z.infer<typeof partnerSelectionSchema>;

export interface ClientToServerEvents {
  "room:create": (request: CreateRoomRequest, ack: (result: RoomAck) => void) => void;
  "room:join": (request: JoinRoomRequest, ack: (result: RoomAck) => void) => void;
  "room:command": (command: RoomCommand, ack: (result: RoomAck) => void) => void;
  "room:selection": (request: RoomSelectionRequest) => void;
  "room:leave": (request: LeaveRoomRequest) => void;
}

export interface ServerToClientEvents {
  "room:snapshot": (snapshot: RoomSnapshot) => void;
  "room:event": (event: RoomEvent) => void;
  "room:presence": (presence: {connectedGuests: 0 | 1 | 2}) => void;
  "room:partner-selection": (selection: PartnerSelection) => void;
  "room:error": (error: RoomError) => void;
}
```

Set `MULTIPLAYER_PROTOCOL_VERSION = 2` in `types.ts`. Re-export both schemas and both types from `index.ts`.

- [ ] **Step 4: Verify protocol tests and type declarations**

Run:

```bash
pnpm --filter @sudoku/multiplayer-protocol exec vitest run src/schemas.test.ts
pnpm --filter @sudoku/multiplayer-protocol typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the protocol contract**

```bash
git add packages/multiplayer-protocol/src
git commit -m "feat: define multiplayer cell presence protocol"
```

## Task 2: Track and Relay Ephemeral Selection on the Server

**Files:**
- Modify: `server/src/rooms/PresenceService.ts`
- Modify: `server/src/rooms/PresenceService.test.ts`
- Modify: `server/src/transport/createSocketServer.ts`
- Modify: `server/src/transport/createSocketServer.test.ts`

**Interfaces:**
- Consumes Task 1's `roomSelectionRequestSchema`, `RoomSelectionRequest`, and `PartnerSelection`.
- Produces `PresenceService.setActiveCell(roomCode, guestId, connectionId, cellIndex): boolean`.
- Produces `PresenceService.partnerActiveCell(roomCode, guestId): number | null`.
- Extends `PresenceUpdate` with `finalLiveConnectionClosed: boolean`.
- Relays partner events without calling `RoomService`, repositories, or mutation queues.

- [ ] **Step 1: Write failing PresenceService tests**

Add these cases to `PresenceService.test.ts`:

```ts
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
```

Update existing exact `PresenceUpdate` assertions so rollback and reservation expiry expect `finalLiveConnectionClosed: false`, and only a final live disconnect expects `true`.

- [ ] **Step 2: Run the focused service test and verify failure**

Run:

```bash
pnpm --filter @sudoku/multiplayer-server exec vitest run src/rooms/PresenceService.test.ts
```

Expected: FAIL because the active-cell methods and disconnect flag do not exist.

- [ ] **Step 3: Implement active-cell ownership inside PresenceService**

Add `activeCellIndex: number | null` to `GuestPresence`, initialize it to `null` when a guest is created, and implement:

```ts
setActiveCell(roomCode: string, guestId: string, connectionId: string, cellIndex: number): boolean {
  const guests = this.#pruneRoom(roomCode);
  const guest = guests.get(guestId);
  if (guest?.connections.get(connectionId)?.state !== "live") {
    return false;
  }
  guest.activeCellIndex = cellIndex;
  return true;
}

partnerActiveCell(roomCode: string, guestId: string): number | null {
  for (const [candidateGuestId, guest] of this.#pruneRoom(roomCode)) {
    if (candidateGuestId !== guestId && hasLiveConnection(guest)) {
      return guest.activeCellIndex;
    }
  }
  return null;
}
```

Extend `PresenceUpdate` and every return site with `finalLiveConnectionClosed`. In `disconnect`, set it only when the removed connection was live and no live connection remains, clear `guest.activeCellIndex` in that branch, and preserve the existing reservation behavior.

- [ ] **Step 4: Verify PresenceService**

Run:

```bash
pnpm --filter @sudoku/multiplayer-server exec vitest run src/rooms/PresenceService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing socket relay tests**

Import `PartnerSelection`, add this helper, and add an integration case to `createSocketServer.test.ts`:

```ts
function nextPartnerSelection(socket: TestClient): Promise<PartnerSelection> {
  return new Promise((resolve) => socket.once("room:partner-selection", resolve));
}

it("relays latest-tab selection to only the other guest and clears on final disconnect", async () => {
  const repository = new InMemoryRoomRepository();
  const runtime = await startRuntime(repository);
  const creator = await connect(runtime.url);
  const created = await emitCreate(creator, createRequest());
  if (!created.ok) throw new Error("Expected room creation to succeed");
  const roomCode = created.snapshot.roomCode;

  const joiner = await connect(runtime.url);
  const initial = nextPartnerSelection(joiner);
  await emitJoin(joiner, {guestId: GUEST_TWO, connectionId: uuid(60), roomCode});
  await expect(initial).resolves.toEqual({roomCode, cellIndex: null});

  const creatorExtra = await connect(runtime.url);
  await emitJoin(creatorExtra, {guestId: GUEST_ONE, connectionId: uuid(61), roomCode});
  const sameGuestEvents: PartnerSelection[] = [];
  creatorExtra.on("room:partner-selection", (event) => sameGuestEvents.push(event));
  const joinerEvents: PartnerSelection[] = [];
  joiner.on("room:partner-selection", (event) => joinerEvents.push(event));

  creator.emit("room:selection", {roomCode, cellIndex: 4});
  await waitFor(() => joinerEvents.at(-1)?.cellIndex === 4);
  creatorExtra.emit("room:selection", {roomCode, cellIndex: 17});
  await waitFor(() => joinerEvents.at(-1)?.cellIndex === 17);
  expect(sameGuestEvents).toEqual([]);
  expect((await repository.getSnapshot(roomCode, new FixedClock().now()))?.revision).toBe(0);

  const joinerExtra = await connect(runtime.url);
  const restored = nextPartnerSelection(joinerExtra);
  await emitJoin(joinerExtra, {guestId: GUEST_TWO, connectionId: uuid(62), roomCode});
  await expect(restored).resolves.toEqual({roomCode, cellIndex: 17});

  creatorExtra.close();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(joinerEvents.at(-1)).toEqual({roomCode, cellIndex: 17});
  creator.close();
  await waitFor(() => joinerEvents.at(-1)?.cellIndex === null);
});
```

Also add this independent non-member/malformed integration test:

```ts
it("ignores malformed and non-member selections without blocking room commands", async () => {
  const runtime = await startRuntime();
  const creator = await connect(runtime.url);
  const created = await emitCreate(creator, createRequest());
  if (!created.ok) throw new Error("Expected room creation to succeed");
  const roomCode = created.snapshot.roomCode;
  const joiner = await connect(runtime.url);
  await emitJoin(joiner, {guestId: GUEST_TWO, connectionId: uuid(63), roomCode});
  const outsider = await connect(runtime.url);
  const relayed: PartnerSelection[] = [];
  joiner.on("room:partner-selection", (event) => relayed.push(event));

  outsider.emit("room:selection", {roomCode, cellIndex: 4});
  creator.emit("room:selection", {roomCode, cellIndex: 81} as never);
  creator.emit("room:selection", {roomCode, cellIndex: 4, extra: true} as never);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(relayed).toEqual([]);

  const command = await new Promise<RoomAck>((resolve) =>
    creator.emit(
      "room:command",
      {commandId: uuid(64), roomCode, baseRevision: 0, action: {type: "setNumber", cellIndex: 1, number: SOLUTION[1]}},
      resolve,
    ),
  );
  expect(command).toMatchObject({ok: true, snapshot: {revision: 1}});
});
```

- [ ] **Step 6: Run the socket test and verify failure**

Run:

```bash
pnpm --filter @sudoku/multiplayer-protocol build
pnpm --filter @sudoku/multiplayer-server exec vitest run src/transport/createSocketServer.test.ts
```

Expected: FAIL because the server has no selection listener or relay.

- [ ] **Step 7: Implement validation, limiting, relay, restore, and clear**

Add a dedicated `TokenBucketRateLimiter(60, 1_000, clock)`. Use this relay helper inside `createSocketServer`:

```ts
const emitPartnerSelection = (roomCode: string, sourceGuestId: string, cellIndex: number | null): void => {
  for (const socketId of io.sockets.adapter.rooms.get(roomCode) ?? []) {
    const target = io.sockets.sockets.get(socketId);
    const membership = target?.data.memberships.get(roomCode);
    if (target && membership?.state === "live" && membership.guestId !== sourceGuestId) {
      target.emit("room:partner-selection", {roomCode, cellIndex});
    }
  }
};
```

Handle selections without touching durable commands:

```ts
socket.on("room:selection", (unparsedRequest) => {
  if (!selectionLimiter.consume(socket.id)) return;
  const parsed = roomSelectionRequestSchema.safeParse(unparsedRequest);
  if (!parsed.success) return;
  const membership = socket.data.memberships.get(parsed.data.roomCode);
  if (membership?.state !== "live") return;
  if (!options.presence.setActiveCell(parsed.data.roomCode, membership.guestId, socket.id, parsed.data.cellIndex)) return;
  emitPartnerSelection(parsed.data.roomCode, membership.guestId, parsed.data.cellIndex);
});
```

After each successful create/join membership commit, emit the current partner value to that socket:

```ts
socket.emit("room:partner-selection", {
  roomCode,
  cellIndex: options.presence.partnerActiveCell(roomCode, guestId),
});
```

Use the concrete local variables for the create and join branches. In cleanup, emit `null` before any awaited leave when `update.finalLiveConnectionClosed` is true. Delete the selection limiter's socket bucket during disconnect alongside `commandLimiter.delete(socket.id)`.

- [ ] **Step 8: Verify all server presence behavior**

Run:

```bash
pnpm --filter @sudoku/multiplayer-server exec vitest run src/rooms/PresenceService.test.ts src/transport/createSocketServer.test.ts
pnpm --filter @sudoku/multiplayer-server typecheck
```

Expected: all tests and typechecking PASS.

- [ ] **Step 9: Commit server presence**

```bash
git add server/src/rooms/PresenceService.ts server/src/rooms/PresenceService.test.ts server/src/transport/createSocketServer.ts server/src/transport/createSocketServer.test.ts
git commit -m "feat: relay multiplayer cell presence"
```

## Task 3: Add Room-Scoped Partner Selection to the Client Hook

**Files:**
- Modify: `src/lib/multiplayer/useMultiplayerRoom.ts`
- Modify: `src/lib/multiplayer/useMultiplayerRoom.test.ts`

**Interfaces:**
- Consumes Task 1's `room:selection` and `room:partner-selection` events.
- Produces `UseMultiplayerRoomResult.partnerCellIndex: number | null`.
- Produces `UseMultiplayerRoomResult.announceActiveCell(cellIndex: number): void`.
- Task 4 consumes both new result members.

- [ ] **Step 1: Write failing hook tests for receive, dedupe, disconnect, and reconnect**

Add this focused case to `useMultiplayerRoom.test.ts`:

```ts
it("scopes partner selection and re-announces one deduplicated local cell after reconnect", () => {
  const socket = new FakeSocket();
  const {result} = renderHook(() =>
    useMultiplayerRoom("ABC234", {storage: createStorage(), socketFactory: () => socket.asSocket()}),
  );
  act(() => socket.serverEmit("room:snapshot", createSnapshot()));

  act(() => {
    result.current.announceActiveCell(12);
    result.current.announceActiveCell(12);
  });
  expect(events(socket, "room:selection")).toHaveLength(1);
  expect(events(socket, "room:selection")[0].args[0]).toEqual({roomCode: "ABC234", cellIndex: 12});

  act(() => socket.serverEmit("room:partner-selection", {roomCode: "ABC234", cellIndex: 40}));
  expect(result.current.partnerCellIndex).toBe(40);
  act(() => socket.serverDisconnect());
  expect(result.current.partnerCellIndex).toBeNull();

  act(() => socket.connect());
  const reconnectJoin = events(socket, "room:join").at(-1)!;
  act(() => acknowledge(reconnectJoin, {ok: true, snapshot: createSnapshot(1)}));
  expect(events(socket, "room:selection")).toHaveLength(2);
  expect(events(socket, "room:selection")[1].args[0]).toEqual({roomCode: "ABC234", cellIndex: 12});
});
```

In the existing changed-room test, add:

```ts
act(() => socket.serverEmit("room:partner-selection", {roomCode: "ABC234", cellIndex: 10}));
expect(result.current.partnerCellIndex).toBe(10);
rerender({roomCode: "DEF567"});
expect(result.current.partnerCellIndex).toBeNull();
act(() => socket.serverEmit("room:partner-selection", {roomCode: "ABC234", cellIndex: 11}));
expect(result.current.partnerCellIndex).toBeNull();
```

Add `partnerCellIndex: null` to every expected StrictMode masked frame. Add this readiness/validation test:

```ts
it("does not announce a cell before synchronization or outside the grid", () => {
  const socket = new FakeSocket();
  const {result} = renderHook(() =>
    useMultiplayerRoom("ABC234", {storage: createStorage(), socketFactory: () => socket.asSocket()}),
  );
  act(() => {
    result.current.announceActiveCell(4);
    result.current.announceActiveCell(-1);
    result.current.announceActiveCell(81);
  });
  expect(events(socket, "room:selection")).toHaveLength(0);
  act(() => socket.serverEmit("room:snapshot", createSnapshot()));
  act(() => result.current.announceActiveCell(4));
  expect(events(socket, "room:selection")).toHaveLength(1);
});
```

- [ ] **Step 2: Run the hook test and verify failure**

Run:

```bash
pnpm exec vitest run src/lib/multiplayer/useMultiplayerRoom.test.ts
```

Expected: FAIL because the result has no partner state or announcement action.

- [ ] **Step 3: Implement room-scoped ephemeral hook state**

Add these public members and private state shapes:

```ts
export interface UseMultiplayerRoomResult {
  confirmed: RoomSnapshot | null;
  projected: ReturnType<typeof projectMultiplayerBoard>;
  status: MultiplayerRoomStatus;
  presence: 0 | 1 | 2;
  partnerCellIndex: number | null;
  online: boolean;
  error: RoomError | null;
  send: (action: RoomAction) => RoomCommand | null;
  announceActiveCell: (cellIndex: number) => void;
}

interface RoomScopedPartnerCell {
  roomCode: string;
  cellIndex: number | null;
}
```

Store the scoped partner cell alongside `scopedPresence`. Keep `selectedCellRef` and `lastAnnouncedCellRef` as `{roomCode, cellIndex} | null`. Reset all three on room changes. Register this listener and remove it during cleanup:

```ts
const handlePartnerSelection = (selection: PartnerSelection): void => {
  if (ownsActiveRoom() && selection.roomCode === roomCode) {
    setScopedPartnerCell({roomCode, cellIndex: selection.cellIndex});
  }
};
```

On disconnect, offline, resync restart, and cleanup, set the partner cell to `null` and reset `lastAnnouncedCellRef`; do not clear `selectedCellRef` during an ordinary reconnect. Use this helper after a successful join acknowledgement reaches a synchronized snapshot:

```ts
const reannounceCurrentSelection = (): void => {
  const selection = selectedCellRef.current;
  const current = clientStateRef.current;
  if (
    selection?.roomCode === roomCode &&
    current.confirmed !== null &&
    current.connectionStatus === "connected" &&
    current.syncStatus === "synced" &&
    (lastAnnouncedCellRef.current?.roomCode !== roomCode ||
      lastAnnouncedCellRef.current.cellIndex !== selection.cellIndex)
  ) {
    socket.emit("room:selection", selection);
    lastAnnouncedCellRef.current = selection;
  }
};
```

Call it immediately after `handleSnapshot(result.snapshot)` in the successful `room:join` acknowledgement branch.

Implement the public callback with exact validation and dedupe:

```ts
const announceActiveCell = React.useCallback((cellIndex: number): void => {
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 80) return;
  const selection = {roomCode, cellIndex};
  selectedCellRef.current = selection;
  const current = clientStateRef.current;
  const ready =
    committedRoomCodeRef.current === roomCode &&
    current.confirmed !== null &&
    current.connectionStatus === "connected" &&
    current.syncStatus === "synced";
  if (!ready || lastAnnouncedCellRef.current?.cellIndex === cellIndex) return;
  socket.emit("room:selection", selection);
  lastAnnouncedCellRef.current = selection;
}, [roomCode, socket]);
```

Return a non-null partner index only when the scoped room matches and the rendered connection is connected and synchronized.

- [ ] **Step 4: Verify hook behavior and typechecking**

Run:

```bash
pnpm exec vitest run src/lib/multiplayer/useMultiplayerRoom.test.ts
pnpm run typecheck:web
```

Expected: PASS.

- [ ] **Step 5: Commit the client transport adapter**

```bash
git add src/lib/multiplayer/useMultiplayerRoom.ts src/lib/multiplayer/useMultiplayerRoom.test.ts
git commit -m "feat: expose multiplayer partner selection"
```

## Task 4: Render the Partner Cell Without Changing Number Colors

**Files:**
- Modify: `src/components/sudoku/SudokuGrid.tsx`
- Modify: `src/components/sudoku/SudokuGrid.test.tsx`
- Modify: `src/components/sudoku/Sudoku.tsx`
- Modify: `src/pages/Game/GameView.tsx`
- Modify: `src/pages/Game/GameView.test.tsx`
- Modify: `src/pages/Game/MultiplayerGameController.tsx`
- Modify: `src/pages/Game/MultiplayerGameController.test.tsx`

**Interfaces:**
- Consumes Task 3's `partnerCellIndex` and `announceActiveCell`.
- Adds optional `partnerCellCoordinates?: CellCoordinates` to `GameViewProps` and `SudokuProps`.
- Adds required `partnerActive: boolean` to `GridCell`.
- Produces `data-cell-partner-active="true|false"` and `${testId}-partner` for browser tests.

- [ ] **Step 1: Write failing grid presentation tests**

Import `GridCell` in `SudokuGrid.test.tsx` and add this fixed-bounds helper:

```tsx
function renderGridCell({
  active = false,
  partnerActive = false,
}: {
  active?: boolean;
  partnerActive?: boolean;
}) {
  return load(
    renderToStaticMarkup(
      <GridCell
        active={active}
        ariaLabel="Editable cell row 1 column 1 empty"
        bounds={{left: 0, top: 0, width: 11.11, height: 11.11}}
        conflict={false}
        highlight={false}
        highlightNumber={false}
        initial={false}
        notesMode={false}
        number={0}
        partnerActive={partnerActive}
        testId="cell"
        onClick={() => {}}
        onRightClick={() => {}}
      />,
    ),
  );
}
```

Then assert:

```ts
it("adds a no-fill dashed emerald partner outline", () => {
  const $ = renderGridCell({active: false, partnerActive: true});
  const cell = $('[data-testid="cell"]');
  const partner = $('[data-testid="cell-partner"]');
  expect(cell.attr("data-cell-partner-active")).toBe("true");
  expect(partner.attr("class")).toContain("border-dashed");
  expect(partner.attr("class")).toContain("border-emerald-500");
  expect(partner.attr("class")).not.toContain("bg-");
});

it("keeps the local solid border and insets the partner outline on the same cell", () => {
  const $ = renderGridCell({active: true, partnerActive: true});
  expect($('[data-testid="cell"]').attr("class")).toContain("border-teal-400");
  expect($('[data-testid="cell"]').attr("class")).not.toContain("border-dashed");
  expect($('[data-testid="cell-partner"]').attr("style")).toContain("scale(0.8)");
});
```

The helper supplies all existing `GridCell` booleans, `bounds={{left: 0, top: 0, width: 11.11, height: 11.11}}`, no-op handlers, `testId="cell"`, and the passed `active`/`partnerActive` values.

- [ ] **Step 2: Run the grid test and verify failure**

Run:

```bash
pnpm exec vitest run src/components/sudoku/SudokuGrid.test.tsx
```

Expected: FAIL because `GridCell` has no partner indicator.

- [ ] **Step 3: Implement the independent partner overlay**

Add `partnerActive` to `GridCell` and retain the current local-border calculation unchanged. Add the data attribute to the interactive cell, then render this sibling before the background layer:

```tsx
{partnerActive ? (
  <div
    aria-hidden="true"
    data-testid={testId ? `${testId}-partner` : undefined}
    style={{...dimensions, transform: active ? "scale(0.8)" : undefined}}
    className="pointer-events-none absolute z-30 border-2 border-dashed border-emerald-500 dark:border-emerald-400"
  />
) : null}
```

Do not add a background class to this layer and do not modify `GridCellNumber` or `CellNote` colors.

- [ ] **Step 4: Thread optional coordinates through Sudoku and GameView**

In `Sudoku.tsx`, add `partnerCellCoordinates?: CellCoordinates`, calculate `isPartnerActive` by matching `x` and `y`, append `, other player selected` to that cell's accessible label, and pass `partnerActive={isPartnerActive}` to `GridCell`.

In `GameView.tsx`, add the same optional prop and pass this to `Sudoku`:

```tsx
partnerCellCoordinates={hideBoard ? undefined : partnerCellCoordinates}
```

Add this `GameView.test.tsx` case:

```tsx
it("hides partner presence while paused and restores it on resume", () => {
  const {props, rerender} = renderView({partnerCellCoordinates: {x: 1, y: 0}});
  const renderProps = (status: GameStateMachine) => (
    <AppDialogProvider>
      <GameView {...props} status={status} />
    </AppDialogProvider>
  );
  expect(screen.getByTestId("sudoku-cell-1-0").getAttribute("data-cell-partner-active")).toBe("true");
  rerender(renderProps(GameStateMachine.paused));
  expect(screen.getByTestId("sudoku-cell-1-0").getAttribute("data-cell-partner-active")).toBe("false");
  rerender(renderProps(GameStateMachine.running));
  expect(screen.getByTestId("sudoku-cell-1-0").getAttribute("data-cell-partner-active")).toBe("true");
});
```

- [ ] **Step 5: Wire the multiplayer controller and write its failing mapping test**

Extend the `createRoom` test helper with:

```ts
partnerCellIndex: null,
announceActiveCell: vi.fn(),
```

Add this controller test:

```tsx
it("maps partner and local cell indexes through the multiplayer room adapter", async () => {
  const user = userEvent.setup();
  const room = createRoom({partnerCellIndex: 10});
  renderController(room);
  expect(screen.getByTestId("sudoku-cell-1-1").getAttribute("data-cell-partner-active")).toBe("true");
  expect(screen.getByLabelText(/other player selected/)).toBeTruthy();
  await user.click(screen.getByTestId("sudoku-cell-2-3"));
  expect(room.announceActiveCell).toHaveBeenCalledWith(29);
});
```

In `MultiplayerGameController`, derive partner coordinates with `x = index % 9` and `y = Math.floor(index / 9)`. Replace the direct `setActiveCellCoordinates` prop with a callback that sets local state and calls `room.announceActiveCell(getCellIndex(coordinates))`. Pass the partner coordinates to `GameView`.

- [ ] **Step 6: Verify the complete rendering path**

Run:

```bash
pnpm exec vitest run src/components/sudoku/SudokuGrid.test.tsx src/pages/Game/GameView.test.tsx src/pages/Game/MultiplayerGameController.test.tsx
pnpm run typecheck:web
```

Expected: PASS, with existing orange entry, white given, and green note tests unchanged.

- [ ] **Step 7: Commit partner-cell rendering**

```bash
git add src/components/sudoku/Sudoku.tsx src/components/sudoku/SudokuGrid.tsx src/components/sudoku/SudokuGrid.test.tsx src/pages/Game/GameView.tsx src/pages/Game/GameView.test.tsx src/pages/Game/MultiplayerGameController.tsx src/pages/Game/MultiplayerGameController.test.tsx
git commit -m "feat: show multiplayer partner cell"
```

## Task 5: Compact the Room Status and Keep Copy Feedback In-Button

**Files:**
- Modify: `src/pages/Game/MultiplayerStatus.tsx`
- Create: `src/pages/Game/MultiplayerStatus.test.tsx`
- Modify: `src/pages/Game/MultiplayerGameController.tsx`
- Modify: `src/pages/Game/MultiplayerGameController.test.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/de.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/fr.json`
- Modify: `src/locales/it.json`
- Modify: `src/locales/pt.json`
- Modify: `src/locales/zh.json`

**Interfaces:**
- Replaces `copyMessage: string | null` with `copyState: "idle" | "copied" | "failed"`.
- Keeps `onCopyLink(): void` and the fixed accessible name from `multiplayer_copy_link`.
- Produces one `multiplayer-primary-row` and one hidden `multiplayer-copy-announcement`.

- [ ] **Step 1: Write failing status and copy-state tests**

Create `MultiplayerStatus.test.tsx` with this setup before the assertion:

```tsx
// @vitest-environment jsdom
import * as React from "react";
import {cleanup, render, screen} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import {MultiplayerStatus} from "./MultiplayerStatus";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: {count?: number}) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

afterEach(cleanup);
```

Then assert:

```tsx
render(
  <MultiplayerStatus
    copyState="copied"
    error={null}
    online
    presence={2}
    roomCode="ABC234"
    status="connected"
    onCopyLink={vi.fn()}
    onRetry={vi.fn()}
  />,
);
expect(screen.getByTestId("multiplayer-primary-row").textContent).toContain("multiplayer_room_label");
expect(screen.getByTestId("multiplayer-primary-row").textContent).toContain("ABC234");
expect(screen.getByTestId("multiplayer-primary-row").textContent).toContain("multiplayer_presence_fraction");
expect(screen.getByTestId("multiplayer-copy-button").textContent).toContain("multiplayer_copied");
expect(screen.getByTestId("multiplayer-copy-announcement").textContent).toContain("multiplayer_link_copied");
expect(screen.queryByText(/https?:\/\//)).toBeNull();
```

Update the controller clipboard tests to use fake timers and these exact assertions:

```ts
fireEvent.click(screen.getByRole("button", {name: "multiplayer_copy_link"}));
await act(async () => Promise.resolve());
expect(screen.getByTestId("multiplayer-copy-button").textContent).toContain("multiplayer_copied");
act(() => vi.advanceTimersByTime(2_000));
expect(screen.getByTestId("multiplayer-copy-button").textContent).toContain("multiplayer_copy");

// Clipboard API unavailable case
fireEvent.click(screen.getByRole("button", {name: "multiplayer_copy_link"}));
await act(async () => Promise.resolve());
expect(screen.getByTestId("multiplayer-copy-button").textContent).toContain("multiplayer_copy_failed");
expect(screen.queryByText(window.location.href)).toBeNull();
```

- [ ] **Step 2: Run the focused UI tests and verify failure**

Run:

```bash
pnpm exec vitest run src/pages/Game/MultiplayerStatus.test.tsx src/pages/Game/MultiplayerGameController.test.tsx
```

Expected: FAIL because copy feedback still creates a visible paragraph and never resets.

- [ ] **Step 3: Implement the compact row and timed copy state**

Export `type CopyState = "idle" | "copied" | "failed"` from `MultiplayerStatus.tsx`. Render the primary row with:

```tsx
<div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="multiplayer-primary-row">
  <span>{t("multiplayer_room_label")}</span>
  <span className="font-mono font-bold" data-testid="multiplayer-room-code">{roomCode}</span>
  <span
    aria-hidden="true"
    className={`h-2 w-2 rounded-full ${online && status === "connected" && error === null ? "bg-emerald-400" : "bg-amber-400"}`}
    data-testid="multiplayer-presence-dot"
  />
  <span aria-label={t("multiplayer_connected_count", {count: presence})}>
    {t("multiplayer_presence_fraction", {count: presence})}
  </span>
  <Button
    aria-label={t("multiplayer_copy_link")}
    className="ml-auto min-h-9 bg-teal-700 text-white dark:bg-teal-600"
    data-testid="multiplayer-copy-button"
    onClick={onCopyLink}
  >
    {copyState === "copied"
      ? `${t("multiplayer_copied")} ✓`
      : copyState === "failed"
        ? t("multiplayer_copy_failed")
        : t("multiplayer_copy")}
  </Button>
</div>
```

Add this visually hidden polite live region and delete the visible copy paragraph:

```tsx
<span aria-live="polite" className="sr-only" data-testid="multiplayer-copy-announcement">
  {copyState === "copied"
    ? t("multiplayer_link_copied")
    : copyState === "failed"
      ? t("multiplayer_copy_failed")
      : ""}
</span>
```

Preserve the conditional reconnect/error/retry row below the primary row.

In the controller, replace `copyMessage` with this state and lifecycle:

```ts
const [copyState, setCopyState] = React.useState<CopyState>("idle");
const copyResetTimerRef = React.useRef<number | null>(null);

const showCopyState = React.useCallback((nextState: Exclude<CopyState, "idle">) => {
  if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
  setCopyState(nextState);
  copyResetTimerRef.current = window.setTimeout(() => {
    setCopyState("idle");
    copyResetTimerRef.current = null;
  }, 2_000);
}, []);

React.useEffect(
  () => () => {
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
  },
  [],
);

const copyRoomLink = React.useCallback(async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(window.location.href);
    showCopyState("copied");
  } catch {
    showCopyState("failed");
  }
}, [showCopyState]);
```

Pass `copyState` in both controller render branches. Failure must not store or display the URL.

- [ ] **Step 4: Add exact locale strings**

Add these keys to each locale, preserving valid JSON:

```json
// en
"multiplayer_room_label": "Room:",
"multiplayer_presence_fraction": "{{count}}/2",
"multiplayer_copy": "Copy",
"multiplayer_copied": "Copied",
"multiplayer_copy_failed": "Copy failed"

// de
"multiplayer_room_label": "Raum:",
"multiplayer_presence_fraction": "{{count}}/2",
"multiplayer_copy": "Kopieren",
"multiplayer_copied": "Kopiert",
"multiplayer_copy_failed": "Kopieren fehlgeschlagen"

// es
"multiplayer_room_label": "Sala:",
"multiplayer_presence_fraction": "{{count}}/2",
"multiplayer_copy": "Copiar",
"multiplayer_copied": "Copiado",
"multiplayer_copy_failed": "Error al copiar"

// fr
"multiplayer_room_label": "Salle :",
"multiplayer_presence_fraction": "{{count}}/2",
"multiplayer_copy": "Copier",
"multiplayer_copied": "Copié",
"multiplayer_copy_failed": "Échec de la copie"

// it
"multiplayer_room_label": "Stanza:",
"multiplayer_presence_fraction": "{{count}}/2",
"multiplayer_copy": "Copia",
"multiplayer_copied": "Copiato",
"multiplayer_copy_failed": "Copia non riuscita"

// pt
"multiplayer_room_label": "Sala:",
"multiplayer_presence_fraction": "{{count}}/2",
"multiplayer_copy": "Copiar",
"multiplayer_copied": "Copiado",
"multiplayer_copy_failed": "Falha ao copiar"

// zh
"multiplayer_room_label": "房间：",
"multiplayer_presence_fraction": "{{count}}/2",
"multiplayer_copy": "复制",
"multiplayer_copied": "已复制",
"multiplayer_copy_failed": "复制失败"
```

The `// locale` markers describe the destination file and are not inserted into JSON.

- [ ] **Step 5: Verify status behavior**

Run:

```bash
pnpm exec vitest run src/pages/Game/MultiplayerStatus.test.tsx src/pages/Game/MultiplayerGameController.test.tsx
pnpm run typecheck:web
```

Expected: PASS.

- [ ] **Step 6: Commit the compact status**

```bash
git add src/pages/Game/MultiplayerStatus.tsx src/pages/Game/MultiplayerStatus.test.tsx src/pages/Game/MultiplayerGameController.tsx src/pages/Game/MultiplayerGameController.test.tsx src/locales
git commit -m "feat: compact multiplayer room status"
```

## Task 6: Center and Clarify the Join Existing Form

**Files:**
- Modify: `src/pages/Game/OnlineRoomControls.tsx`
- Modify: `src/pages/Game/OnlineRoomControls.test.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/de.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/fr.json`
- Modify: `src/locales/it.json`
- Modify: `src/locales/pt.json`
- Modify: `src/locales/zh.json`

**Interfaces:**
- Keeps all existing props and `normalizeRoomCode` behavior.
- Produces `join-room-form`, a centered input, a centered `Join room` button, and a join-scoped error.

- [ ] **Step 1: Write failing hierarchy, focus, and submission tests**

Add a focused-pointer `matchMedia` stub and this case to `OnlineRoomControls.test.tsx`:

```ts
it("centers and focuses the vertical Join Existing form while preserving Enter submission", async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn()})));
  const onJoin = vi.fn();
  const user = userEvent.setup();
  render(
    <OnlineRoomControls
      creating={false}
      error="Join failed"
      mode="join-online"
      online
      onJoin={onJoin}
      onModeChange={vi.fn()}
    />,
  );

  const form = screen.getByTestId("join-room-form");
  const input = screen.getByLabelText("multiplayer_room_code");
  expect(form.className).toContain("items-center");
  expect(input.className).toContain("text-center");
  expect(document.activeElement).toBe(input);
  expect(screen.getByRole("heading", {name: "select_mode_join_online"})).toBeTruthy();
  expect(screen.getByText("multiplayer_join_description")).toBeTruthy();
  expect(form.textContent).toContain("Join failed");

  await user.type(input, "abc234{Enter}");
  expect(onJoin).toHaveBeenCalledWith("ABC234");
});
```

Retain the existing invalid-code and offline tests, updating the submit-button name to `multiplayer_join_room`.

- [ ] **Step 2: Run the form test and verify failure**

Run:

```bash
pnpm exec vitest run src/pages/Game/OnlineRoomControls.test.tsx
```

Expected: FAIL because the form is horizontal, has no heading/supporting text, and does not focus on mode entry.

- [ ] **Step 3: Implement the centered form**

Add an input ref and focus it only for a fine pointer:

```ts
const roomCodeInputRef = React.useRef<HTMLInputElement>(null);
React.useEffect(() => {
  const finePointer = typeof window.matchMedia !== "function" || window.matchMedia("(pointer: fine)").matches;
  if (mode === "join-online" && finePointer) roomCodeInputRef.current?.focus();
}, [mode]);
```

Replace the join form wrapper with:

```tsx
<form
  className="mx-auto mt-6 flex max-w-sm flex-col items-center text-center"
  data-testid="join-room-form"
  onSubmit={submitRoomCode}
>
  <h2 className="text-lg font-semibold text-white">{t("select_mode_join_online")}</h2>
  <p className="mt-1 text-sm text-gray-300">{t("multiplayer_join_description")}</p>
  <label className="mt-4 block text-sm font-medium text-white" htmlFor="multiplayer-room-code">
    {t("multiplayer_room_code")}
  </label>
  <input
    ref={roomCodeInputRef}
    aria-invalid={invalidCode}
    autoCapitalize="characters"
    autoComplete="off"
    className="mt-2 w-full max-w-xs rounded-sm border border-gray-400 bg-white px-3 py-2 text-center font-mono uppercase text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-300"
    disabled={!online || creating}
    id="multiplayer-room-code"
    maxLength={6}
    onChange={(event) => {
      setRoomCode(event.target.value.toUpperCase());
      setInvalidCode(false);
    }}
    placeholder="ABC234"
    value={roomCode}
  />
  <Button className="mt-3 bg-teal-600 text-white dark:bg-teal-600" disabled={!online || creating} type="submit">
    {t("multiplayer_join_room")}
  </Button>
  {invalidCode ? <p className="mt-2 text-sm text-red-300" role="alert">{t("multiplayer_invalid_room_code")}</p> : null}
  {error ? <p className="mt-3 text-sm text-red-300" role="alert">{error}</p> : null}
</form>
```

Render the generic `error` outside the form only when `mode !== "join-online"`, preventing duplicate alerts. Add `vi.unstubAllGlobals()` to test cleanup after the `matchMedia` stub.

- [ ] **Step 4: Add exact join locale strings**

Add:

```json
// en
"multiplayer_join_description": "Enter a room code to join a shared puzzle.",
"multiplayer_join_room": "Join room"

// de
"multiplayer_join_description": "Gib einen Raumcode ein, um einem gemeinsamen Sudoku beizutreten.",
"multiplayer_join_room": "Raum beitreten"

// es
"multiplayer_join_description": "Introduce un código de sala para unirte a un sudoku compartido.",
"multiplayer_join_room": "Unirse a la sala"

// fr
"multiplayer_join_description": "Saisissez un code de salle pour rejoindre un sudoku partagé.",
"multiplayer_join_room": "Rejoindre la salle"

// it
"multiplayer_join_description": "Inserisci un codice stanza per unirti a un sudoku condiviso.",
"multiplayer_join_room": "Entra nella stanza"

// pt
"multiplayer_join_description": "Introduza um código de sala para entrar num sudoku partilhado.",
"multiplayer_join_room": "Entrar na sala"

// zh
"multiplayer_join_description": "输入房间代码以加入共享数独。",
"multiplayer_join_room": "加入房间"
```

The `// locale` markers describe destination files and are not inserted into JSON.

- [ ] **Step 5: Verify Join Existing behavior**

Run:

```bash
pnpm exec vitest run src/pages/Game/OnlineRoomControls.test.tsx src/pages/SelectGame.test.tsx
pnpm run typecheck:web
```

Expected: PASS; Create Online and Solo still render their existing puzzle-picker behavior.

- [ ] **Step 6: Commit the Join Existing redesign**

```bash
git add src/pages/Game/OnlineRoomControls.tsx src/pages/Game/OnlineRoomControls.test.tsx src/locales
git commit -m "feat: center multiplayer room join form"
```

## Task 7: Prove the Complete Two-Browser Experience

**Files:**
- Modify: `e2e/multiplayer.e2e.ts`
- Modify: `e2e/select-game.e2e.ts`

**Interfaces:**
- Consumes all Tasks 1–6.
- Produces browser-level proof of the approved visual and lifecycle behavior.

- [ ] **Step 1: Extend the Select Game browser assertions**

Update submit lookups from `Join` to `Join room` in both browser files, and change visible presence assertions from `2/2 connected` to `2/2`. In the mode-switch test, assert the Join Existing heading and supporting text. Add bounding-box checks that the input and submit button centers are within two pixels of the `join-room-form` center:

```ts
const formBox = await page.getByTestId("join-room-form").boundingBox();
const inputBox = await page.getByLabel("Room code").boundingBox();
const buttonBox = await page.getByRole("button", {name: "Join room"}).boundingBox();
if (!formBox || !inputBox || !buttonBox) throw new Error("Join room controls must be visible");
const center = (box: {x: number; width: number}) => box.x + box.width / 2;
expect(Math.abs(center(inputBox) - center(formBox))).toBeLessThanOrEqual(2);
expect(Math.abs(center(buttonBox) - center(formBox))).toBeLessThanOrEqual(2);
```

- [ ] **Step 2: Add partner-selection and copy assertions to the main multiplayer flow**

Before entering values, select successive creator cells and assert the old/new partner attributes. Select the same cell on the joiner and assert both attributes are true. After pause, assert the partner attribute is false; after resume, assert it returns. Grant clipboard permissions to the creator context and assert clicking the fixed accessible `Copy room link` button changes visible text to `Copied` without changing the status container height.

Use these exact assertions:

```ts
await cell(creator, 5, 0).click();
await expect(cell(joiner, 5, 0)).toHaveAttribute("data-cell-partner-active", "true");
await cell(creator, 7, 0).click();
await expect(cell(joiner, 5, 0)).toHaveAttribute("data-cell-partner-active", "false");
await expect(cell(joiner, 7, 0)).toHaveAttribute("data-cell-partner-active", "true");
await cell(joiner, 7, 0).click();
await expect(cell(joiner, 7, 0)).toHaveAttribute("data-cell-active", "true");
await expect(cell(joiner, 7, 0)).toHaveAttribute("data-cell-partner-active", "true");
```

For keyboard and pause coverage, use:

```ts
await cell(creator, 7, 0).click();
await creator.keyboard.press("ArrowRight");
await expect(cell(joiner, 8, 0)).toHaveAttribute("data-cell-partner-active", "true");
await creator.getByTestId("sudoku-action-pause").click();
await expect(cell(joiner, 8, 0)).toHaveAttribute("data-cell-partner-active", "false");
await joiner.getByTestId("continue-overlay").click();
await expect(cell(joiner, 8, 0)).toHaveAttribute("data-cell-partner-active", "true");

await creatorContext.grantPermissions(["clipboard-read", "clipboard-write"], {origin: baseURL});
const status = creator.getByTestId("multiplayer-status");
const beforeCopy = await status.boundingBox();
await creator.getByRole("button", {name: "Copy room link"}).click();
await expect(creator.getByTestId("multiplayer-copy-button")).toContainText("Copied");
const afterCopy = await status.boundingBox();
if (!beforeCopy || !afterCopy) throw new Error("Multiplayer status must be visible");
expect(afterCopy.height).toBe(beforeCopy.height);
```

- [ ] **Step 3: Add latest-tab and final-disconnect browser coverage**

Add this focused test with touch enabled for the shared-guest context:

```ts
test("uses the latest same-guest tab and clears only its final disconnect", async ({baseURL, browser}) => {
  if (!baseURL) throw new Error("Playwright baseURL must be configured");
  const creatorContext = await browser.newContext({
    baseURL,
    hasTouch: true,
    viewport: {width: 390, height: 844},
  });
  const joinerContext = await newProfile(browser, baseURL);
  try {
    const creator = await creatorContext.newPage();
    const joiner = await joinerContext.newPage();
    const roomCode = await createEasyRoom(creator);
    await joinRoom(joiner, roomCode);
    const creatorExtra = await creatorContext.newPage();
    await creatorExtra.goto(`/#/room/${roomCode}`);
    await expect(creatorExtra.getByTestId("sudoku-board")).toBeVisible();

    await cell(creatorExtra, 5, 0).tap();
    await expect(cell(joiner, 5, 0)).toHaveAttribute("data-cell-partner-active", "true");
    await cell(creator, 7, 0).tap();
    await expect(cell(joiner, 5, 0)).toHaveAttribute("data-cell-partner-active", "false");
    await expect(cell(joiner, 7, 0)).toHaveAttribute("data-cell-partner-active", "true");

    await creatorExtra.close();
    await expect(cell(joiner, 7, 0)).toHaveAttribute("data-cell-partner-active", "true");
    await creator.close();
    await expect(cell(joiner, 7, 0)).toHaveAttribute("data-cell-partner-active", "false");
    await expect(joiner.getByTestId("multiplayer-status")).toContainText("1/2");
  } finally {
    await creatorContext.close();
    await joinerContext.close();
  }
});
```

- [ ] **Step 4: Extend reconnect coverage**

Add these assertions around the existing offline transition:

```ts
await cell(reconnecting, 8, 0).click();
await expect(cell(creator, 8, 0)).toHaveAttribute("data-cell-partner-active", "true");
await reconnectingContext.setOffline(true);
await expect(cell(creator, 8, 0)).toHaveAttribute("data-cell-partner-active", "false");
await expect(cell(reconnecting, 8, 0)).toHaveAttribute("data-cell-partner-active", "false");

await reconnectingContext.setOffline(false);
await expect(cell(creator, 8, 0)).toHaveAttribute("data-cell-partner-active", "true");
```

- [ ] **Step 5: Run focused browser suites**

Run:

```bash
pnpm exec playwright test e2e/select-game.e2e.ts
pnpm run test:e2e:multiplayer
```

Expected: Select Game passes in both configured light/dark projects and all multiplayer tests pass in the isolated in-memory two-browser server.

- [ ] **Step 6: Run the full verification matrix**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm build
pnpm run test:e2e
pnpm run test:e2e:multiplayer
git diff --check
```

Expected: every command exits `0`; ordinary Playwright excludes the multiplayer file and the dedicated command runs it once against the disposable local backend.

- [ ] **Step 7: Commit browser coverage**

```bash
git add e2e/multiplayer.e2e.ts e2e/select-game.e2e.ts
git commit -m "test: cover multiplayer cell presence polish"
```

## Execution Handoff

The selected execution mode is **Subagent-Driven**. Dispatch one fresh implementation subagent per task, then run a specification-compliance review followed by a code-quality review before accepting each task. Do not allow concurrent agents to edit the shared worktree.
