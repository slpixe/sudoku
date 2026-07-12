# CI Artifact Resilience Design

## Objective

Keep the `Run tests` GitHub Actions workflow green when all required checks pass, even if optional Playwright diagnostic artifacts cannot be uploaded because GitHub Actions storage is full.

## Current behavior

The workflow runs lint, unit tests, type checks, and 82 Playwright end-to-end tests successfully. It then uploads the Playwright HTML report and raw test results with `if: always()`. GitHub currently rejects both uploads because the account artifact-storage quota is full, which marks the otherwise successful workflow as failed and makes the README CI badge red.

## Approved behavior

- Run lint, unit tests, type checks, and Playwright end-to-end tests exactly as today.
- Attempt Playwright artifact uploads only when an earlier workflow step has failed.
- Mark each artifact-upload step `continue-on-error: true` so optional diagnostics cannot change the job conclusion.
- Retain future failure-only artifacts for three days instead of fourteen days.
- Keep summary generation and pull-request commenting behavior unchanged.
- Delete the repository's 110 existing Actions artifacts, which currently occupy 2,550,053,140 bytes (about 2.55 GB).
- Do not change account billing or storage settings as part of this fix.

## Failure semantics

Test, lint, typecheck, build, and Playwright failures remain fatal and keep the workflow red. Artifact-upload failures are non-fatal because artifacts are diagnostic output rather than a correctness gate. On a successful run, neither upload step executes, avoiding additional quota usage.

## Implementation

In `.github/workflows/run_tests.yaml`, change both Playwright artifact upload steps from `if: always()` to `if: failure()`, add `continue-on-error: true`, and change `retention-days` from `14` to `3`. No application source or dependency changes are required.

Delete the existing artifacts through GitHub's repository Actions Artifacts API after recording their count and total size. Deletion is limited to artifacts returned for `slpixe/sudoku`; artifacts belonging to other repositories remain untouched. Verify that the Sudoku artifact count reaches zero before triggering the replacement CI run.

## Verification

- Parse and inspect the workflow diff to confirm only the two upload steps changed.
- Confirm the existing inventory is 110 artifacts totaling 2,550,053,140 bytes, then delete those artifacts and verify the repository artifact count is zero.
- Run `pnpm run lint`, `pnpm test`, `pnpm run typecheck`, and `pnpm run test:e2e` locally.
- Push the workflow commit to `master`.
- Confirm the resulting `Run tests` workflow succeeds on GitHub.
- Confirm the README CI badge resolves to the successful workflow state.

## Out of scope

- Increasing GitHub storage quota.
- Changing test coverage or application behavior.
- Removing Playwright diagnostic artifacts entirely.
