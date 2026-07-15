# Multiplayer Presence and UI Polish Design

## Objective

Polish the first collaborative multiplayer experience from issue #38 without changing its authoritative room model or the offline-first solo experience. The update makes room information more compact, gives each guest a lightweight view of the other guest's currently active cell, and improves the Join Existing form hierarchy.

The approved visual direction combines:

- a single compact room-information row above the existing puzzle header;
- a no-fill dashed emerald outline for the other guest's active cell;
- a centered, vertically arranged Join Existing form.

## Scope and state boundaries

This is presence and interface state, not durable puzzle state. The multiplayer backend remains authoritative for values, notes, pause, timer, undo, Clear, and completion. Partner selection is intentionally excluded from:

- the Postgres room snapshot;
- the room revision and command queue;
- undo history;
- action attribution;
- the 24-hour room expiry calculation.

Solo play remains socket-free and fully usable offline. No multiplayer selection state is written into the solo-game repository or browser history. A backend restart may discard active-cell presence without affecting the room's durable game state.

## Multiplayer information row

The multiplayer status appears in a full-width row immediately above the existing puzzle ID, timer, and game controls. Its normal connected presentation is:

`Room: ABC234  •  2/2  [Copy]`

The dot uses the existing connected-state color. The visible button label is **Copy**, with an accessible name such as **Copy room link**.

The row should stay visually compact and on one line at ordinary phone, tablet, and desktop widths. At exceptionally narrow widths it may wrap within the same status container rather than overflow. It must not create a separate line merely to report a successful copy.

Copy behavior is:

1. Copy the complete deep link, including the hash route, to the clipboard.
2. Temporarily replace the button contents with **Copied ✓**.
3. Restore **Copy** after a short delay.
4. Announce success through an existing or new polite live region without adding visible layout height.

If copying fails, the button temporarily shows **Copy failed** and the live region announces the failure. The user can still copy the current address from the browser. Copy success or failure must not add a second visible paragraph.

Connection problems remain meaningful room status rather than copy feedback. Reconnecting, offline, protocol mismatch, and room errors may use a temporary secondary message when a single compact row cannot explain the required recovery action.

## Join Existing form

Choosing **Join existing room** continues to hide the difficulty tabs and puzzle picker. The replacement form is centered within the available selection area and uses this vertical hierarchy:

1. Join Existing heading and short supporting text.
2. Centered **Room code** label.
3. Centered room-code input.
4. Centered **Join room** button underneath the input.
5. Centered inline validation or join error when required.

Activating the mode focuses the input when doing so is appropriate for the current device. The Enter key submits the form. Codes continue to be uppercased and normalized, and an invalid submission preserves the entered code so it can be corrected.

## Partner active-cell presentation

Each guest sees the other connected guest's most recently selected cell as a dashed emerald outline with no background fill. It must not change the existing value colors:

- white for givens;
- orange for entered values;
- small green values for notes.

The current guest's own active cell retains the existing solid teal treatment. If both guests select the same cell, the UI preserves the local solid treatment and adds an inset dashed partner indicator so neither state is lost.

The partner indicator may appear on any selectable cell, including givens. It is hidden while the paused overlay hides the board, then reappears when play resumes if the partner selection is still current. Clear and room-wide undo do not clear either guest's selection because those actions do not replace the puzzle grid.

The cell exposes a stable test hook and an accessible description indicating that the other player has selected it. The design must remain understandable without adding player names, per-player colors, or action authorship.

## Ephemeral selection protocol

The recommended approach is a small server-relayed presence channel alongside the durable room-command channel.

When a connected client changes its active cell, it emits a strictly validated selection event containing the normalized room code and a cell index from 0 through 80. Coordinates may be converted to the index at the client boundary so the wire format has one canonical representation.

The server:

1. Confirms that the socket is a live member of the supplied room.
2. Validates the cell index and rejects malformed or oversized payloads.
3. Records the latest cell in memory under the room and guest ID.
4. Replaces any previous cell for that guest, regardless of which same-guest tab sent it.
5. Broadcasts the resulting partner cell only to sockets belonging to the other guest.

Because rooms have at most two distinct guests, receiving clients do not need a guest identifier or player label. The server event contains the normalized room code for stale-room rejection plus the partner cell index, with `null` reserved for clearing it. Same-guest sockets do not receive one another as a partner and therefore do not display a false second player.

Selection events are independent of durable room revisions and do not enter the per-room mutation queue or database transaction. They may use a lightweight transport rate limit, but normal quick movement across the board should remain responsive. The shared multiplayer protocol version is incremented so an incompatible frontend and backend fail with the existing refresh treatment rather than silently ignoring the new contract.

## Connection, reconnection, and multiple tabs

The guest ID remains shared by tabs in one browser, while each tab retains its own connection ID. The server stores one latest selection per guest, so the latest selection event from any of that guest's tabs wins.

Disconnect rules are based on the guest's active connection count:

- Closing one of several same-guest tabs does not clear the partner indicator.
- When the guest's final live connection closes, the server immediately deletes that guest's selection and sends `null` to the other guest.
- The existing seat-reservation grace period may continue after this point, but a reserved disconnected seat does not retain an active-cell indicator.
- A newly joined or reconnected socket receives the current selection of the other connected guest.

Clients hide stale partner selection whenever their own multiplayer connection is not ready. After reconnecting, a client re-announces its own current local cell, if any. This reconstructs ephemeral selection after a backend restart. With several same-guest tabs reconnecting together, the last valid re-announcement wins by the same rule as ordinary selection.

Leaving the room or navigating to a solo game removes the local partner indicator immediately. The backend's final-socket disconnect handling clears the departing guest for the remaining participant.

## Client integration

The multiplayer room hook owns the transport-facing partner-cell state and exposes:

- the latest partner cell index or `null`;
- an action for announcing a local active-cell change.

The multiplayer game controller converts between the grid's coordinates and the protocol cell index. The generic game view and Sudoku grid accept the partner coordinates as an optional presentation prop. Solo controllers omit the prop, keeping their behavior unchanged.

The client emits only when the selected coordinates actually change and the room connection is ready. It does not optimistically fabricate a partner selection, persist one locally, or replay a queue of selection events after an offline interval; only the current cell is re-announced after a successful reconnect.

## Error handling and accessibility

- Invalid selection events are ignored or rejected without changing room state or disconnecting a well-behaved room unnecessarily.
- A transient selection-delivery failure never blocks values, notes, pause, or other authoritative commands.
- Copy feedback uses a polite live region while keeping the visible feedback inside the button.
- The room code remains selectable text even though the button copies the complete link.
- The partner indicator has sufficient contrast in supported themes and a non-color distinction through its dashed shape.
- Keyboard selection sends the same event as pointer or touch selection.
- The centered Join Existing form retains an explicit label, useful focus treatment, and Enter-key submission.

## Testing

### Protocol and server tests

- accept cell indexes 0 and 80 and reject negative, fractional, out-of-range, malformed, or oversized values;
- reject selection events from a socket that is not a live room member;
- relay a selection only to the other guest's sockets;
- never expose one same-guest tab as another tab's partner;
- replace a guest's stored cell when a later same-guest tab selects a different cell;
- keep selection when one of several same-guest connections closes;
- clear and broadcast `null` when the guest's final connection closes;
- provide the other guest's current selection on join or reconnect;
- keep selection changes out of durable revision, command, undo, and persistence paths.

### Component and client tests

- render a dashed partner-only outline without changing cell fill or value color;
- render both local and inset partner indicators when both guests select the same cell;
- remove partner presentation on `null`, room leave, or non-ready connection state;
- re-announce the current local cell after room reconnection;
- change **Copy** to **Copied ✓** without creating another visible status line, then reset it;
- present copy failure in the same button and announce both outcomes accessibly;
- center the Join Existing input and button while retaining label, normalization, errors, and keyboard submission.

### Browser coverage

Use separate Playwright browser contexts for distinct guests and additional pages for the shared-guest multi-tab case. Cover:

- one guest selecting successive cells and the other seeing only the latest outline;
- both guests selecting the same cell;
- selection by mouse, keyboard, and the existing touch path;
- pause/resume hiding and restoring the indicator;
- disconnect of one same-guest tab versus the final same-guest tab;
- reconnection and active-cell re-announcement;
- the compact room row and in-button copy confirmation;
- the centered Join Existing form and room-code submission;
- unchanged offline solo selection and play.

## Alternatives considered

### Persist partner selection with the room

Putting active cells in Postgres or the authoritative room snapshot would make them survive restarts, but it would create needless writes and revisions, risk showing stale cursors after a long absence, and blur the boundary between game state and presence. It is not selected.

### Stateless broadcast only

Relaying each event without retaining a latest in-memory value is simpler, but a new or reconnecting guest would not know the other guest's current cell. It also makes final-disconnect clearing and same-guest multi-tab behavior less reliable. It is not selected.

### Client-to-client transport

A peer-to-peer channel would add connection negotiation and fallback complexity for a tiny piece of state while the room already requires the authoritative Socket.IO backend. It is not selected.

## Deferred scope

- Multiple partner indicators or rooms with more than two distinct guests.
- Player names, individual cursor colors, action authorship, chat, or reactions.
- Durable active-cell history or cursor playback.
- Pointer trails, live pointer coordinates, or typing indicators.
- Local-network, WebRTC, Wi-Fi Direct, or Bluetooth collaboration.
