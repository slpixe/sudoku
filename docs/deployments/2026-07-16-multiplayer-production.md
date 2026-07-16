# Multiplayer production rollout — 2026-07-16

The multiplayer service was released to production on 16 July 2026. This
record contains only non-secret operational evidence. It deliberately omits
credentials, secret digests, room codes, guest and connection identifiers,
private tokens, connection strings, and raw room payloads.

## Production topology

- The static PWA remains at <https://sudoku.slpixe.com> on Netlify and connects
  directly to the Socket.IO service at
  <https://multi.sudoku.slpixe.com>. Netlify does not proxy multiplayer
  traffic.
- Neon project `sudoku-multiplayer` is in AWS London (`eu-west-2`) and uses the
  default `neondb` database. Use of a pooled TLS connection was confirmed. A
  recovery snapshot was confirmed before the first backend deployment.
- Fly application `sudoku-multiplayer` belongs to the `personal` organization
  and runs in London (`lhr`). Its serving topology is exactly one shared-CPU
  Machine with 1 CPU and 512 MB of memory.

## DNS and certificate

- DNS change `937857c` was pushed to the domains repository.
- GitLab OpenTofu pipeline
  [2682111194](https://gitlab.com/slpixe/domains/-/pipelines/2682111194)
  completed successfully.
- Public A and AAAA resolution matched the addresses assigned to the Fly
  application.
- The Fly certificate for `multi.sudoku.slpixe.com` was verified as active and
  issued by Let's Encrypt.

## Backend deployment

- Fly image: `sudoku-multiplayer:deployment-01KXNPHDD8P47ZCJZ8YPCY3T0R`.
- Serving Machine: `83d92dc79224d8`, version 1, state `started`.
- Release command `node server/dist/db/migrate.js` completed successfully.
- Fly reported two passing service checks: `/health` and `/ready`.
- Public `/health` returned HTTP 200 with `cache-control: no-store` and an
  `ok` status.
- Public `/ready` returned HTTP 200 with `cache-control: no-store` and a
  `ready` status.
- Public `/metrics` returned HTTP 200 with `cache-control: no-store`. The
  response contained only aggregate, process-local counters and no room,
  guest, command, or database identifiers.

## Frontend deployment

- Netlify Production was configured with the public
  `VITE_MULTIPLAYER_URL=https://multi.sudoku.slpixe.com` build-time value.
- Production deploy `6a58f357189f415df0a0b140` completed successfully from
  merged `master` commit `96bb603`.
- The immutable deploy is available at
  <https://6a58f357189f415df0a0b140--slpixe-sudoku.netlify.app>.
- After its service worker refreshed, the canonical application displayed the
  Solo, Create online room, and Join existing room choices.

## Product verification

The canonical application created a room over the secure production WebSocket
endpoint. A second distinct protocol client joined as the independent guest,
after which Chrome rendered the full `2/2` presence state and the partner's
selected-cell marker. The following synchronized behavior was verified in
Chrome after each action:

- an authoritative number remained on the shared board;
- shared notes `2` and `4` rendered, and room-wide undo removed both notes;
- pause changed the control to `Resume game`, and resume restored the running
  board and `Pause` control;
- a third distinct guest was rejected with `ROOM_FULL`;
- the independent guest reconnected with a new connection and received the
  current revision and synchronized state;
- reloading Chrome restored the same authoritative state; and
- disconnecting the independent guest returned presence to `1/2` and removed
  the partner selection while retaining the authoritative number.

The production Sudoku page reported no browser-console warnings or errors
during the live checks.

Offline PWA behavior was also verified at both the immutable Netlify deploy
and canonical origins. Each had an active service worker and reloaded under
Chrome offline emulation. On the canonical origin, online room controls showed
the explicit connection requirement and remained disabled, while a built-in
Solo puzzle opened, accepted an edit, and performed local undo. Captured
network events showed no multiplayer-service request while offline, and
network access was restored after the check.

## Rollout deviations and resolutions

The first Fly deployment stopped before building because the Dockerfile path
was resolved relative to the Fly configuration directory. No migration ran and
no Machine was created. Commit `8c369bd` corrected the path, strict Fly
configuration validation passed, and the deployment retry completed
successfully with the single-Machine topology above.

The available Chrome extension exposed only one browser profile. With explicit
operator acceptance, a distinct WebSocket protocol client substituted for the
second Chrome profile and represented the second and third guests. Every
synchronized action was still rendered and checked in Chrome. No rollback was
required.

The operator commands and production facts remain consistent with
[`docs/multiplayer-operations.md`](../multiplayer-operations.md), so the runbook
did not require a rollout-specific amendment.
