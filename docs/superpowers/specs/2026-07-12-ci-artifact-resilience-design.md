# CI Artifact Resilience Design

## Objective

Keep the `Run tests` GitHub Actions workflow green when all required checks pass, even if optional Playwright diagnostic artifacts cannot be uploaded because GitHub Actions storage is full.

## Current behavior

The workflow runs lint, unit tests, type checks, and 82 Playwright end-to-end tests successfully. It then uploads the Playwright HTML report and raw test results with `if: always()`. GitHub currently rejects both uploads because the account artifact-storage quota is full, which marks the otherwise successful workflow as failed and makes the README CI badge red.

## Approved behavior

- Run lint, unit tests, type checks, and Playwright end-to-end tests exactly as today.
- Attempt Playwright artifact uploads only when an earlier workflow step has failed.
- Mark each artifact-upload step `continue-on-error: true` so optional diagnostics cannot change the job conclusion.
- Keep the existing 14-day artifact retention setting.
- Keep summary generation and pull-request commenting behavior unchanged.
- Do not delete Actions artifacts or change account billing/storage settings as part of this fix.

## Failure semantics

Test, lint, typecheck, build, and Playwright failures remain fatal and keep the workflow red. Artifact-upload failures are non-fatal because artifacts are diagnostic output rather than a correctness gate. On a successful run, neither upload step executes, avoiding additional quota usage.

## Implementation

In `.github/workflows/run_tests.yaml`, change both Playwright artifact upload steps from `if: always()` to `if: failure()` and add `continue-on-error: true`. No application source or dependency changes are required.

## Verification

- Parse and inspect the workflow diff to confirm only the two upload steps changed.
- Run `pnpm run lint`, `pnpm test`, `pnpm run typecheck`, and `pnpm run test:e2e` locally.
- Push the workflow commit to `master`.
- Confirm the resulting `Run tests` workflow succeeds on GitHub.
- Confirm the README CI badge resolves to the successful workflow state.

## Out of scope

- Deleting existing GitHub Actions artifacts.
- Increasing GitHub storage quota.
- Changing test coverage or application behavior.
- Removing Playwright diagnostic artifacts entirely.
