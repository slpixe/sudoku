# Multiplayer operations

The public application remains the static Netlify PWA at
`https://sudoku.slpixe.com`. Online rooms use a separate Socket.IO service at
`https://multi.sudoku.slpixe.com`, running on one 512 MB Fly Machine in London
(`lhr`). Durable room state lives in a Neon Postgres project in AWS London
(`eu-west-2`). Netlify never receives the database credentials and does not
proxy WebSocket traffic.

No production resources are created by this repository. The commands below
are an operator runbook. Angle-bracketed placeholders identify non-secret
values such as the Fly organization or an image reference. Production secrets
must be read from an approved secret manager using the non-echoing flow below;
never paste them into a command line, shell history, file, or transcript.

## Why production must have one Fly Machine

Postgres is the durable source of truth, but presence, reconnect seat
reservations, and the per-room command queue are held in the Node process.
Running two Machines today could admit more than two distinct guests, split a
room's Socket.IO broadcasts, or process commands outside the same in-process
queue. Keep the app at exactly one Machine after every deploy.

Horizontal scaling requires a compatible cross-instance Socket.IO adapter,
distributed presence and reconnect reservations, and cross-instance command
serialization or locking. Postgres must remain authoritative, with its room
revision used as the final concurrency guard. Do not increase the Machine
count until those pieces and multi-instance tests exist.

## 1. Create the Neon database

1. In the Neon console, create a production project in **AWS London
   (`eu-west-2`)**.
2. Create or select the production database and an application role with only
   the privileges needed for that database.
3. In **Connect**, enable connection pooling and copy the TLS connection
   string. A pooled Neon hostname contains `-pooler`; retain its
   `sslmode=require` query parameter.
4. Store the value in an approved secret manager as the production
   `DATABASE_URL`. Do not put it in `.env`, Fly configuration, CI output,
   documentation, screenshots, or shell transcripts.
5. Before the first release and every schema-changing release, create a named
   Neon snapshot (or verified point-in-time restore point) and confirm its
   retention covers the rollout window.

The application and the migration runner both use `DATABASE_URL`. The checked-
in runner uses ordinary SQL transactions and does not depend on session state,
so this project uses the pooled connection string for the Fly runtime and its
release command.

Migrations are sorted from `server/migrations`, recorded in
`schema_migrations`, and applied once per file inside a transaction. Build the
runner, then load the connection string directly from the approved secret
manager into an exported environment variable. The example below uses the
1Password CLI; use the equivalent non-echoing read command for the deployed
secret manager. Do not enable shell xtrace (`set -x`) around secret handling.
The subshell and cleanup trap prevent the value from surviving the operation:

```bash
pnpm --filter @sudoku/multiplayer-server build
(
  set -e
  set +x
  export DATABASE_URL="$(op read 'op://Production/Sudoku Neon/DATABASE_URL')"
  trap 'unset DATABASE_URL' EXIT HUP INT TERM
  test -n "$DATABASE_URL"
  pnpm --filter @sudoku/multiplayer-server migrate
  unset DATABASE_URL
  trap - EXIT HUP INT TERM
)
```

That manual command is for a controlled connectivity check or recovery. The
normal production path is the Fly release command already declared in
`server/fly.toml`:

```text
node server/dist/db/migrate.js
```

Fly runs it from the newly built image before replacing the serving Machine; a
non-zero exit stops the deployment.

## 2. Create and configure the Fly app

Install and authenticate `flyctl`, then run these commands from the repository
root. Creating the app does not deploy it:

```bash
fly apps create sudoku-multiplayer --org '<FLY_ORGANIZATION>'
fly config validate --strict --config server/fly.toml
(
  set -e
  set +x
  export DATABASE_URL="$(op read 'op://Production/Sudoku Neon/DATABASE_URL')"
  trap 'unset DATABASE_URL' EXIT HUP INT TERM
  test -n "$DATABASE_URL"
  printf '%s\n' "DATABASE_URL=$DATABASE_URL" | fly secrets import --stage --app sudoku-multiplayer
  unset DATABASE_URL
  trap - EXIT HUP INT TERM
)
fly secrets list --app sudoku-multiplayer
```

`fly secrets import` reads the `NAME=value` record from standard input. The
database URL is never a process argument or history entry, and `--stage`
prevents secret configuration from causing an early deployment. Fly reports
the secret name, not its value; still keep xtrace disabled until the variable
has been unset.

`server/fly.toml` fixes the primary region to `lhr`, the service port to 8080,
the VM to one shared CPU and 512 MB, the inactive-room TTL to 24 hours, the
reconnect reservation to 60 seconds, and the only production browser origin to
`https://sudoku.slpixe.com`. Keep production origins exact; do not add `*` or
preview/local origins to the production app.

Attach the public hostname and follow Fly's generated DNS instructions rather
than guessing record values:

```bash
fly certs add multi.sudoku.slpixe.com --app sudoku-multiplayer
fly certs setup multi.sudoku.slpixe.com --app sudoku-multiplayer
fly ips list --app sudoku-multiplayer
fly certs check multi.sudoku.slpixe.com --app sudoku-multiplayer
```

Add the exact A/AAAA or validation records printed by `fly certs setup` at the
authoritative DNS provider. Wait until `fly certs check` reports valid DNS and
certificate state.

Create a Neon snapshot, then deploy through the checked-in single-instance
wrapper:

```bash
pnpm run deploy:multiplayer
fly scale show --app sudoku-multiplayer
fly status --app sudoku-multiplayer
fly checks list --app sudoku-multiplayer
```

The wrapper runs `fly deploy --ha=false --config server/fly.toml` followed by
`fly scale count 1 --config server/fly.toml`. Do not replace it with a bare
first deploy: Fly otherwise creates redundant Machines for a service by
default. The final scale output must show one Machine in `lhr` with 512 MB.

## 3. Configure Netlify

In the existing Netlify site for `sudoku.slpixe.com`, add this build-time
variable to the **Production** deploy context:

```text
VITE_MULTIPLAYER_URL=https://multi.sudoku.slpixe.com
```

It is a public endpoint, not a secret. Trigger a new production frontend build
only after the Fly certificate is valid and `/ready` succeeds. Deploy previews
should use a separately configured backend/origin when needed; the production
backend deliberately rejects Netlify preview origins.

## Health, readiness, and metrics

The service returns no-cache JSON:

- `GET /health` is process liveness and does not query Postgres.
- `GET /ready` is readiness and returns 200 only when Postgres answers a ping;
  database failure returns 503.
- `GET /metrics` returns process-local aggregate JSON: connected sockets,
  active rooms, command count and latency, rejection counts, reconnects, and
  database errors. Counters reset when the Machine restarts.

Both `/health` and `/ready` are Fly checks. With one Machine, a failed readiness
check intentionally removes the unavailable service from routing; Solo play on
Netlify remains unaffected.

```bash
curl -fsS https://multi.sudoku.slpixe.com/health
curl -fsS https://multi.sudoku.slpixe.com/ready
curl -fsS https://multi.sudoku.slpixe.com/metrics
fly checks list --app sudoku-multiplayer
fly logs --app sudoku-multiplayer
```

Alert on readiness failures, repeated `database_error` events, increasing
rejection or reconnect counts, sustained command-latency growth, and unexpected
Machine count or region changes. Metrics are intentionally aggregate and must
not be extended with room codes, guest IDs, connection IDs, puzzle snapshots,
commands, database URLs, secrets, or raw request bodies.

Production logs are structured operational events only. Before sharing logs or
artifacts, search for and redact connection strings, authorization values,
room capability codes, guest/connection IDs, and DNS ownership tokens. Never
turn on payload logging to diagnose a live room. Delete local transcripts,
temporary `.env` files, database dumps, and screenshots containing credentials
after the incident or rollout.

## Room lifecycle and catalog safety

Guest identity is registration-free. Each browser profile stores one opaque
UUID under `sudoku-multiplayer-guest-id` in local storage. Two distinct guest
IDs consume the room's two seats; additional tabs from the same browser profile
reuse that guest's seat. When the final connection for a guest drops, its seat
is reserved for 60 seconds.

Values, notes, timer state, pause/resume, hint, undo, completion, and confirmed
Clear are shared authoritative room state. Clear removes all entered values and
shared notes, resets timer and completion state, resumes the room, and clears
room-wide undo history; it is not undoable.

Creation, joins, and accepted commands refresh a room's 24-hour expiry. When
the last connection leaves, the room remains resumable for 24 hours. Cleanup
runs at server startup and every 15 minutes, deleting only expired rooms that
are not present in process memory; foreign-key cascades remove their processed
commands and undo actions.

The files in `sudokus/easy.txt`, `medium.txt`, `hard.txt`, `expert.txt`, and
`evil.txt` are a static multiplayer catalog. Collection ID, one-based line
number, and the 81-character givens line form the creation fingerprint. Never
reorder, replace, or delete deployed lines; append new puzzles only. Deploy
frontend and backend from compatible catalog revisions. Existing rooms retain
their stored givens and solution.

## Forward-only rollout and rollback

Migrations are forward-only: add a new numbered SQL file and use expand/
contract changes so the previous server image remains compatible during the
rollback window. Never edit an applied migration, delete a
`schema_migrations` row, or run an improvised down migration in production.

For an application regression with a compatible database, find the preceding
image and redeploy it while retaining one Machine:

```bash
fly releases --image --app sudoku-multiplayer
fly deploy --image '<PREVIOUS_FLY_IMAGE_REFERENCE>' --ha=false --config server/fly.toml
fly scale count 1 --config server/fly.toml
```

If a migration is faulty but data is intact, prefer a new forward migration
and release. Restore the pre-release Neon snapshot only for destructive or
corrupting changes: stop writes, preview and verify the restore point, restore
the production branch in Neon, wait for all restore operations to finish, then
deploy the compatible image and restore exactly one Machine. A database restore
discards room changes made after the restore point, so record that impact and
use it only as a last resort.

## Local development and verification

Install once from the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
```

For the disposable accelerated local multiplayer backend (the in-memory room
repository) and host-mode frontend, use two terminals. The test harness
requires a reconnect grace from 0 to 5 seconds, so local review uses 1 second;
production remains 60 seconds. The backend port is strict because startup
fails if 8080 is already occupied, and Vite is explicitly strict on port 3000:

```bash
NODE_ENV=test PORT=8080 RECONNECT_GRACE_SECONDS=1 pnpm --filter @sudoku/multiplayer-server start:test
```

```bash
VITE_MULTIPLAYER_URL=http://127.0.0.1:8080 pnpm exec vite --host 0.0.0.0 --port 3000 --strictPort
```

Verify both listeners before browser review:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
lsof -nP -iTCP:3000 -sTCP:LISTEN
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/ready
curl -I --max-time 5 http://127.0.0.1:3000/
```

Use two separate browser profiles/contexts for two distinct guests; two tabs in
one profile deliberately represent the same guest. Stop both local servers
when the review is complete.

Run the complete checks from the repository root:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm build
pnpm run test:e2e
pnpm run test:e2e:multiplayer
docker build -f server/Dockerfile -t sudoku-multiplayer:verify .
```

The standard Playwright suite excludes the dedicated multiplayer file. The
multiplayer suite starts isolated in-memory/Socket.IO and Vite servers on
worktree-derived ports and uses separate browser contexts. If the local
container engine is unavailable, report the Docker check as not run and rely
on the non-publishing `Build multiplayer image` CI job; never claim it passed
locally.
