# CI Artifact Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep successful CI runs green, retain Playwright diagnostics only for failed runs for three days, remove the existing 2.55 GB of Sudoku artifacts, and verify a green public CI badge.

**Architecture:** Make a focused two-step YAML change to both Playwright upload steps, verify all existing project checks locally, then delete only artifacts returned by the `slpixe/sudoku` repository API. Push the workflow change only after the artifact count reaches zero and monitor the exact resulting workflow run to completion.

**Tech Stack:** GitHub Actions, GitHub Actions Artifacts API, GitHub CLI, pnpm 11.9.0, Vitest, Playwright.

## Global Constraints

- Artifact uploads run only after workflow failure.
- Artifact upload failures are non-fatal.
- Future Playwright artifacts are retained for exactly three days.
- Lint, unit, typecheck, build, and Playwright failures remain fatal.
- Delete only artifacts returned by `GET /repos/slpixe/sudoku/actions/artifacts`.
- Do not delete workflow runs, artifacts belonging to other repositories, or account data.
- Keep summary generation and pull-request commenting unchanged.

---

### Task 1: Make Playwright artifact uploads failure-only and non-fatal

**Files:**
- Modify: `.github/workflows/run_tests.yaml:41-58`

**Interfaces:**
- Consumes: Existing Playwright `playwright-report/` and `test-results/` output directories.
- Produces: Optional three-day diagnostics for failed runs without changing required test conclusions.

- [ ] **Step 1: Capture the current workflow state**

Run:

```bash
git status --short --branch
sed -n '38,70p' .github/workflows/run_tests.yaml
```

Expected: clean `master` ahead of `origin/master` only by the approved design commits; both upload steps use `if: always()` and `retention-days: 14`.

- [ ] **Step 2: Update the HTML report upload step**

Replace the step with:

```yaml
    - name: Upload Playwright HTML report
      id: upload-playwright-report
      if: failure()
      continue-on-error: true
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: playwright-report/
        if-no-files-found: ignore
        retention-days: 3
```

- [ ] **Step 3: Update the traces and videos upload step**

Replace the step with:

```yaml
    - name: Upload Playwright traces and videos
      id: upload-playwright-results
      if: failure()
      continue-on-error: true
      uses: actions/upload-artifact@v4
      with:
        name: playwright-results
        path: test-results/
        if-no-files-found: ignore
        retention-days: 3
```

- [ ] **Step 4: Verify the workflow diff is focused**

Run:

```bash
git diff --check
git diff -- .github/workflows/run_tests.yaml
rg -n 'if: (always|failure)\(\)|continue-on-error|retention-days' .github/workflows/run_tests.yaml
```

Expected: only the two upload steps change; both use `if: failure()`, `continue-on-error: true`, and `retention-days: 3`; the summary and PR-comment steps retain `if: always()`.

- [ ] **Step 5: Run local verification**

Run:

```bash
pnpm run lint
pnpm test
pnpm run typecheck
pnpm run test:e2e
```

Expected: lint and typecheck pass; 117 unit tests pass; 82 Playwright tests pass.

- [ ] **Step 6: Commit the workflow fix**

```bash
git add .github/workflows/run_tests.yaml
git commit -m "ci: make Playwright artifacts failure-only"
```

Expected: one focused workflow commit after the two approved design commits.

### Task 2: Delete existing Sudoku Actions artifacts

**Files:**
- No repository file changes.
- External state: GitHub Actions artifacts owned by `slpixe/sudoku`.

**Interfaces:**
- Consumes: GitHub Actions artifact inventory returned by the Sudoku repository API.
- Produces: Zero stored artifacts for this repository before the replacement CI run.

- [ ] **Step 1: Re-inventory the exact deletion scope before deleting**

Run page summaries:

```bash
gh api '/repos/slpixe/sudoku/actions/artifacts?per_page=100&page=1' --jq '{total_count, page_count: (.artifacts | length), page_bytes: (.artifacts | map(.size_in_bytes) | add // 0)}'
gh api '/repos/slpixe/sudoku/actions/artifacts?per_page=100&page=2' --jq '{total_count, page_count: (.artifacts | length), page_bytes: (.artifacts | map(.size_in_bytes) | add // 0)}'
```

Expected: 110 total artifacts; 100 on page one and 10 on page two; page byte totals sum to 2,550,053,140.

- [ ] **Step 2: Capture all artifact IDs before deletion begins**

Read both complete pages into the execution controller before issuing any delete calls:

```bash
gh api '/repos/slpixe/sudoku/actions/artifacts?per_page=100&page=1' --jq '.artifacts[].id'
gh api '/repos/slpixe/sudoku/actions/artifacts?per_page=100&page=2' --jq '.artifacts[].id'
```

Expected: 110 unique numeric artifact IDs. Do not paginate and delete concurrently because removing page-one objects would shift later pagination.

- [ ] **Step 3: Delete each captured Sudoku artifact**

For every ID captured in Step 2, call:

```bash
gh api --method DELETE /repos/slpixe/sudoku/actions/artifacts/ARTIFACT_ID
```

`ARTIFACT_ID` is the exact numeric ID from the captured API response. Batch requests with bounded concurrency and record any failed ID for one retry. Do not construct IDs or query any other repository.

Expected: 110 successful HTTP 204 responses.

- [ ] **Step 4: Verify artifact storage is empty**

Run:

```bash
gh api '/repos/slpixe/sudoku/actions/artifacts?per_page=1' --jq '{total_count, returned: (.artifacts | length)}'
```

Expected:

```json
{"returned":0,"total_count":0}
```

### Task 3: Push and prove CI readiness

**Files:**
- No additional source changes.

**Interfaces:**
- Consumes: Verified workflow commit and zero-artifact repository state.
- Produces: Synchronized `master`, successful `Run tests` workflow, and green README badge.

- [ ] **Step 1: Push the local commits**

Run:

```bash
git push origin master
```

Expected: GitHub accepts the design and workflow commits as a fast-forward update.

- [ ] **Step 2: Identify the exact workflow run for the pushed tip**

Run:

```bash
git rev-parse HEAD
gh run list --repo slpixe/sudoku --branch master --workflow run_tests.yaml --limit 5 --json databaseId,headSha,status,conclusion,url,createdAt
```

Expected: a new `Run tests` run whose `headSha` equals local `HEAD`.

- [ ] **Step 3: Monitor that run to completion**

Run with the exact run ID returned in Step 2:

```bash
gh run watch RUN_ID --repo slpixe/sudoku --exit-status
```

Expected: the run completes successfully; successful tests skip both artifact upload steps.

- [ ] **Step 4: Verify final repository state**

Run:

```bash
git status --short --branch
gh run view RUN_ID --repo slpixe/sudoku --json status,conclusion,headSha,url,jobs
gh api '/repos/slpixe/sudoku/actions/artifacts?per_page=1' --jq '{total_count, returned: (.artifacts | length)}'
```

Expected: local `master` is synchronized with `origin/master`; the exact run is completed with `success`; artifact count remains zero because uploads are skipped on success. Report the successful run URL as the CI-readiness evidence.
