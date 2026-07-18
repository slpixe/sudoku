---
name: deploy
description: Use when asked to deploy, release, publish, verify, or roll back this Sudoku application in production. Provides safe frontend-only and backend-first workflows for Netlify, Fly.io, and Neon.
---

# Deploy Sudoku

## Overview

Safely release this repository to production using the current manual process.
Keep detailed provider commands in `docs/multiplayer-operations.md`; this skill
defines the authority, ordering, safety gates, verification, and reporting.

## Establish authority

- Use this skill for deployment readiness, production verification, release,
  publishing, and rollback requests.
- Treat questions, readiness reviews, and status checks as read-only. Change
  production only when the user explicitly asks to deploy, release, publish,
  or roll back.
- Before acting, read `AGENTS.md` and `docs/multiplayer-operations.md`. Follow
  their current production topology and commands if they have changed since
  this skill was written.
- Never print, commit, or include secrets, database URLs, room codes, guest or
  connection IDs, snapshots, or command payloads in reports.
- Do not add deployment automation or registry publishing to CI.

## Handle read-only requests

For a readiness review, status check, or production verification request,
perform only the requested read-only inspections, report the findings, and
stop. Do not continue into release classification or shared preflight. Do not
push, create or update a pull request, merge, deploy, publish, roll back, change
configuration or secrets, or perform any other release mutation.

## Choose the release path

Use the frontend-only path only when the change cannot affect the multiplayer
backend, Socket.IO protocol, built-in puzzle catalog, database schema, or
deployment configuration. Use the full backend-first path for any of those
changes and whenever compatibility is uncertain.

State the chosen path and why before changing production.

## Complete shared preflight

1. Confirm the intended branch and exact commit. Inspect the worktree and stop
   if unrelated or uncommitted changes make the release ambiguous.
2. Run the checks required by `AGENTS.md` for the change. The baseline is
   typecheck, lint, unit tests, and build; add application and multiplayer e2e
   suites when their documented triggers apply.
3. Push the review branch and open or update its pull request.
4. Wait for all required pull-request checks to pass, including the production
   image build for backend releases. Do not deploy failed or unverified code.
5. Confirm the user has approved the exact release commit and all required
   pull-request reviews are complete. Do not change production before both
   approval gates pass.
6. Record the pull request, exact commit, and non-secret check results for the
   completion report.

## Release frontend-only changes

1. Merge the approved pull request to `master`.
2. Wait for Netlify to publish the intended commit; do not treat a queued or
   building deploy as complete.
3. Wait for post-merge `master` checks and investigate any failure.
4. Smoke-test `https://sudoku.slpixe.com` in a fresh browser context, focusing
   on the changed behavior and checking for console or network errors.
5. Complete cleanup and report the deployment.

## Release backend or coupled changes

1. If the release changes the schema, verify a named Neon snapshot or a
   point-in-time recovery window that covers the rollout. Stop if neither is
   verified. Never delete or rotate a snapshot automatically.
2. Confirm Fly authentication and the expected production application. Verify
   that production currently has exactly one 512 MB Machine in `lhr` and that
   `/ready` succeeds before deployment.
3. Deploy only with `pnpm run deploy:multiplayer`. Do not substitute an ad hoc
   Fly command because the repository entry point disables HA and resets the
   service to one Machine.
4. Verify the release command and migrations succeeded. For a schema release,
   confirm the expected migration record without exposing credentials.
5. Verify Fly inventory and scale state show exactly one Machine total. That
   Machine must have 512 MB, be in `lhr`, be serving, and pass Fly health
   checks. Both `https://multi.sudoku.slpixe.com/health` and
   `https://multi.sudoku.slpixe.com/ready` must succeed.
6. Stop before merging if any backend verification fails. Once the backend is
   healthy, merge the pull request so Netlify publishes the compatible
   frontend.
7. Wait for Netlify to publish the intended commit and for post-merge `master`
   checks to pass.
8. Smoke-test the production application in a fresh browser context. Verify
   the affected frontend behavior and multiplayer selection or connectivity.
   Do not create a production room unless the user explicitly authorizes it.
9. Complete cleanup and report the deployment.

An existing PWA tab may remain controlled by an older service worker. If it
shows the previous interface, verify again in a fresh context and advise the
user to close all site tabs and reopen the site or perform a hard refresh.

## Stop and recover safely

- Stop at a failed local or CI check, missing schema recovery point, failed
  migration, unhealthy backend, or mismatched published commit.
- Never merge or publish a coupled frontend after a failed backend deployment.
- Treat migrations as forward-only and prefer a forward fix.
- Do not run ad hoc down migrations or restore the database automatically.
- Roll back only when explicitly requested, following the rollback procedure
  in `docs/multiplayer-operations.md`. A database restore is a last resort
  because it discards newer room activity.
- Never scale past one Fly Machine until `AGENTS.md` documents a compatible
  distributed architecture.

## Report completion

Report the pull request and deployed commit, checks and image-build result,
database recovery evidence when required, Fly release or image and one-Machine
health, Netlify deploy and published commit, production smoke-test results,
cleanup status, and any limitations. Include no secrets or sensitive IDs.
