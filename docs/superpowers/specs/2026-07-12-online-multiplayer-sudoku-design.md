# Online Multiplayer Sudoku Design

## Objective

Add a collaborative online mode to the existing Sudoku application without weakening its fast, offline-ready solo experience. Two anonymous guests should be able to share one authoritative Sudoku board, including values, notes, timer state, hints, undo, and whole-game clearing. Rooms should survive backend restarts and remain resumable for 24 hours after the last participant leaves.

Collaborative play is the first multiplayer mode. A competitive race mode may reuse the same room and transport foundations later, but is outside this design.

## Product principles

- Solo play remains local-first, installable, and fully usable without a network connection.
- Multiplayer is an optional, lazy-loaded online capability.
- The backend is authoritative for shared room state; clients never synchronize directly with each other.
- Joining must not require registration, a name, or any other form input beyond a room code.
- Shared gameplay should retain the existing visual language: white givens, orange entered values, and small green notes. Player-specific colors and action attribution are intentionally omitted.
- The first release should use one small backend instance and no Redis. The architecture may scale later without introducing multi-instance complexity now.

## Repository and deployment boundaries

Keep the frontend, multiplayer backend, shared protocol, and database migrations in this repository. They share Sudoku rules, puzzle identities, types, and tests closely enough that separate repositories would add coordination overhead.

They remain separate deployable units:

- Netlify continues serving `https://sudoku.slpixe.com` as a static React/Vite PWA.
- One 512 MB Fly.io Machine in the London region runs the Node.js and Socket.IO multiplayer service.
- `https://multi.sudoku.slpixe.com` and its secure WebSocket endpoint point directly to Fly.io; Netlify does not proxy live traffic.
- A Neon Postgres project in AWS London (`eu-west-2`) stores durable room state.
- The browser connects only to the Fly service. Neon credentials exist only in Fly secrets and migration tooling.

The Fly service exposes a minimal health/readiness endpoint in addition to its Socket.IO transport. Production allows the `https://sudoku.slpixe.com` browser origin. Preview and local origins are explicit environment configuration rather than permissive production defaults.

The existing root application should not be reorganized wholesale. Add a focused backend workspace and extract only pure logic that genuinely needs to be shared. The intended boundaries are:

- the existing web application for UI, solo state, local persistence, and the multiplayer client adapter;
- a multiplayer server workspace for transport, command handling, presence, room lifecycle, and persistence;
- a small shared protocol package containing validated command/event types and their pure reducers;
- shared pure Sudoku validation and puzzle lookup code, extracted from the existing engine only where the server requires it;
- database migrations owned by the multiplayer server workspace.

The pnpm workspace configuration remains the single package-management entry point.

## Select-game experience

The Select Game page begins with three explicit actions:

1. **Solo / offline**
2. **Create online room**
3. **Join existing room**

Solo / offline preserves the current difficulty tabs and puzzle grid. Puzzle cards continue showing local progress, last and best times, solve counts, Continue, and Restart information.

Create online room also shows the difficulty tabs and puzzle grid, but its cards are clean. They do not show the creator's solo progress or times because selecting a card always creates a fresh collaborative room. Selecting a puzzle sends its collection identifier and index to the backend; the backend resolves and verifies the canonical puzzle, creates the room, and joins the creator.

Join existing room hides the difficulty tabs and puzzle grid completely. It shows a room-code field and Join action. Codes are case-insensitive and normalized before submission. A share link such as `https://sudoku.slpixe.com/room/ABC234` attempts to join that room directly and shows the same inline error treatment if joining fails.

When the browser is offline, Solo / offline remains available. The two online actions show that a connection is required and offer retry once connectivity returns.

## Guest identity and room capacity

The browser generates a cryptographically random, opaque `guestId` and stores it in local storage so all tabs in that browser share the same anonymous identity. Each tab or socket also gets a temporary `connectionId`.

A room allows at most two concurrently connected distinct `guestId` values. Multiple tabs or reconnecting sockets for either accepted guest do not consume additional seats. When a guest's final connection drops, the backend reserves that seat for 60 seconds to allow ordinary reconnection; after the grace period, another guest with the room code may take the open seat. A third distinct guest receives a room-full response without seeing the board snapshot while both seats are occupied or reserved.

The `guestId` is a continuity label, not a login credential or durable account. Possession of the unguessable room code grants room access. There are no host privileges: either accepted participant can make any shared gameplay change.

Presence is ephemeral and held in backend memory as a mapping from room to guest to active connection count and optional reconnect deadline. The game UI may display `1/2 connected` or `2/2 connected`; it does not need player names, player colors, or per-action identity. Presence reconstructs naturally as clients reconnect after a server restart.

## Room identity and lifecycle

Room codes contain six characters from an alphabet that excludes visually ambiguous characters. Creation checks the database unique constraint and retries the rare collision.

Rooms are durable Postgres records. An active connection prevents cleanup even if the room has been idle for more than 24 hours. When the last connection leaves, the room remains resumable for 24 hours. A later join or accepted room command refreshes its expiry. Completed rooms follow the same rule and remain viewable for 24 hours after the last participant leaves.

A scheduled backend cleanup job deletes expired room records and their action history. Cleanup is also safe to run manually and is idempotent.

Room creation does not require both participants to be present. The creator may begin immediately. The shared timer starts with the first accepted board mutation rather than while the creator is copying or sharing the room link.

## Authoritative room state

Each room stores:

- internal room ID and public room code;
- collection ID and puzzle index;
- a stored immutable starting puzzle and solution resolved from the server's canonical puzzle catalog at creation;
- the 81 current values;
- shared notes for each cell, represented compactly as digit bitsets or an equivalent validated structure;
- a monotonically increasing revision;
- running, paused, and completed state;
- accumulated elapsed time and the server timestamp at which the current running interval began;
- creation, last-activity, and expiry timestamps.

Storing the starting puzzle and solution with the room prevents a future puzzle-catalog edit from changing a live room. The server never trusts a starting grid or solution supplied by a client.

Active cell selection, open menus, notes-entry mode, copied notes, theme, conflict highlighting, occurrence counts, and matching-number preferences remain local UI state. Only actual cell values and notes are shared.

## Shared controls

- **Value entry, erase, and notes:** either participant may change any editable cell. Values and notes are not owned by the participant who entered them.
- **Undo:** room-wide and available to either participant. It reverses the most recent accepted undoable board mutation, regardless of who initiated it. Action history stores no guest attribution.
- **Hint:** server-validated and shared. It reveals the solution value for the selected editable cell and is an ordinary undoable board mutation.
- **Pause / resume:** shared authoritative state. Either participant may pause or resume, both clients show the paused state, and the shared timer stops while paused.
- **Clear:** preserves the existing confirmed whole-game restart behaviour. The initiating client shows the confirmation dialog. On confirmation, the backend clears all entered values and shared notes, resets the shared timer and completion state, resumes the room, and clears the undo history. Clear is not undoable. Cancelling the dialog leaves the room unchanged.
- **New game:** leaves the room only for the participant who selected it and returns that client to Select Game. It does not pause, clear, close, or otherwise mutate the room for the remaining participant.
- **Completion:** computed and committed by the backend after an accepted mutation. Both clients enter the completed state and see the same final elapsed time.

## Commands, ordering, and synchronization

Client commands use a validated envelope containing the room code, stable unique command ID, client's last confirmed revision, command kind, and kind-specific payload. Supported command kinds cover value entry, note replacement or toggle, erase, hint, undo, pause, resume, and confirmed clear.

The server processes commands sequentially per room and commits each accepted mutation transactionally before broadcasting it. Each accepted command increments the revision. A unique command ID makes retries idempotent and prevents a reconnect from applying the same mutation twice.

The client's reported revision detects gaps but does not automatically reject every stale command. Commands express intent against the current authoritative state and are processed in server arrival order. If two participants update the same cell concurrently, the last accepted server command wins. Invalid commands, writes to given cells, board mutations sent while paused, and malformed payloads are rejected without changing the revision; resume remains valid while paused.

For responsive controls, the client keeps a confirmed snapshot plus an ordered list of pending local commands. It renders the confirmed snapshot with pending commands applied optimistically. When an acknowledgement or remote event arrives, it updates the confirmed state, removes acknowledged commands, and reapplies any remaining local commands. A rejected command or detected event gap triggers a full snapshot replacement and deterministic replay of still-valid pending commands.

Normal traffic broadcasts accepted actions and revisions. Full snapshots are sent on room creation, join, reconnect, explicit resynchronization, and recovery from a gap or rejected optimistic command. The snapshot is small enough that recovery should prefer correctness over delta reconstruction.

Undo history consists of inverse data for the latest 500 accepted undoable board commands. Pause, resume, presence changes, and Clear are not part of that stack. Clear deletes the previous stack. If the bounded history is exhausted, older actions remain in the resulting board state but are no longer undoable.

## Persistence and transactions

Postgres is the source of truth, not Node memory and not Socket.IO room membership. A room-state table stores the latest snapshot and revision. A processed-command table retains every accepted command ID until room expiry so retries remain idempotent even after Clear or undo-history pruning. A separate undo-action table stores inverse payloads for the latest 500 undoable board commands. Room mutation, revision increment, command receipt, undo insertion or removal, timer update, and completion detection occur in one database transaction. Neither command table stores guest attribution.

The single Fly instance also maintains a per-room in-process queue so asynchronous handlers cannot interleave database work for the same room. The database revision remains the final concurrency guard and allows later multi-instance scaling.

Redis is not part of the initial design. Socket.IO's ordinary Redis adapter uses Pub/Sub and is not durable game storage. If traffic later requires multiple Fly Machines, add a compatible cross-instance adapter and retain Postgres as the canonical room state.

## Reconnection and failures

When the WebSocket connection drops, the client:

- keeps showing the last confirmed board;
- displays a persistent Reconnecting status;
- disables shared mutations rather than queueing offline multiplayer moves;
- continues retrying with bounded exponential backoff;
- requests a full authoritative snapshot after reconnecting.

The client does not persist a multiplayer board into the solo played-puzzle repository. It may store recent room codes and links locally for convenience.

Join failures distinguish invalid code, expired room, full room, version incompatibility, and temporarily unavailable service. Invalid or expired rooms return the user to the Join Existing state with the entered code preserved. Backend or database unavailability leaves Solo usable and gives Online a retry action.

The server commits before broadcasting. If persistence fails, it rejects the command and no other participant observes it as accepted. After a Fly restart, Socket.IO presence is rebuilt from reconnecting sockets and rooms load from Neon.

Deep-linked room routes still load the cached PWA shell offline, but clearly report that joining requires connectivity. Multiplayer API responses and room snapshots are not service-worker cached.

## Security and abuse controls

- Validate every event and payload on the server with strict size and value limits.
- Resolve puzzles and solutions on the server; never accept authoritative puzzle data from the browser.
- Enforce the two-guest limit, editable-cell rules, paused/completed restrictions, and allowed command kinds server-side.
- Restrict production browser origins and use TLS/WSS exclusively.
- Rate-limit room creation, failed joins, and mutation bursts by connection and network source.
- Reject oversized Socket.IO frames and arbitrary user-provided display text.
- Do not collect email addresses, profile data, chat messages, or other personal data in the first release.
- Use structured logs without storing full room snapshots or guest identifiers unnecessarily.

Room codes are capability links rather than discoverable public rooms. The initial design does not include room listings, invitations tied to accounts, moderation roles, or passwords.

## Testing and operational checks

### Shared unit coverage

- deterministic application of every command kind;
- value, note, hint, Clear, pause, resume, completion, and timer rules;
- inverse generation and room-wide undo;
- command validation and revision progression;
- optimistic client reconciliation and idempotent acknowledgement handling;
- six-character code normalization and collision retry;
- two concurrently connected guests allowed, a third rejected, extra tabs for an accepted guest allowed, and seats released after the reconnect grace period;
- expiry calculations and cleanup eligibility.

### Server integration coverage

- transactional persistence of snapshot, revision, timer, processed-command receipts, and undo history;
- duplicate command IDs applied exactly once;
- simultaneous writes to one cell resolved in server order;
- concurrent commands for different cells both preserved;
- server restart followed by snapshot recovery;
- database failure rejects without broadcasting;
- expired-room cleanup removes related action history.

### Browser coverage

Use separate Playwright browser contexts for the two guests and additional pages for same-guest tab checks. Cover room creation from a selected puzzle, code and link joining, synchronized values and notes, shared hint, shared pause/resume, room-wide undo, confirmed Clear, completion, room-full handling, disconnect/reconnect, and service restart recovery.

Retain and extend the production PWA checks to prove that the multiplayer chunk is optional and warmed-cache solo flows still work offline. Online controls must fail gracefully without blocking Select Game or a local puzzle.

### Deployment checks

- health and readiness endpoints distinguish process health from database readiness;
- Fly deployment verifies WSS connectivity from the Netlify production origin;
- migrations run as an explicit release step before new server code becomes active;
- the frontend and backend protocol versions reject incompatible clients with a refresh message;
- basic metrics cover connected sockets, active rooms, command latency, rejection counts, reconnects, and database errors.

## Alternatives considered

### Convex

Convex is a credible managed alternative because its client uses WebSockets, reactive queries update automatically, and mutations are transactional. It would reduce infrastructure work but introduce a more provider-specific data and synchronization model. The existing six-game experience and desire for explicit server authority make Node.js, Socket.IO, and Postgres the preferred design. See [Convex realtime](https://docs.convex.dev/realtime) and [Convex architecture](https://docs.convex.dev/understanding/overview).

### Supabase

Supabase provides managed Postgres, authentication, and WebSocket-based Realtime. It becomes attractive when profiles and cross-device history enter scope. Using both a custom authoritative WebSocket server and Supabase Realtime would duplicate responsibilities, so the initial design uses Neon for Postgres and Fly for synchronization. A later move between Neon and Supabase remains a conventional Postgres migration. See [Supabase Realtime](https://supabase.com/docs/guides/realtime) and [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

### Firebase

Firebase Realtime Database offers listeners and strong disconnect/presence primitives, but its client-oriented data model and rules make authoritative Sudoku commands, shared undo, and future server logic less natural than the selected TypeScript server. See [Firebase realtime listeners](https://firebase.google.com/docs/database/web/read-and-write) and [Firebase presence](https://firebase.google.com/docs/database/web/offline-capabilities).

### Fly Postgres and Redis

Fly Managed Postgres has a higher baseline cost than this early workload needs, while Fly's older unmanaged Postgres offering requires self-management. Neon supplies ordinary Postgres in the same London region with a lower entry point. Redis would help cross-instance fan-out later but would not replace durable room storage. See [Fly Managed Postgres](https://fly.io/docs/mpg/) and [Socket.IO's Redis adapter](https://socket.io/docs/v4/redis-adapter/).

## Deferred scope

- Competitive race rooms in which each participant solves a separate board.
- Login profiles, cross-device histories, friends, rankings, or permanent statistics.
- Converting an in-progress solo game into a multiplayer room.
- More than two concurrently connected distinct guests in one room.
- Chat, reactions, player colors, action attribution, host privileges, kicking, or moderation.
- Public room discovery or matchmaking.
- Local-network, WebRTC, Wi-Fi Direct, or Bluetooth multiplayer.
- Multi-region authoritative rooms, multiple Fly Machines, Redis fan-out, or automated horizontal scaling.
