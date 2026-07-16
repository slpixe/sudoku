# Multiplayer Production Rollout Design

## Purpose

Roll out the merged guest-first multiplayer service to Neon, Fly.io, Cloudflare DNS, and Netlify without changing the approved application architecture or exposing production credentials.

## Fixed topology

- Netlify continues serving the offline-first PWA at `https://sudoku.slpixe.com`.
- Fly.io runs the Node.js and Socket.IO service as app `sudoku-multiplayer` in London (`lhr`).
- The public backend and secure WebSocket origin is `https://multi.sudoku.slpixe.com`.
- Neon hosts PostgreSQL in AWS London (`eu-west-2`) using project `sudoku-multiplayer`.
- The initial Fly deployment remains exactly one shared-CPU, 512 MB Machine.

## Fly build-path correction

The first deployment attempt stopped before building because the Dockerfile
path in `server/fly.toml` was written as `server/Dockerfile`. Fly resolves that
setting relative to the directory containing the selected configuration file,
so it looked for the nonexistent `server/server/Dockerfile`.

Keep `server/fly.toml` in place and set its build Dockerfile to `Dockerfile`.
This resolves to the checked-in `server/Dockerfile` while preserving the
repository root as the Docker build context required by the monorepo `COPY`
instructions. Do not move the Fly configuration, change the build context, or
duplicate the Dockerfile path in the deployment command.

Extend the deployment-configuration test to read the configured Dockerfile
path, resolve it relative to `server/fly.toml`, and assert that the resulting
file exists. The correction changes only build-file discovery; topology,
runtime image contents, migrations, secrets, and the deployment wrapper remain
unchanged. After focused tests and independent review pass, retry the same
`pnpm run deploy:multiplayer` command.

## Neon and secrets

The Neon project uses its default production branch, database, and owner role. The pooled TLS connection URL, including `sslmode=require`, is used by both the running service and Fly's release-command migration runner.

Fly Secrets is the only production secret store in this rollout. There is no BWS, 1Password, or runtime secret-fetch integration. The Neon URL is entered through a non-echoing operator flow and imported as the staged Fly secret `DATABASE_URL`; it must never be committed, written to a project `.env` file, pasted into chat, or printed in command output. Netlify never receives database credentials.

## Rollout sequence

1. Authenticate the local Fly CLI and confirm the intended Fly organization.
2. Create `sudoku-multiplayer` without deploying it, validate `server/fly.toml`, and stage `DATABASE_URL` in Fly Secrets.
3. Add the Fly certificate for `multi.sudoku.slpixe.com` and capture the exact DNS records Fly requests.
4. Add only those requested records to `/Users/slpixe/web/me/domains/main.tf` as a small direct commit on `main`, initially DNS-only with automatic TTL, then push to trigger the existing GitLab OpenTofu pipeline.
5. Wait for DNS and Fly certificate validation.
6. Deploy through `pnpm run deploy:multiplayer`, allowing the checked-in release command to run migrations before the single Machine is replaced.
7. Verify one healthy `lhr` Machine and successful `/health`, `/ready`, and aggregate-only `/metrics` responses.
8. Set Netlify Production `VITE_MULTIPLAYER_URL=https://multi.sudoku.slpixe.com`, trigger a production build, and verify the live two-browser WebSocket flow.

The DNS target values are intentionally not guessed. Fly certificate setup and `fly ips list` are the source of truth for A, AAAA, and any ACME validation records.

## Failure handling

- A failed Fly config validation, staged secret import, certificate check, DNS pipeline, migration, readiness check, or browser smoke test stops the rollout before the next provider is changed.
- A failed Fly release migration prevents Machine replacement; inspect release logs before retrying.
- Keep Fly at exactly one Machine. Do not enable HA or rolling multi-Machine deployment for this single-process room queue.
- Do not set the Netlify endpoint until Fly TLS and readiness both succeed.
- If the Netlify build fails, the existing deployed PWA remains available and the backend can remain deployed independently.

## Verification and audit trail

- Record provider resource identifiers and non-secret command results in the deployment report.
- Confirm the domains GitLab pipeline completes before testing public TLS.
- Confirm Fly reports one Machine in `lhr`, the certificate is valid, and all three HTTP endpoints succeed over HTTPS.
- Confirm the production Netlify bundle uses the multiplayer hostname and Solo remains usable offline.
- Confirm two separate browser profiles synchronize a room and a third guest is rejected.
- Update the Sudoku pull request/issue with production verification, without including secrets or connection strings.

## Out of scope

- BWS or any other external secret manager.
- Separate Neon runtime and migration roles.
- Redis, multiple Fly Machines, autoscaling, or multi-region rooms.
- Netlify deploy-preview access to the production multiplayer backend.
- Cloudflare proxying in front of Fly during the initial rollout.
