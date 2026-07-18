# Deployment Skill Design

## Purpose

Add a repository-local, agent-agnostic deployment skill that gives future AI
sessions a safe operational checklist for releasing Sudoku. The skill records
the deployment stages that are currently spread across project instructions
and the multiplayer operations runbook without introducing CI/CD automation.

## Portable skill format

The skill lives at `.agents/skills/deploy/SKILL.md`. It uses the conventional
`SKILL.md` filename and contains only portable Markdown instructions with YAML
frontmatter. Do not add vendor-specific metadata such as
`agents/openai.yaml`, executable deployment scripts, or provider integrations.

The detailed infrastructure runbook remains
`docs/multiplayer-operations.md`. The skill links to that runbook instead of
duplicating setup details that could drift.

## Trigger and authority

Use the skill when the user asks to deploy, release, publish, verify a
production deployment, or perform a rollback. A question about deployment or
a request to review deployment readiness is read-only and does not authorize
production changes. Mutating production requires an explicit deploy, publish,
release, or rollback request.

For a read-only readiness, status, or production verification request, the
operator performs only the requested inspections, reports the findings, and
stops before release classification or preflight. Read-only handling must not
push, create or update a pull request, merge, deploy, publish, roll back, change
configuration or secrets, or perform another release mutation.

The skill classifies each release before acting:

- A frontend-only release uses the shortened Netlify path.
- A multiplayer backend, protocol, catalog, or database change uses the full
  backend-first path.
- An ambiguous or coupled release uses the full path.

## Shared preflight

Before either release path, the operator must:

1. Read `AGENTS.md` and `docs/multiplayer-operations.md`.
2. Confirm the intended branch and commit, inspect the worktree, and stop for
   unrelated or uncommitted changes that make the release ambiguous.
3. Confirm that no secrets will be printed, committed, or placed in reports.
4. Run the local checks appropriate to the change.
5. Push the review branch and open or update its pull request.
6. Wait for required pull-request checks, including the production image build
   when applicable, to pass.
7. Confirm that the user approved the exact release commit and all required
   pull-request reviews are complete before changing production.
8. Stop rather than changing production for code whose checks failed, whose
   intended commit is unclear, or whose approval gates remain incomplete.

## Frontend-only release

For a release that cannot affect the multiplayer backend, protocol, puzzle
catalog, or schema:

1. Merge the approved pull request so Netlify publishes from `master`.
2. Confirm that Netlify published the intended commit.
3. Smoke-test the production site in a fresh browser context.
4. Complete local cleanup and report the result.

## Full backend-first release

For multiplayer or coupled changes:

1. For a schema release, verify that a named Neon snapshot or point-in-time
   recovery window exists and covers the rollout. Stop if neither can be
   verified. Never delete or rotate a snapshot automatically.
2. Confirm Fly authentication, the expected production application, exactly
   one 512 MB Machine in `lhr`, and a healthy pre-deploy `/ready` response.
3. Deploy only through `pnpm run deploy:multiplayer`. This preserves the
   immediate replacement strategy, release-command migrations, and reset to
   one Machine.
4. Verify the release command and migration outcome. Verify Fly inventory and
   scale state show exactly one Machine total; that Machine must have 512 MB,
   be in `lhr`, be serving, and pass Fly health checks. Verify `/health` and
   `/ready`. When the schema changed, also verify the migration record without
   exposing credentials.
5. Stop before merging if the backend is unhealthy. If it is healthy, merge
   the pull request so Netlify publishes the compatible frontend.
6. Confirm that Netlify published the intended commit and that post-merge
   `master` checks pass.
7. Smoke-test the live application in a fresh browser context. Verify the
   affected frontend behavior and multiplayer selection or connectivity, but
   do not create production rooms unless the user explicitly authorizes that
   test.
8. Complete local cleanup and report the result.

Fresh-browser verification is required because an existing PWA tab may remain
controlled by an older service worker. If the old interface persists, advise
closing all site tabs and reopening the site or performing a hard refresh.

## Failure and rollback behavior

- A failed CI check, missing database recovery point, failed migration,
  unhealthy backend, or mismatched published commit stops the release before
  the next stage.
- Do not merge or publish a coupled frontend after a failed backend deployment.
- Treat migrations as forward-only and prefer a forward fix.
- Do not run an ad hoc down migration or restore a database automatically.
- Follow the rollback section of `docs/multiplayer-operations.md` only when the
  user explicitly requests rollback. Database restoration remains a last
  resort because it discards newer room activity.
- Keep production at exactly one Fly Machine until the architecture documented
  in `AGENTS.md` changes.

## Completion report

The final deployment report records, without secrets:

- pull request and deployed commit;
- checks and image-build result;
- database recovery evidence when required;
- Fly release or image identifier and one-Machine health verification;
- Netlify deploy and published commit;
- production smoke-test results; and
- cleanup status and any limitations.

## Out of scope

- Automated deployment or registry publishing in CI.
- A deployment shell script or other one-command automation.
- Changes to branch protection, GitHub Actions, Fly, Neon, or Netlify policy.
- Duplicating infrastructure provisioning or incident procedures from the
  canonical operations runbook.
