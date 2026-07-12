# Online Multiplayer Sudoku Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-guest, server-authoritative collaborative Sudoku mode while preserving the current Netlify-hosted PWA's fully offline solo behaviour.

**Architecture:** Keep one pnpm repository with three boundaries: a pure shared Sudoku core, a validated multiplayer protocol/domain reducer, and a separately deployed Node.js/Socket.IO server backed by Neon Postgres. The React client lazy-loads multiplayer routes, renders optimistic pending commands over a confirmed room snapshot, and replaces that state from the server after reconnects or gaps.

**Tech Stack:** Node.js 24+, pnpm 11.9.0, React 18, TypeScript, Vite, TanStack Router, Socket.IO, Zod, PostgreSQL via `pg`, Neon, Fly.io, Netlify, Vitest, PGlite for repository integration tests, and Playwright.

## Global Constraints

- Use `pnpm@11.9.0` and Node.js 24 or newer everywhere.
- Preserve `https://sudoku.slpixe.com` on Netlify as the static PWA and use `https://multi.sudoku.slpixe.com` for the Fly.io service.
- Use the existing hash-router contract; room links are `https://sudoku.slpixe.com/#/room/<CODE>`.
- Solo must remain fully playable from the warmed PWA cache with no backend connection.
- Create Online offers only `easy`, `medium`, `hard`, `expert`, and `evil`; custom local collections remain Solo-only.
- Treat existing built-in puzzle lines as immutable identities; append new puzzles only. Room creation sends the selected puzzle's 81-character givens fingerprint and rejects a mismatch with the server catalog.
- Rooms allow two concurrently connected distinct `guestId` values; same-guest tabs share a seat and disconnected seats remain reserved for 60 seconds.
- Persist rooms for 24 hours after the last participant disconnects; never expire a room with an active connection.
- Keep givens white, entered values orange, and notes green; do not add player attribution or player-specific colors.
- Values, notes, hint, pause/resume, completion, and undo are shared. Clear is confirmed, resets the shared timer and undo stack, and is not undoable.
- New Game leaves only the current participant and must not mutate or pause the shared room.
- Commit every accepted mutation to Postgres before broadcasting it.
- Use no Redis, accounts, profiles, race mode, chat, host privileges, or custom-puzzle upload in this implementation.
- Keep the existing baseline commands working: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm build`, and `pnpm run test:e2e`.
- Before implementation starts, follow `AGENTS.md`: select or create the GitHub issue, comment `Claiming this for the current OpenCode session.`, and keep follow-up scope in linked issues.

---

## File Structure

### Shared packages

- Create `packages/sudoku-core/`: browser/server-neutral parsing, grid helpers, and backtracking solver extracted behind existing compatibility wrappers.
- Create `packages/multiplayer-protocol/`: Socket.IO payload schemas, room/domain types, pure board command application, inverse application, and client projection helpers.

### Multiplayer server

- Create `server/src/catalog/`: base-collection file lookup and canonical puzzle solving.
- Create `server/src/db/`: database abstraction, `pg` implementation, migrations, row mapping, and repository.
- Create `server/src/rooms/`: room code generation, per-room queue, room service, timers, undo, expiry, and presence.
- Create `server/src/transport/`: typed Socket.IO events and connection handlers.
- Create `server/src/app.ts` and `server/src/index.ts`: dependency assembly, health/readiness, cleanup scheduling, and process lifecycle.
- Create `server/migrations/001_multiplayer_rooms.sql`, `server/Dockerfile`, and `server/fly.toml`.

### Web client

- Create `src/lib/multiplayer/`: guest identity, client reducer, Socket.IO adapter, and React room hook.
- Create `src/pages/MultiplayerGame.tsx` and `src/pages/Game/MultiplayerGameController.tsx`.
- Create `src/pages/Game/GameView.tsx`: presentation shared by solo and multiplayer controllers.
- Modify Select Game, routing, game header/timer seams, locale strings, PWA tests, and Playwright configuration.

## Task 1: Extract a Browser/Server-Neutral Sudoku Core

**Files:**
- Create: `packages/sudoku-core/package.json`
- Create: `packages/sudoku-core/tsconfig.json`
- Create: `packages/sudoku-core/src/index.ts`
- Create: `packages/sudoku-core/src/grid.ts`
- Create: `packages/sudoku-core/src/solver.ts`
- Create: `packages/sudoku-core/src/grid.test.ts`
- Create: `packages/sudoku-core/src/solver.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `src/lib/engine/types.ts`
- Modify: `src/lib/engine/utility.ts`
- Modify: `src/lib/engine/solverBacktracking.ts`
- Modify: `eslint.config.js`
- Modify: `vite.config.ts`

**Interfaces:**
- Produces `@sudoku/core` exports:
  - `type SimpleSudoku = number[][]`
  - `type BaseCollectionId = "easy" | "medium" | "hard" | "expert" | "evil"`
  - `BASE_COLLECTION_IDS: readonly BaseCollectionId[]`
  - `SUDOKU_COORDINATES`, `SUDOKU_NUMBERS`
  - `parseSudoku(text: string): SimpleSudoku`
  - `stringifySudoku(grid: SimpleSudoku): string`
  - `squareIndex(x: number, y: number): number`
  - `solveBacktracking(grid: SimpleSudoku): {sudoku: SimpleSudoku | null; iterations: number}`
  - `countSolutions(grid: SimpleSudoku, limit?: number): {count: number; firstSolution: SimpleSudoku | null; iterations: number}`
- Existing `src/lib/engine/*` imports remain source-compatible through re-exports.

- [ ] **Step 1: Add workspace discovery and package scripts**

Add this at the top of `pnpm-workspace.yaml`:

```yaml
packages:
  - "."
  - "packages/*"
  - "server"
```

Add root scripts that keep current command names as aggregators:

```json
{
  "scripts": {
    "build:web": "vite build",
    "build": "pnpm --filter @sudoku/core build && pnpm --filter @sudoku/multiplayer-protocol build && pnpm run build:web && pnpm --filter @sudoku/multiplayer-server build",
    "test:web": "vitest run",
    "test": "pnpm run test:web && pnpm --filter @sudoku/core test && pnpm --filter @sudoku/multiplayer-protocol test && pnpm --filter @sudoku/multiplayer-server test",
    "typecheck:web": "tsc --noEmit",
    "typecheck": "pnpm run typecheck:web && pnpm --filter @sudoku/core typecheck && pnpm --filter @sudoku/multiplayer-protocol typecheck && pnpm --filter @sudoku/multiplayer-server typecheck"
  }
}
```

Until Tasks 2–3 create the remaining packages, add only the scripts whose filters exist; extend the aggregators in those tasks.

- [ ] **Step 2: Write package characterization tests**

Port the current parse/stringify and solver cases into the new tests, including:

```ts
import {describe, expect, it} from "vitest";
import {countSolutions, parseSudoku, solveBacktracking, stringifySudoku} from "./index";

const EASY = "534920700060007309900000010008700000496803002721594806000200940800046100003000000";

describe("sudoku core", () => {
  it("round-trips an 81-character puzzle", () => {
    expect(stringifySudoku(parseSudoku(EASY))).toBe(EASY);
  });

  it("solves a valid catalog puzzle", () => {
    const result = solveBacktracking(parseSudoku(EASY));
    expect(result.sudoku).not.toBeNull();
    expect(stringifySudoku(result.sudoku!)).not.toContain("0");
  });

  it("rejects conflicting givens", () => {
    const invalid = parseSudoku(`55${"0".repeat(79)}`);
    expect(solveBacktracking(invalid).sudoku).toBeNull();
    expect(countSolutions(invalid).count).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests and verify the package is missing**

Run: `pnpm --filter @sudoku/core test`

Expected: FAIL because `packages/sudoku-core/package.json` does not exist.

- [ ] **Step 4: Create the package**

Use this package contract:

```json
{
  "name": "@sudoku/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "exports": {".": {"types": "./src/index.ts", "development": "./src/index.ts", "default": "./dist/index.js"}},
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {"typescript": "5.8.3", "vitest": "3.2.6"}
}
```

Use `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `declaration: true`, `outDir: "dist"`, and `strict: true` in its tsconfig. Move the pure implementations from `types.ts`, `utility.ts`, and `solverBacktracking.ts` without importing React, lodash, Vite, or browser globals.

- [ ] **Step 5: Preserve existing import paths**

Run `pnpm add --save-exact '@sudoku/core@workspace:*'`. Then make `src/lib/engine/types.ts` import and re-export `SimpleSudoku`, make `solverBacktracking.ts` re-export the package solver functions, and make `utility.ts` re-export the core constants and grid helpers while retaining only cell/lodash-specific helpers locally.

- [ ] **Step 6: Configure Node and browser lint scopes**

Add `packages/**` and `server/**` TypeScript overrides using `globals.node`, their own tsconfigs, and the existing TypeScript/import rules. Keep `src/**` and `e2e/**` on browser globals. Add `"packages/**"` and `"server/**"` to the root Vitest exclusions so `test:web` runs only the existing web suite; package scripts own package/server tests.

- [ ] **Step 7: Install and verify**

Run:

```bash
pnpm install
pnpm --filter @sudoku/core test
pnpm run test:web -- src/lib/engine/solverBacktracking.test.ts src/lib/engine/generate.test.ts
pnpm run typecheck:web
```

Expected: all pass and `pnpm-lock.yaml` records `@sudoku/core` as a workspace dependency.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml eslint.config.js vite.config.ts packages/sudoku-core src/lib/engine
git commit -m "refactor: extract shared sudoku core"
```

## Task 2: Define the Multiplayer Protocol and Pure Room Reducer

**Files:**
- Create: `packages/multiplayer-protocol/package.json`
- Create: `packages/multiplayer-protocol/tsconfig.json`
- Create: `packages/multiplayer-protocol/src/types.ts`
- Create: `packages/multiplayer-protocol/src/schemas.ts`
- Create: `packages/multiplayer-protocol/src/roomReducer.ts`
- Create: `packages/multiplayer-protocol/src/clientProjection.ts`
- Create: `packages/multiplayer-protocol/src/index.ts`
- Create: `packages/multiplayer-protocol/src/schemas.test.ts`
- Create: `packages/multiplayer-protocol/src/roomReducer.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `@sudoku/multiplayer-protocol`.
- Produces `MULTIPLAYER_PROTOCOL_VERSION = 1`.
- `RoomBoard` contains `givens`, `solution`, and `values` as 81-number arrays plus `notes` as 81 arrays of unique digits 1–9.
- `RoomCommand` is an envelope `{commandId, roomCode, baseRevision, action}`.
- `RoomSnapshot` includes board, revision, status, elapsed milliseconds, running timestamp, server timestamp, `canUndo`, connected guest count, and expiry.
- `RoomEvent` includes `commandId`, accepted `action`, new `revision`, resulting mutable board/status/timer fields, `serverNow`, and `canUndo`; it omits immutable puzzle identity fields.
- `applyBoardAction(board, action)` returns `{board, inverse}` for set number, set notes, erase, and hint.
- `applyInverse(board, inverse)` restores every directly or indirectly affected cell.
- `projectPendingCommands(confirmed, pending)` derives optimistic client board state.

- [ ] **Step 1: Write schema tests**

Create exact acceptance/rejection coverage:

```ts
expect(roomCommandSchema.parse({
  commandId: crypto.randomUUID(),
  roomCode: "ABC234",
  baseRevision: 3,
  action: {type: "setNumber", cellIndex: 8, number: 7},
})).toMatchObject({roomCode: "ABC234"});

expect(() => roomCommandSchema.parse({
  commandId: "not-a-uuid",
  roomCode: "O0I1ZZ",
  baseRevision: -1,
  action: {type: "setNumber", cellIndex: 81, number: 10},
})).toThrow();
```

Cover all action variants: `setNumber`, `setNotes`, `clearCell`, `hint`, `undo`, `pause`, `resume`, and `clear`.

- [ ] **Step 2: Write reducer tests**

Assert:

- a number clears notes from its row, column, and box exactly like the solo reducer;
- notes are sorted, deduplicated, and rejected outside 1–9;
- givens cannot change;
- hint copies the canonical solution value;
- inverse application restores every changed note and value;
- `projectPendingCommands` applies only board actions and ignores pause/resume/undo/clear until confirmed.

- [ ] **Step 3: Run tests and verify failure**

Run: `pnpm --filter @sudoku/multiplayer-protocol test`

Expected: FAIL because the package does not exist.

- [ ] **Step 4: Implement exact public types**

Create the package with the same private ESM build/test/typecheck scripts and source-types/development export conditions as `@sudoku/core`, then run:

```bash
pnpm --dir packages/multiplayer-protocol add --save-exact '@sudoku/core@workspace:*' zod
pnpm --dir packages/multiplayer-protocol add --save-dev --save-exact typescript vitest
```

Define:

```ts
export const MULTIPLAYER_PROTOCOL_VERSION = 1;
export type RoomStatus = "running" | "paused" | "completed";
export interface RoomBoard {
  givens: number[];
  solution: number[];
  values: number[];
  notes: number[][];
}
export type BoardAction =
  | {type: "setNumber"; cellIndex: number; number: number}
  | {type: "setNotes"; cellIndex: number; notes: number[]}
  | {type: "clearCell"; cellIndex: number}
  | {type: "hint"; cellIndex: number};
export type RoomAction =
  | BoardAction
  | {type: "undo"}
  | {type: "pause"}
  | {type: "resume"}
  | {type: "clear"};
export interface RoomCommand {
  commandId: string;
  roomCode: string;
  baseRevision: number;
  action: RoomAction;
}
export interface CellInverse {
  cellIndex: number;
  value: number;
  notes: number[];
}
export interface UndoEntry {
  cells: CellInverse[];
}
export interface RoomSnapshot {
  roomCode: string;
  collectionId: import("@sudoku/core").BaseCollectionId;
  puzzleNumber: number;
  board: RoomBoard;
  revision: number;
  status: RoomStatus;
  elapsedMs: number;
  runningSince: number | null;
  serverNow: number;
  canUndo: boolean;
  connectedGuests: 0 | 1 | 2;
  expiresAt: string;
}
export interface RoomEvent {
  commandId: string;
  action: RoomAction;
  revision: number;
  board: RoomBoard;
  status: RoomStatus;
  elapsedMs: number;
  runningSince: number | null;
  serverNow: number;
  canUndo: boolean;
}
```

Keep wire schemas in `schemas.ts`, pure mutation logic in `roomReducer.ts`, and optimistic projection in `clientProjection.ts`.

- [ ] **Step 5: Build and verify**

Run:

```bash
pnpm install
pnpm --filter @sudoku/multiplayer-protocol test
pnpm --filter @sudoku/multiplayer-protocol typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml packages/multiplayer-protocol
git commit -m "feat: define multiplayer room protocol"
```

## Task 3: Scaffold the Server and Canonical Puzzle Catalog

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/config.ts`
- Create: `server/src/catalog/PuzzleCatalog.ts`
- Create: `server/src/catalog/FilePuzzleCatalog.ts`
- Create: `server/src/catalog/FilePuzzleCatalog.test.ts`
- Create: `server/src/rooms/roomCode.ts`
- Create: `server/src/rooms/roomCode.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `Dockerfile`

**Interfaces:**
- Consumes `@sudoku/core` and `@sudoku/multiplayer-protocol`.
- Produces:
  - `PuzzleCatalog.get(collectionId: BaseCollectionId, puzzleNumber: number): Promise<CanonicalPuzzle>`
  - `CanonicalPuzzle = {collectionId, puzzleNumber, givens: number[], solution: number[]}`
  - `createRoomCode(randomBytes?: (size: number) => Uint8Array): string`
  - validated `ServerConfig`.

- [ ] **Step 1: Add exact dependencies**

Create `server/package.json` first with name `@sudoku/multiplayer-server`, version `0.1.0`, `private: true`, and `type: "module"`. Then run:

```bash
pnpm --dir server add --save-exact '@sudoku/core@workspace:*' '@sudoku/multiplayer-protocol@workspace:*' pg socket.io zod
pnpm --dir server add --save-dev --save-exact @electric-sql/pglite @types/node @types/pg socket.io-client tsx typescript vitest
```

Add these scripts:

```json
{
  "build": "tsc -p tsconfig.json",
  "predev": "pnpm --filter @sudoku/core build && pnpm --filter @sudoku/multiplayer-protocol build",
  "dev": "tsx watch src/index.ts",
  "pretest": "pnpm --filter @sudoku/core build && pnpm --filter @sudoku/multiplayer-protocol build",
  "start": "node dist/index.js",
  "test": "vitest run",
  "typecheck": "tsc -p tsconfig.json --noEmit"
}
```

Use a server tsconfig with `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `rootDir: "src"`, `outDir: "dist"`, `types: ["node"]`, and `strict: true`. Extend the root aggregate `build`, `test`, and `typecheck` scripts so they invoke all three workspace packages exactly as shown in Task 1's target script definitions.

Update the root static-app Dockerfile install layer to copy all three workspace package manifests before `pnpm install --frozen-lockfile`; keep its final nginx image and do not add registry publishing.

- [ ] **Step 2: Write catalog and code tests**

Test `easy` puzzle 1 against the first line in `sudokus/easy.txt`, expose its exact 81-character fingerprint, reject puzzle zero/out-of-range/custom collection IDs, assert the solution contains digits 1–9 only, and inject deterministic random bytes to assert a six-character code using `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`.

- [ ] **Step 3: Run tests and verify failure**

Run: `pnpm --filter @sudoku/multiplayer-server test -- src/catalog/FilePuzzleCatalog.test.ts src/rooms/roomCode.test.ts`

Expected: FAIL because implementations are missing.

- [ ] **Step 4: Implement the catalog**

`FilePuzzleCatalog` receives an absolute repository `sudokus` directory. It reads only the five named files, selects the 1-based non-empty line, parses it with `@sudoku/core`, solves it with `solveBacktracking`, and flattens both grids row-major. Do not accept a client-supplied grid or solution.

- [ ] **Step 5: Implement room codes and config**

Use rejection sampling over `crypto.randomBytes()` so every alphabet character is unbiased. Config schema must require production `DATABASE_URL`, default `PORT` to `8080`, default `ROOM_TTL_HOURS` to `24`, default `RECONNECT_GRACE_SECONDS` to `60`, and parse a comma-separated `ALLOWED_ORIGINS`.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm --filter @sudoku/multiplayer-server test
pnpm --filter @sudoku/multiplayer-server typecheck
```

Expected: PASS.

```bash
git add server package.json pnpm-lock.yaml Dockerfile
git commit -m "feat: scaffold multiplayer server catalog"
```

## Task 4: Add Postgres Schema and Durable Repository

**Files:**
- Create: `server/migrations/001_multiplayer_rooms.sql`
- Create: `server/src/db/Database.ts`
- Create: `server/src/db/PgDatabase.ts`
- Create: `server/src/db/migrate.ts`
- Create: `server/src/db/roomRows.ts`
- Create: `server/src/rooms/RoomRepository.ts`
- Create: `server/src/rooms/PostgresRoomRepository.ts`
- Create: `server/src/rooms/PostgresRoomRepository.test.ts`
- Create: `server/src/testing/PgliteDatabase.ts`
- Modify: `server/package.json`

**Interfaces:**
- Produces `Database.query()` and `Database.transaction()`.
- Produces repository methods `create`, `getSnapshot`, `mutate`, `recordDisconnectExpiry`, `deleteExpired`, and `ping`.
- A processed-command receipt survives Clear and undo pruning; undo rows are capped separately at 500.

- [ ] **Step 1: Write the migration**

Create `rooms`, `processed_commands`, and `undo_actions` with:

```sql
CREATE TABLE rooms (
  id uuid PRIMARY KEY,
  code varchar(6) NOT NULL UNIQUE,
  collection_id text NOT NULL CHECK (collection_id IN ('easy','medium','hard','expert','evil')),
  puzzle_number integer NOT NULL CHECK (puzzle_number > 0),
  givens smallint[] NOT NULL CHECK (cardinality(givens) = 81),
  solution smallint[] NOT NULL CHECK (cardinality(solution) = 81),
  values smallint[] NOT NULL CHECK (cardinality(values) = 81),
  notes integer[] NOT NULL CHECK (cardinality(notes) = 81),
  revision bigint NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('running','paused','completed')),
  elapsed_ms bigint NOT NULL DEFAULT 0,
  running_since timestamptz,
  created_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
```

Use `(room_id, command_id)` as the processed-command primary key, `(room_id, sequence)` for undo, foreign keys with `ON DELETE CASCADE`, and an index on `rooms(expires_at)`.

Use these remaining columns:

```sql
CREATE TABLE processed_commands (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  revision bigint NOT NULL,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (room_id, command_id)
);

CREATE TABLE undo_actions (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  inverse jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (room_id, sequence)
);

```

- [ ] **Step 2: Write PGlite repository tests**

Cover create/load round-trip, transactional revision increment, duplicate command receipt lookup, undo push/pop/prune, Clear removing undo but not receipts, expiry updates, cascade deletion, and constructing a fresh repository instance over the same PGlite database to recover the room snapshot.

- [ ] **Step 3: Run and verify failure**

Run: `pnpm --filter @sudoku/multiplayer-server test -- src/rooms/PostgresRoomRepository.test.ts`

Expected: FAIL because the database and repository implementations are missing.

- [ ] **Step 4: Implement database adapters and migration runner**

Define:

```ts
export interface QueryResult<Row> { rows: Row[]; rowCount: number; }
export interface QueryExecutor {
  query<Row>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>;
}
export interface Database extends QueryExecutor {
  transaction<T>(work: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
```

`PgDatabase.transaction()` must check out one `pg.PoolClient`, run `BEGIN`, commit on success, rollback on error, and always release. `PgliteDatabase` implements the same interface for tests. `migrate.ts` first creates `schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL)` with `IF NOT EXISTS`, then applies each sorted SQL file once inside a transaction and records its filename.

Add server scripts `"migrate": "node dist/db/migrate.js"` and `"migrate:dev": "tsx src/db/migrate.ts"`. Resolve SQL files from `server/migrations` in both source and compiled execution.

- [ ] **Step 5: Implement repository locking and mapping**

`mutate(code, work)` loads the room using `SELECT ... FOR UPDATE`, supplies the row plus command/undo helpers to `work`, persists the returned room in the same transaction, and returns the committed snapshot. Encode each cell's note digits as a nine-bit integer; decode at the repository boundary.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm --filter @sudoku/multiplayer-server test -- src/rooms/PostgresRoomRepository.test.ts
pnpm --filter @sudoku/multiplayer-server typecheck
```

Expected: PASS.

```bash
git add server/migrations server/src/db server/src/rooms server/src/testing server/package.json
git commit -m "feat: persist multiplayer rooms in postgres"
```

## Task 5: Implement Authoritative Room Commands, Timer, Undo, and Expiry

**Files:**
- Create: `server/src/rooms/Clock.ts`
- Create: `server/src/rooms/PerRoomQueue.ts`
- Create: `server/src/rooms/RoomService.ts`
- Create: `server/src/rooms/RoomService.test.ts`
- Create: `server/src/testing/InMemoryRoomRepository.ts`

**Interfaces:**
- Consumes `PuzzleCatalog`, `RoomRepository`, protocol reducers, and injectable `Clock`.
- Produces:
  - `createRoom(input): Promise<RoomSnapshot>`
  - `joinRoom(code): Promise<RoomSnapshot | null>`; successful joins refresh expiry
  - `execute(command): Promise<{snapshot: RoomSnapshot; event: RoomEvent; duplicate: boolean}>`
  - `markRoomInactive(code): Promise<void>`
  - `deleteExpiredRooms(activeRoomCodes: ReadonlySet<string>): Promise<number>`.

- [ ] **Step 1: Write fake-clock service tests**

Cover these exact behaviours:

- creation starts with revision 0, empty editable values, no running timestamp, and 24-hour expiry;
- creation rejects a client fingerprint that differs from the independently loaded catalog givens;
- first board mutation starts the timer;
- pause accumulates elapsed time and clears `runningSince`;
- resume restarts from the fake clock;
- hints and board changes are undoable room-wide;
- Clear resets values, notes, timer, completion, and undo but preserves processed command IDs;
- duplicate `commandId` returns the original accepted result without incrementing revision;
- stale `baseRevision` remains acceptable for a valid intention;
- same-cell commands execute in queue arrival order;
- completion is server-derived;
- only 500 inverse rows remain;
- room-code uniqueness collisions retry with a newly generated code;
- accepted commands refresh last activity and expiry;
- disconnect expiry is 24 hours from the fake clock.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @sudoku/multiplayer-server test -- src/rooms/RoomService.test.ts`

Expected: FAIL because `RoomService` is missing.

- [ ] **Step 3: Implement the per-room queue**

Use a `Map<string, Promise<void>>`; append work to the previous promise, resolve the caller with its result, and delete the map entry only when the latest tail settles. A failure in one command must not poison later commands.

- [ ] **Step 4: Implement timer and command rules**

Use server timestamps exclusively. While paused, accept only resume. While completed, reject every gameplay mutation. Accept Clear only while running, reset status to running, and do not insert an undo row. Reject pause while already paused and resume while running as no-op errors. Let undo restore the latest inverse and increment revision.

- [ ] **Step 5: Build snapshots**

Every snapshot/event carries `serverNow`, `elapsedMs`, nullable `runningSince`, `canUndo`, and an expiry ISO timestamp. Do not include processed command IDs, inverse data, or database IDs.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm --filter @sudoku/multiplayer-server test -- src/rooms/RoomService.test.ts
pnpm --filter @sudoku/multiplayer-server typecheck
```

Expected: PASS.

```bash
git add server/src/rooms server/src/testing
git commit -m "feat: add authoritative multiplayer room service"
```

## Task 6: Add Presence, Two-Guest Capacity, and Typed Socket.IO Transport

**Files:**
- Create: `packages/multiplayer-protocol/src/socketEvents.ts`
- Modify: `packages/multiplayer-protocol/src/index.ts`
- Create: `server/src/rooms/PresenceService.ts`
- Create: `server/src/rooms/PresenceService.test.ts`
- Create: `server/src/transport/createSocketServer.ts`
- Create: `server/src/transport/createSocketServer.test.ts`
- Create: `server/src/transport/rateLimit.ts`
- Create: `server/src/transport/rateLimit.test.ts`

**Interfaces:**
- Produces typed events:
  - client: `room:create`, `room:join`, `room:command`, `room:leave`
  - server: `room:snapshot`, `room:event`, `room:presence`, `room:error`
- Acknowledgements use `{ok: true, snapshot}` or `{ok: false, error: {code, message}}`.
- Error codes: `INVALID_REQUEST`, `ROOM_NOT_FOUND`, `ROOM_EXPIRED`, `ROOM_FULL`, `COMMAND_REJECTED`, `VERSION_MISMATCH`, `PUZZLE_VERSION_MISMATCH`, and `SERVICE_UNAVAILABLE`.
- Every Socket.IO handshake supplies `MULTIPLAYER_PROTOCOL_VERSION`; reject mismatches before room events are accepted.

Define:

```ts
export type RoomErrorCode =
  | "INVALID_REQUEST"
  | "ROOM_NOT_FOUND"
  | "ROOM_EXPIRED"
  | "ROOM_FULL"
  | "COMMAND_REJECTED"
  | "VERSION_MISMATCH"
  | "PUZZLE_VERSION_MISMATCH"
  | "SERVICE_UNAVAILABLE";
export interface RoomError {
  code: RoomErrorCode;
  message: string;
}
export interface CreateRoomRequest {
  guestId: string;
  connectionId: string;
  collectionId: import("@sudoku/core").BaseCollectionId;
  puzzleNumber: number;
  puzzleFingerprint: string;
}
export interface JoinRoomRequest {
  guestId: string;
  connectionId: string;
  roomCode: string;
}
export type RoomAck =
  | {ok: true; snapshot: RoomSnapshot}
  | {ok: false; error: RoomError};
export interface ClientToServerEvents {
  "room:create": (request: CreateRoomRequest, ack: (result: RoomAck) => void) => void;
  "room:join": (request: JoinRoomRequest, ack: (result: RoomAck) => void) => void;
  "room:command": (command: RoomCommand, ack: (result: RoomAck) => void) => void;
  "room:leave": (request: {roomCode: string; connectionId: string}) => void;
}
export interface ServerToClientEvents {
  "room:snapshot": (snapshot: RoomSnapshot) => void;
  "room:event": (event: RoomEvent) => void;
  "room:presence": (presence: {connectedGuests: 0 | 1 | 2}) => void;
  "room:error": (error: RoomError) => void;
}
```

- [ ] **Step 1: Write fake-clock presence tests**

Assert two different guests join, a third is rejected, two connections for the same guest occupy one seat, closing one same-guest tab keeps the guest present, the final disconnect reserves the seat for 60 seconds, and a new guest can take it at second 61.

- [ ] **Step 2: Write socket integration tests**

Start an HTTP server on an ephemeral port with `InMemoryRoomRepository`. Use `socket.io-client` to create a room, join from a second guest, synchronize a value, reject a third guest, disconnect/reconnect, and receive a full snapshot. Close the first HTTP/Socket.IO instance, construct a second instance over the same repository, and assert reconnecting clients recover the room.

- [ ] **Step 3: Write rate-limit and transport-bound tests**

Use a fake clock to assert five room creations per network source per minute, twenty failed joins per source per minute, and thirty commands per socket per second are allowed before `INVALID_REQUEST` throttling. Assert payloads over 16 KiB are rejected and a production origin outside `ALLOWED_ORIGINS` cannot connect.

- [ ] **Step 4: Run and verify failure**

Run: `pnpm --filter @sudoku/multiplayer-server test -- src/rooms/PresenceService.test.ts src/transport/createSocketServer.test.ts src/transport/rateLimit.test.ts`

Expected: FAIL because presence and transport are missing.

- [ ] **Step 5: Implement presence**

Key presence by room code then guest ID, store a `Set<connectionId>` and nullable reservation deadline, expose `activeRoomCodes()`, and emit only `{connectedGuests: 0 | 1 | 2}`. Never broadcast guest IDs.

- [ ] **Step 6: Implement socket handlers**

Validate every event with Zod before calling services. Set Socket.IO `maxHttpBufferSize` to 16 KiB, enforce the configured origin allowlist, and apply the tested token buckets before service calls. Reserve capacity before loading the snapshot, release that reservation if the room does not exist, and join the Socket.IO room only after both checks succeed. Attach the current presence count to create/join snapshots before acknowledging. On disconnect, remove the specific connection, call `markRoomInactive()` when the final active connection leaves, and schedule reservation expiry. Broadcast accepted events only after `RoomService.execute()` returns committed data.

- [ ] **Step 7: Verify and commit**

Run:

```bash
pnpm --filter @sudoku/multiplayer-protocol test
pnpm --filter @sudoku/multiplayer-server test
```

Expected: PASS.

```bash
git add packages/multiplayer-protocol server/src/rooms server/src/transport
git commit -m "feat: synchronize rooms over socket io"
```

## Task 7: Assemble the Server Runtime and Fly Deployment

**Files:**
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`
- Create: `server/src/app.test.ts`
- Create: `server/src/metrics.ts`
- Create: `server/Dockerfile`
- Create: `server/fly.toml`
- Create: `server/.env.example`
- Modify: `server/package.json`
- Modify: `.github/workflows/run_tests.yaml`

**Interfaces:**
- `createMultiplayerApp(dependencies)` returns `{httpServer, io, start, stop}` for tests and production.
- `GET /health` returns process health.
- `GET /ready` returns 200 only after `repository.ping()`.
- `GET /metrics` returns operational JSON without room snapshots, room codes, or guest IDs.

- [ ] **Step 1: Write health/readiness tests**

Assert `/health` is always 200 with `{"status":"ok"}`, `/ready` is 200 when `ping()` succeeds and 503 when it fails, `/metrics` reports connected sockets, active rooms, command count/latency, rejection counts, reconnects, and database errors, and `stop()` closes Socket.IO, HTTP, timers, and database resources.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @sudoku/multiplayer-server test -- src/app.test.ts`

Expected: FAIL because `createMultiplayerApp` is missing.

- [ ] **Step 3: Assemble production dependencies**

Create `FilePuzzleCatalog`, `PgDatabase`, `PostgresRoomRepository`, `RoomService`, `PresenceService`, metrics, and Socket.IO from parsed config. Schedule cleanup every 15 minutes, pass `presence.activeRoomCodes()` to cleanup, and call it once at startup. Handle `SIGTERM` and `SIGINT` with one idempotent shutdown promise. Log structured event names and aggregate counts only; never log full snapshots or guest IDs.

- [ ] **Step 4: Add container and Fly configuration**

Use a Node 24 multi-stage image with Corepack, frozen pnpm install, protocol/core/server builds, a non-root runtime user, `PORT=8080`, and only runtime workspace artifacts plus `server/migrations` and the five `sudokus/*.txt` catalog files. Configure Fly `primary_region = "lhr"`, 512 MB RAM, HTTPS force, `/health` checks, `release_command` to run `pnpm --filter @sudoku/multiplayer-server migrate`, and one always-running Machine.

- [ ] **Step 5: Extend CI server checks**

After the root install, run aggregate typecheck/lint/test/build. Do not deploy from pull-request CI. Keep Fly secrets and Neon credentials outside GitHub logs.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm --filter @sudoku/multiplayer-server test
pnpm --filter @sudoku/multiplayer-server build
docker build -f server/Dockerfile -t sudoku-multiplayer:test .
```

Expected: tests/build pass and the image builds when the container engine is available.

```bash
git add server .github/workflows/run_tests.yaml
git commit -m "build: add multiplayer server runtime"
```

## Task 8: Extract a Shared Game Presentation View Without Changing Solo Behaviour

**Files:**
- Create: `src/pages/Game/GameView.tsx`
- Create: `src/pages/Game/GameView.test.tsx`
- Create: `src/pages/Game/GameHeader.test.tsx`
- Create: `src/pages/Game/GameTimer.test.tsx`
- Create: `src/pages/Game/useSoloVisibilityPause.ts`
- Modify: `src/pages/Game.tsx`
- Modify: `src/pages/Game/GameHeader.tsx`
- Modify: `src/pages/Game/GameTimer.tsx`
- Modify: `src/pages/Game/GameCompletionPanel.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces a context-free `GameView` whose props contain board cells, active-cell UI state, authoritative status/time, preference toggles, command callbacks, `canUndo`, connection blocking, and completion content.
- `GameHeader` accepts `onClearConfirmed` and `onNewGame`; it no longer owns solver/reset/navigation policy.
- Solo adapter retains visibility auto-pause; multiplayer will not auto-pause the room when one tab becomes hidden.

- [ ] **Step 1: Add characterization tests**

Install interaction-only test dependencies:

```bash
pnpm add --save-dev --save-exact @testing-library/react @testing-library/user-event jsdom
```

Mark the new component tests with `// @vitest-environment jsdom`. Render the extracted view with fake callbacks and assert number, note, hint, undo, pause/resume, confirmed Clear, and New Game invoke the supplied callbacks. Assert Clear cancellation invokes no mutation. Keep existing solo reducer/context tests unchanged.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm run test:web -- src/pages/Game/GameView.test.tsx`

Expected: FAIL because `GameView` is missing.

- [ ] **Step 3: Refactor header seams**

Move current solo Clear logic into the solo controller:

```ts
const clearSoloGame = () => {
  const simple = cellsToSimpleSudoku(sudokuState.current);
  const solved = solve(simple);
  if (solved.sudoku) setSudoku(simple, solved.sudoku);
  resetGame();
};
```

Pass it as `onClearConfirmed`. Pass a solo `onNewGame` that pauses then navigates. The multiplayer controller will later pass server Clear and local leave callbacks.

- [ ] **Step 4: Extract `GameView`**

Move layout, board rendering, shortcuts, controls, pause overlay, and note-hold behaviour out of `GameInner`. Keep route sync, persistence, active-game locking, solved detection, and visibility handling in the solo controller.

- [ ] **Step 5: Preserve timer and completion seams**

Make the header receive formatted/elapsed time through a prop or small display component. Let the solo controller continue using `TimerProvider`; allow multiplayer to provide server-derived seconds. Accept completion content so solo keeps `GameCompletionPanel` while multiplayer can show room completion.

- [ ] **Step 6: Run regression checks**

Run:

```bash
pnpm run test:web -- src/pages/Game/GameView.test.tsx src/pages/Game/GameHeader.test.tsx src/pages/Game/GameTimer.test.tsx src/context/GameContext.test.ts src/context/SudokuContext.test.ts
pnpm exec playwright test e2e/sudoku.e2e.ts e2e/completion-screen.e2e.ts
```

Expected: PASS with unchanged solo behaviour.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/pages/Game.tsx src/pages/Game
git commit -m "refactor: extract reusable game view"
```

## Task 9: Add Guest Identity and Optimistic Multiplayer Client State

**Files:**
- Create: `src/lib/multiplayer/guestIdentity.ts`
- Create: `src/lib/multiplayer/guestIdentity.test.ts`
- Create: `src/lib/multiplayer/clientState.ts`
- Create: `src/lib/multiplayer/clientState.test.ts`
- Create: `src/lib/multiplayer/createMultiplayerSocket.ts`
- Create: `src/lib/multiplayer/useMultiplayerRoom.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- `getOrCreateGuestId(storage: Storage): string` uses `sudoku-multiplayer-guest-id`.
- Each `useMultiplayerRoom` mount creates a fresh `connectionId`.
- Hook returns confirmed snapshot, projected board, connection status, presence, error, and `send(action)`.

- [ ] **Step 1: Install client dependencies**

Run:

```bash
pnpm add --save-exact '@sudoku/multiplayer-protocol@workspace:*' socket.io-client zod
```

- [ ] **Step 2: Write identity tests**

Use an in-memory Storage fake to prove two calls/tabs share one valid UUID and a different storage profile gets another.

- [ ] **Step 3: Write client reducer tests**

Cover optimistic send, acknowledgement removal, remote event application, out-of-order revision gap switching to `resyncing`, rejected command rollback, full snapshot replacement, and pending-command replay.

- [ ] **Step 4: Run and verify failure**

Run: `pnpm run test:web -- src/lib/multiplayer`

Expected: FAIL because the client modules are missing.

- [ ] **Step 5: Implement state and socket adapter**

Use:

```ts
export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
export interface MultiplayerClientState {
  confirmed: RoomSnapshot | null;
  pending: RoomCommand[];
  connectionStatus: ConnectionStatus;
  error: RoomError | null;
}
```

Generate command UUIDs with `crypto.randomUUID()`. Configure the public URL from `VITE_MULTIPLAYER_URL`, use Socket.IO reconnection, and request a full snapshot after every reconnect. Do not persist room board state into solo storage.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm run test:web -- src/lib/multiplayer
pnpm run typecheck:web
```

Expected: PASS.

```bash
git add package.json pnpm-lock.yaml src/lib/multiplayer
git commit -m "feat: add multiplayer web client state"
```

## Task 10: Add Explicit Select-Game Actions and Room Routing

**Files:**
- Create: `src/pages/Game/selectGameMode.ts`
- Create: `src/pages/Game/OnlineRoomControls.tsx`
- Create: `src/pages/Game/OnlineRoomControls.test.tsx`
- Create: `src/pages/SelectGame.test.tsx`
- Modify: `src/pages/SelectGame.tsx`
- Modify: `src/pages/Game/GameSelect.tsx`
- Modify: `src/Root.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/de.json`
- Modify: `src/locales/es.json`
- Modify: `src/locales/fr.json`
- Modify: `src/locales/it.json`
- Modify: `src/locales/pt.json`
- Modify: `src/locales/zh.json`
- Modify: `e2e/select-game.e2e.ts`

**Interfaces:**
- Select modes: `"solo" | "create-online" | "join-online"`.
- Puzzle selection callback receives `{collectionId, puzzleNumber}`.
- Join navigates to `/room/$code` under the hash router.

- [ ] **Step 1: Write component tests**

Assert:

- Solo shows all base/custom collections and local progress overlays.
- Create Online shows only the five base collections and clean cards.
- Join Existing hides tabs and puzzle cards.
- offline browser state leaves Solo active and disables online actions with explanatory copy.
- room codes normalize to uppercase and reject invalid characters before navigation.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm run test:web -- src/pages/SelectGame.test.tsx src/pages/Game/OnlineRoomControls.test.tsx`

Expected: FAIL because the new controls are missing.

- [ ] **Step 3: Implement the three explicit actions**

Use accessible pressed-state buttons/cards for Solo / offline, Create online room, and Join existing room. Preserve the approved layout B. In Create Online, selecting a puzzle computes its fingerprint with `stringifySudoku`, dynamically imports the Socket.IO client, calls the backend create flow with collection, index, and fingerprint, disconnects that temporary selection socket after acknowledgement, and navigates to the returned code; show a disabled/loading state to prevent duplicate rooms. This keeps ordinary Solo selection from opening a socket or eagerly evaluating multiplayer transport code.

- [ ] **Step 4: Add the lazy room route**

In `Root.tsx`, add a lazy `MultiplayerGame` route at `/room/$code`. Keep `createHashHistory`; generated links must render as `/#/room/ABC234`.

- [ ] **Step 5: Add translations**

Add exact English concepts for the three actions, room code, Join, creating, offline requirement, invalid/expired/full room, reconnecting, connected count, copy link, and leave room. Supply translations or deliberate English fallbacks in every locale so no key renders raw.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
pnpm run test:web -- src/pages/SelectGame.test.tsx src/pages/Game/OnlineRoomControls.test.tsx
pnpm exec playwright test e2e/select-game.e2e.ts
```

Expected: PASS.

```bash
git add src/Root.tsx src/pages/SelectGame.tsx src/pages/Game src/locales e2e/select-game.e2e.ts
git commit -m "feat: add online room selection flow"
```

## Task 11: Build the Multiplayer Game Controller and Shared Controls

**Files:**
- Create: `src/pages/MultiplayerGame.tsx`
- Create: `src/pages/Game/MultiplayerGameController.tsx`
- Create: `src/pages/Game/MultiplayerStatus.tsx`
- Create: `src/pages/Game/MultiplayerCompletionPanel.tsx`
- Create: `src/pages/Game/MultiplayerGameController.test.tsx`
- Modify: `src/pages/Game/GameView.tsx`
- Modify: `src/main.css`

**Interfaces:**
- Consumes `useMultiplayerRoom`, converts `RoomBoard` to existing `Cell[]`, and maps UI actions to protocol commands.
- Local-only state includes active cell, open menu, note mode, copied notes, and preferences.
- Shared status/timer/undo/hint/Clear use server state.

- [ ] **Step 1: Write controller tests**

With a fake room hook, assert:

- number, shared notes, erase, hint, undo, pause/resume, and confirmed Clear send exact actions;
- Clear cancellation sends nothing;
- New Game disconnects/navigates without sending pause or clear;
- reconnecting shows the last confirmed board, a persistent banner, and disabled mutations;
- pause hides both boards through the existing overlay;
- `1/2 connected` and `2/2 connected` update;
- completed snapshot renders the shared elapsed time and no solo best/solve history.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm run test:web -- src/pages/Game/MultiplayerGameController.test.tsx`

Expected: FAIL because the controller is missing.

- [ ] **Step 3: Convert snapshots to view cells**

For every index, derive `x = index % 9` and `y = Math.floor(index / 9)`, mark `initial` from `givens[index] !== 0`, read current value from givens or room values, copy shared notes, and include the canonical solution for existing local display preferences.

- [ ] **Step 4: Implement shared timer projection**

Compute display milliseconds as `elapsedMs + (status === "running" && runningSince ? adjustedNow - runningSince : 0)`, using `serverNow` to estimate client/server clock offset. Recalculate on snapshot/event and tick display locally without mutating room state.

- [ ] **Step 5: Implement reconnect and error UI**

Keep the last confirmed board visible, block input during reconnect/resync, and expose Retry. Map `ROOM_NOT_FOUND`, `ROOM_EXPIRED`, and `ROOM_FULL` back to the Join Existing state with the entered code preserved.

- [ ] **Step 6: Add room sharing**

Copy `window.location.href`, which must use the hash room route. Use the Clipboard API with an accessible fallback message; do not add server invitations or user accounts.

- [ ] **Step 7: Verify and commit**

Run:

```bash
pnpm run test:web -- src/pages/Game/MultiplayerGameController.test.tsx
pnpm run typecheck:web
pnpm run lint
```

Expected: PASS.

```bash
git add src/pages/MultiplayerGame.tsx src/pages/Game src/main.css
git commit -m "feat: add collaborative multiplayer game"
```

## Task 12: Add Two-Browser E2E, Reconnection, and Offline Regression Coverage

**Files:**
- Create: `playwright.multiplayer.config.ts`
- Create: `e2e/multiplayer.e2e.ts`
- Create: `server/src/testing/startTestServer.ts`
- Modify: `e2e/pwa-offline.e2e.ts`
- Modify: `package.json`
- Modify: `server/package.json`
- Modify: `.github/workflows/run_tests.yaml`

**Interfaces:**
- A dedicated Playwright config starts Vite preview and the test-mode multiplayer server on isolated ports.
- The test server uses the same RoomService/transport with an injected disposable repository; Postgres durability remains covered by Task 4 integration tests.

- [ ] **Step 1: Add scripts and isolated servers**

Add:

```json
{
  "scripts": {
    "test:e2e:multiplayer": "playwright test --config playwright.multiplayer.config.ts"
  }
}
```

Use distinct app/backend ports derived from the working-directory hash, `reuseExistingServer: false`, and `VITE_MULTIPLAYER_URL` pointing at the isolated backend.

Add server script `"start:test": "tsx src/testing/startTestServer.ts"`. The test entrypoint injects `InMemoryRoomRepository`, uses the real catalog/service/presence/transport stack, reads only isolated port and short grace-period environment variables, and refuses to start when `NODE_ENV` is not `"test"`.

- [ ] **Step 2: Write the primary two-context flow**

Create two browser contexts with different local storage profiles. Creator selects Create Online and Easy #1, copies the code, second guest joins, and both contexts verify synchronized value, note, hint, pause/resume, undo, Clear, and completion.

- [ ] **Step 3: Add capacity and tab identity coverage**

Open a second page in the creator's context and verify it does not consume a seat. Open a third distinct context and verify Room Full while both seats are occupied. Configure the isolated test server with `RECONNECT_GRACE_SECONDS=1`, disconnect the second guest, verify immediate reconnect keeps its seat, then use `expect.poll()` after the one-second grace window to verify a replacement guest can join.

- [ ] **Step 4: Add reconnect coverage**

Drop the socket transport, assert Reconnecting and disabled input while the last board remains visible, restore the transport, and verify a full snapshot. Process/service reconstruction over a retained repository is covered in server integration tests rather than through a production browser-only control endpoint.

- [ ] **Step 5: Extend offline PWA coverage**

Warm the cache online, enter Solo, switch offline, reload, select another built-in Solo puzzle, and verify play. Also assert Online actions explain the connection requirement and that no request to `multi.sudoku.slpixe.com` is required for the Solo bundle.

- [ ] **Step 6: Run E2E and commit**

Run:

```bash
pnpm run test:e2e
pnpm run test:e2e:multiplayer
```

Expected: PASS.

```bash
git add package.json server/package.json server/src/testing/startTestServer.ts playwright.multiplayer.config.ts e2e .github/workflows/run_tests.yaml
git commit -m "test: cover collaborative multiplayer flows"
```

## Task 13: Production Configuration, Documentation, and Final Verification

**Files:**
- Create: `docs/multiplayer-operations.md`
- Modify: `README.MD`
- Modify: `AGENTS.md`
- Modify: `server/fly.toml`
- Modify: `.github/workflows/run_tests.yaml`

**Interfaces:**
- Produces reproducible Netlify/Fly/Neon setup, migration, deployment, rollback, and monitoring instructions.

- [ ] **Step 1: Document production setup**

Document:

- Neon London project creation and pooled `DATABASE_URL`;
- migration command and rollback strategy;
- Fly app creation in `lhr`, 512 MB sizing, `multi.sudoku.slpixe.com` certificate/DNS, secrets, health/readiness, and deploy command;
- Netlify `VITE_MULTIPLAYER_URL=https://multi.sudoku.slpixe.com`;
- allowed origins, log redaction, cleanup schedule, and basic metrics;
- local development commands for frontend, server, and multiplayer E2E.

- [ ] **Step 2: Verify production configuration without deploying**

Run:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm test
pnpm build
pnpm run test:e2e
pnpm run test:e2e:multiplayer
docker build -f server/Dockerfile -t sudoku-multiplayer:verify .
```

Expected: every available check passes. If the local container engine is unavailable, record that limitation and rely on the CI image-build job; do not claim the Docker check passed.

- [ ] **Step 3: Perform a manual two-device review**

Start the frontend in host mode and backend on a strict dedicated port, verify both with `lsof` and `curl`, then test create/join, notes, pause, reconnect, and completion from two browser/device profiles. Report the Vite network URL and stop temporary servers afterward.

- [ ] **Step 4: Update project notes**

Add the chosen provider split, `multi.sudoku.slpixe.com`, guest-first identity, two-player limit, room TTL, and new verification commands to `AGENTS.md`. Keep attribution, MIT license, Netlify frontend, and retired image publishing decisions intact.

- [ ] **Step 5: Commit documentation**

```bash
git add README.MD AGENTS.md docs/multiplayer-operations.md server/fly.toml .github/workflows/run_tests.yaml
git commit -m "docs: add multiplayer operations guide"
```

- [ ] **Step 6: Close out the GitHub issue**

Comment with the implementation summary, commit reference, provider configuration, and every check actually run. Close the selected issue only when its acceptance criteria and the manual two-player flow are satisfied; create linked issues for race mode, profiles/history, custom online puzzles, local-network play, or horizontal scaling.
